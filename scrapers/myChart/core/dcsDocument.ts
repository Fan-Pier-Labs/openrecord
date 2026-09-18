/**
 * Epic's DCS blob store: the two-step every downloadable file in MyChart goes
 * through, whichever activity filed it.
 *
 *   POST /api/documents/viewer/GetDocumentDetails[Legacy]
 *        { dcsId, fileExtension, organizationId, useOldMobileLink }
 *   GET  <downloadUrl>   /Documents/ViewDocument/Download[OrStream]?dcsid=…&displayName=…&dcsExt=…
 *
 * Two producers reach it — a message attachment (`chart/messages/messageAttachment.ts`)
 * and a Document Center document (`chart/documents/documentDownload.ts`) — and
 * they differ only in how they find a `dcsId`, never in what happens after. The
 * exchange lives here so the traps below are checked in one place; the third
 * producer gets them for free.
 *
 * **The variants are the same store.** `GetDocumentDetails` and its `…Legacy`
 * sibling answered identically on a live account across every file type —
 * same bytes, same length, same `mimeType` and `displayName` — differing only
 * in `legacyEncryption` and whether the link is `Download` or
 * `DownloadOrStream`. Each portal hook sends its own `useOldMobileLink` (the
 * Document Center `true`, the message viewer `false`), and no measurement
 * showed it changing the answer; each caller sends what its own hook sends
 * rather than the fake agreement of a value nobody verified.
 *
 * **`fileExtension` is ignored.** Measured five ways on one live instance —
 * correct, empty, omitted, wrong, and `dcsId` alone — every variant returned
 * the same file. A caller that has the extension passes it (it is what the
 * portal sends); a caller that would have to go and look one up should not.
 *
 * Three traps, none of them a status code, all checked on the payload:
 *   - an id the record does not hold answers **200 with a literal JSON `null`**
 *   - a document MyChart holds but will not release answers with `downloadUrl`
 *     and `token` both empty (1 of 42 on the captured account), and its
 *     `previewUrl` then streams **200 with an empty body**
 *   - a bogus download link answers **200 with an empty body and no
 *     Content-Type**
 */
import { makeAuthenticatedRequest } from './makeAuthenticatedRequest';
import type { MyChartRequest } from './myChartRequest';
import type { RequestConfig } from './types';
import { describeResponseFailure, type RawCollector } from './rawResponse';
import { safeFileName } from './safeFileName';
import { rec, text } from './read';

/** Why a `dcsId` produced no file. Callers word the refusal in their own terms. */
export type DcsFailure =
  /** A literal `null`: this record holds no such document. */
  | { reason: 'no_such_document' }
  /** Held, but MyChart serves no file for it — `downloadUrl` and `token` empty. */
  | { reason: 'not_released'; displayName: string }
  /** MyChart answered the download with something that is not the file. */
  | { reason: 'download_failed'; displayName: string; detail: string };

export interface DcsFile {
  /** `Content-Disposition`'s name, made safe. */
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  /** MyChart's own name for the file, before it was made safe. */
  displayName: string;
}

export class DcsDocumentError extends Error {
  constructor(readonly failure: DcsFailure, message: string) {
    super(message);
    this.name = 'DcsDocumentError';
  }
}

export interface DcsRequest {
  dcsId: string;
  /** Ignored by MyChart; send what the portal's own hook would send. */
  fileExtension: string;
  organizationId: string;
  /** The Document Center sends `true`, the message viewer `false`. */
  useOldMobileLink: boolean;
  /** `true` picks `GetDocumentDetailsLegacy`, as the message viewer does. */
  legacy: boolean;
}

/**
 * `Content-Disposition: attachment; filename="Visit Summary.pdf"` — the name a
 * browser would save, extension included. Preferred over building one from
 * `displayName`, whose extension is inconsistent: it carried `.pdf` on some
 * documents and nothing on others, while the header had it every time.
 */
function dispositionFileName(header: string): string {
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header);
  return match ? decodeURIComponent(match[1]!.trim()) : '';
}

/** `?dcsExt=PDF` off the download link, lower-cased, for the fallback name. */
function extensionFrom(downloadUrl: string): string {
  const match = /[?&]dcsExt=([^&]+)/i.exec(downloadUrl);
  return match ? decodeURIComponent(match[1]!).replace(/[^a-zA-Z0-9]/g, '').toLowerCase() : '';
}

/**
 * Fetch one DCS blob. Records the details POST into `collector` (so `raw` mode
 * shows the exchange) and throws {@link DcsDocumentError} with a machine-
 * readable `failure` when there is no file — the caller owns the wording,
 * because only it knows what the id it was given is called.
 */
export async function fetchDcsFile(
  mychartRequest: MyChartRequest,
  collector: RawCollector,
  token: string,
  request: DcsRequest,
): Promise<DcsFile> {
  const details = await collector.postJson(
    `/api/documents/viewer/GetDocumentDetails${request.legacy ? 'Legacy' : ''}`,
    token,
    {
      dcsId: request.dcsId,
      fileExtension: request.fileExtension,
      organizationId: request.organizationId,
      useOldMobileLink: request.useOldMobileLink,
    },
  );
  if (details === null || typeof details !== 'object') {
    throw new DcsDocumentError({ reason: 'no_such_document' }, `MyChart has no document ${request.dcsId} on the active patient record.`);
  }

  const body = rec(details);
  const displayName = text(body.displayName) || text(body.fileDescription);
  const downloadUrl = text(body.downloadUrl);
  if (!downloadUrl) {
    throw new DcsDocumentError(
      { reason: 'not_released', displayName },
      `MyChart serves no file for ${displayName || request.dcsId}.`,
    );
  }

  const config: RequestConfig = { path: downloadUrl.startsWith('/') ? downloadUrl : `/${downloadUrl}` };
  const response = await makeAuthenticatedRequest(mychartRequest, config);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const contentType = response.headers.get('content-type') ?? '';
  const declaredMime = text(body.mimeType);

  const fail = (detail: string) => {
    throw new DcsDocumentError({ reason: 'download_failed', displayName, detail }, detail);
  };
  const failure = describeResponseFailure(response, new TextDecoder().decode(bytes.subarray(0, 4096)), config);
  if (failure) fail(failure);
  if (bytes.length === 0) fail('an empty body');
  // A web page where a file should be. `text/html` is a real document type —
  // an e-signed document is HTML, 8 of 42 on the captured account — so this
  // only fires when MyChart itself did not say the file was HTML.
  if (contentType.includes('text/html') && !declaredMime.includes('html')) fail('a web page instead of the file');

  const extension = extensionFrom(downloadUrl);
  const named = dispositionFileName(response.headers.get('content-disposition') ?? '')
    || (displayName && extension ? `${displayName}.${extension}` : displayName);
  return {
    fileName: safeFileName(named, extension ? `document.${extension}` : 'document'),
    mimeType: declaredMime || contentType.split(';')[0]!.trim(),
    bytes,
    displayName,
  };
}
