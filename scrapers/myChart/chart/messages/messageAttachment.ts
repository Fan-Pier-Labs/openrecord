/**
 * One file attached to a message: the bytes MyChart holds for it.
 *
 * The thread endpoints only describe an attachment — `name`, `fileExtension`,
 * a `dcsId` — and never carry its content. The portal downloads it the way its
 * `useDcsDocument` hook (`epic.px.client.document-viewer.js`) does:
 *
 *   POST /api/documents/viewer/GetDocumentDetailsLegacy
 *        { dcsId, fileExtension, organizationId, useOldMobileLink: false }
 *   GET  <downloadUrl>          e.g. /Documents/ViewDocument/Download?dcsid=…&displayName=…&dcsExt=…
 *
 * The details call answers `{ downloadUrl, previewUrl, mimeType, allowPreview,
 * displayName, fileDescription, legacyEncryption, … }`; `downloadUrl` is
 * mount-relative and the GET streams the file with its real `Content-Type`
 * and a `Content-Disposition: attachment; filename="…"`. Measured on two
 * instances across PDF, PNG and JPG attachments.
 *
 * Two traps, both verified on the same two instances. An id the record does
 * not hold gets **200 with a literal JSON `null`** from the details call — the
 * GetConversationDetails pattern again — and a bogus id on the download GET
 * gets **200 with an empty body and no Content-Type**. Neither is a status
 * code, so both are checked on the payload.
 *
 * Only `MessageDocType.DCS` (`type: 2`) attachments go this way; every one
 * captured so far is. An ETX attachment (`type: 1`, a clinical reference the
 * portal renders as a popup via `GetClinicalReferenceDetails`) and a
 * community-jump attachment (`legacyUrlForCommunityJump`, another
 * organization's portal) have not been observed on any instance, so they are
 * refused with a reason rather than guessed at.
 */
import { makeAuthenticatedRequest } from '../../core/makeAuthenticatedRequest';
import type { MyChartRequest } from '../../core/myChartRequest';
import type { RequestConfig } from '../../core/types';
import { RawCollector, describeResponseFailure } from '../../core/rawResponse';
import { list, rec, text } from '../../processors/read';
import { fetchConversationThreadRaw } from './messageThreads';

/** A downloaded attachment: the file, and what the thread said about it. */
export interface MessageAttachmentFile {
  conversationId: string;
  /** The attachment's `dcsId`, the handle `get_message_thread` shows. */
  dcsId: string;
  /** The file name as the thread lists it, e.g. `results.pdf`. */
  name: string;
  /** MyChart's extension for it, upper-case (`PDF`, `PNG`, `JPG`). */
  fileExtension: string;
  /** From the details call, falling back to the download's Content-Type. */
  mimeType: string;
  bytes: Uint8Array;
}

/** What the thread says about one attachment, as MyChart sent it. */
interface ThreadAttachment {
  dcsId: string;
  etxId: string;
  name: string;
  fileExtension: string;
  type: number;
  organizationId: string;
  legacyUrlForCommunityJump: string;
}

const DCS_DOC_TYPE = 2;

function threadAttachments(threadRaw: { requests: Array<{ body: unknown }> }): ThreadAttachment[] {
  const out: ThreadAttachment[] = [];
  for (const request of threadRaw.requests) {
    for (const message of list(rec(request.body).messages)) {
      for (const value of list(rec(message).attachments)) {
        const a = rec(value);
        out.push({
          dcsId: text(a.dcsId),
          etxId: text(a.etxId),
          name: text(a.name),
          fileExtension: text(a.fileExtension),
          type: typeof a.type === 'number' ? a.type : -1,
          organizationId: text(a.organizationId),
          legacyUrlForCommunityJump: text(a.legacyUrlForCommunityJump),
        });
      }
    }
  }
  // A message can appear on the details page and on a paged response.
  return out.filter((a, i) => out.findIndex((b) => b.dcsId === a.dcsId && b.name === a.name) === i);
}

