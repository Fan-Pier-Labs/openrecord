/**
 * One file attached to a message: the bytes MyChart holds for it.
 *
 * The thread endpoints only describe an attachment — `name`, `fileExtension`,
 * a `dcsId` — and never carry its content. The bytes come from Epic's DCS blob
 * store, the same one Document Center documents use; the exchange and its
 * traps are in [`core/dcsDocument.ts`](../../core/dcsDocument.ts). This module
 * owns the half that is attachment-specific: finding the attachment on its
 * thread, refusing the kinds that do not go through DCS, and wording a refusal
 * in terms of the conversation the caller named.
 *
 * The portal's message viewer (`useDcsDocument` with `legacyEncryption`)
 * sends `GetDocumentDetailsLegacy` and `useOldMobileLink: false`, so that is
 * what this sends. Measured across PDF, PNG and JPG attachments on two
 * instances; the legacy and non-legacy variants returned identical bytes on a
 * third, differing only in `legacyEncryption` and the link's name.
 *
 * Only `MessageDocType.DCS` (`type: 2`) attachments go this way; every one
 * captured so far is. An ETX attachment (`type: 1`, a clinical reference the
 * portal renders as a popup via `GetClinicalReferenceDetails`) and a
 * community-jump attachment (`legacyUrlForCommunityJump`, another
 * organization's portal) have not been observed on any instance, so they are
 * refused with a reason rather than guessed at.
 */
import type { MyChartRequest } from '../../core/myChartRequest';
import { RawCollector } from '../../core/rawResponse';
import { DcsDocumentError, fetchDcsFile } from '../../core/dcsDocument';
import { safeFileName } from '../../core/safeFileName';
import type { FilePayload } from '../../core/filePayload';
import { list, rec, text } from '../../processors/read';
import { fetchConversationThreadRaw } from './messageThreads';

/**
 * A downloaded attachment: the file, and what the thread said about it.
 * `fileName` is the name the thread lists (e.g. `results.pdf`) made safe;
 * `mimeType` is from the details call, falling back to the download's
 * Content-Type.
 */
export interface MessageAttachmentFile extends FilePayload {
  conversationId: string;
  /** The attachment's `dcsId`, the handle `get_message_thread` shows. */
  dcsId: string;
  /** MyChart's extension for it, upper-case (`PDF`, `PNG`, `JPG`). */
  fileExtension: string;
}

/** `attachment.pdf` — what an attachment the thread left unnamed is called. */
function extensionFallback(fileExtension: string): string {
  const extension = fileExtension.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  return extension ? `attachment.${extension}` : 'attachment';
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

  try {
    const file = await fetchDcsFile(mychartRequest, collector, token, {
      dcsId: attachment.dcsId,
      fileExtension: attachment.fileExtension,
      organizationId: attachment.organizationId,
      useOldMobileLink: false,
      legacy: true,
    });
    return {
      conversationId,
      dcsId: attachment.dcsId,
      fileExtension: attachment.fileExtension,
      // The thread's own name (`results.pdf`) beats the store's `displayName`,
      // which is a system name like `MyChart_Document_1` — and when the thread
      // named it nothing, the extension alone beats that system name too.
      fileName: safeFileName(attachment.name, extensionFallback(attachment.fileExtension)),
      mimeType: file.mimeType,
      bytes: file.bytes,
    };
  } catch (error) {
    if (!(error instanceof DcsDocumentError)) throw error;
    const { failure } = error;
    if (failure.reason === 'no_such_document') {
      throw new Error(
        `MyChart has no document ${attachment.dcsId} on the active patient record, although the thread lists it. ` +
          'Check that the right patient is active.',
      );
    }
    if (failure.reason === 'not_released') {
      throw new Error(
        `MyChart returned no download link for ${attachment.name}; it may not be downloadable from the portal either.`,
      );
    }
    throw new Error(`MyChart answered the download of ${attachment.name} with ${failure.detail}; nothing was downloaded.`);
  }
}