function describeAvailable(attachments: ThreadAttachment[]): string {
  if (attachments.length === 0) return 'That conversation has no attachments.';
  return (
    'The attachments on that conversation are: ' +
    attachments.map((a) => `${a.name || '(unnamed)'} (attachment_id ${a.dcsId || a.etxId || '?'})`).join(', ') +
    '.'
  );
}

/**
 * Download the attachment `attachmentId` (its `dcsId`) from conversation
 * `conversationId`. Reads the thread first, so the attachment's own
 * `fileExtension` and `organizationId` go into the details call exactly as
 * the portal would send them, and so an id from the wrong conversation is a
 * clear refusal rather than a mystery download.
 */
export async function downloadMessageAttachment(
  mychartRequest: MyChartRequest,
  conversationId: string,
  attachmentId: string,
): Promise<MessageAttachmentFile> {
  const threadRaw = await fetchConversationThreadRaw(mychartRequest, conversationId);
  const details = threadRaw.requests.find((r) => r.path.includes('GetConversationDetails'));
  if (!details || details.body === null || typeof details.body !== 'object') {
    throw new Error(
      `No conversation ${conversationId} on the active patient record. Check the id from get_messages, and that the right patient is active.`,
    );
  }

  const attachments = threadAttachments(threadRaw);
  const attachment = attachments.find((a) => a.dcsId === attachmentId || (a.etxId !== '' && a.etxId === attachmentId));
  if (!attachment) {
    throw new Error(`No attachment ${attachmentId} on conversation ${conversationId}. ${describeAvailable(attachments)}`);
  }
  if (attachment.legacyUrlForCommunityJump) {
    throw new Error(
      `${attachment.name} is held by another organization's portal (a community link), which this account cannot download from here.`,
    );
  }
  if (attachment.type !== DCS_DOC_TYPE || !attachment.dcsId) {
    throw new Error(
      `${attachment.name} is not a downloadable document (MyChart type ${attachment.type}); only file attachments (type ${DCS_DOC_TYPE}) are supported.`,
    );
  }

  const collector = new RawCollector(mychartRequest);
  const token = await collector.pageToken('/app/communication-center');
  const documentDetails = await collector.postJson('/api/documents/viewer/GetDocumentDetailsLegacy', token, {
    dcsId: attachment.dcsId,
    fileExtension: attachment.fileExtension,
    organizationId: attachment.organizationId,
    useOldMobileLink: false,
  });
  // A literal `null` is MyChart saying the record does not hold this document.
  if (documentDetails === null || typeof documentDetails !== 'object') {
    throw new Error(
      `MyChart has no document ${attachment.dcsId} on the active patient record, although the thread lists it. Check that the right patient is active.`,
    );
  }
  const downloadUrl = text(rec(documentDetails).downloadUrl);
  if (!downloadUrl) {
    throw new Error(`MyChart returned no download link for ${attachment.name}; it may not be downloadable from the portal either.`);
  }

  const config: RequestConfig = { path: downloadUrl.startsWith('/') ? downloadUrl : `/${downloadUrl}` };
  const response = await makeAuthenticatedRequest(mychartRequest, config);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const contentType = response.headers.get('content-type') ?? '';
  const failure = describeResponseFailure(response, contentType.includes('text/html') ? textOf(bytes) : '', config);
  if (failure) {
    throw new Error(`MyChart answered the download of ${attachment.name} with ${failure}; nothing was downloaded.`);
  }
  // The bogus-id answer: 200, no Content-Type, no body. Also catches a login
  // page where a file should be, which makeAuthenticatedRequest would have
  // retried once already.
  if (bytes.length === 0 || contentType.includes('text/html')) {
    throw new Error(
      `MyChart answered the download of ${attachment.name} with ${bytes.length === 0 ? 'an empty body' : 'a web page instead of the file'}; nothing was downloaded.`,
    );
  }

  const mimeType = text(rec(documentDetails).mimeType) || contentType.split(';')[0]!.trim();
  return {
    conversationId,
    dcsId: attachment.dcsId,
    name: attachment.name,
    fileExtension: attachment.fileExtension,
    mimeType,
    bytes,
  };
}

function textOf(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes.subarray(0, 4096));
}
