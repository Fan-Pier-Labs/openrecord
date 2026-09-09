/**
 * One Document Center document: the bytes MyChart holds for it.
 *
 * `get_documents` lists documents and hands back a `dcsID`; nothing fetched
 * the file. This does what Epic's own row does — `useDcsDocument`
 * (`epic.px.client.document-viewer.js`), reached from
 * `epic.px.client.document-center.js` as
 * `{ dcsId: doc.dcsID, fileExtension: doc.docExt }`:
 *
 *   POST /api/documents/viewer/GetDocumentDetails
 *        { dcsId, fileExtension, organizationId, useOldMobileLink: true }
 *   GET  <downloadUrl>   /Documents/ViewDocument/DownloadOrStream?dcsid=…&displayName=…&dcsExt=…
 *
 * The Document Center passes no `legacyEncryption`, which is what picks
 * `GetDocumentDetails` over the `…Legacy` sibling `messageAttachment.ts` uses.
 * Both answered identically here — same bytes, same length, differing only in
 * `legacyEncryption` and whether the link is `Download` or `DownloadOrStream`.
 *
 * **`fileExtension` is ignored.** Measured five ways on one live instance
 * (correct, empty, omitted, wrong, and `dcsId` alone): every variant returned
 * the same `mimeType`, the same `displayName` and the same 135,807-byte PDF.
 * MyChart resolves everything from `dcsId`, so this takes only the id and
 * sends `''` — the same default the portal's own hook applies when its caller
 * knows no extension. That is what keeps a download from having to walk the
 * whole document list first.
 *
 * Three payload traps, none of them a status code:
 *   - an id the record does not hold answers **200 with a literal JSON `null`**
 *   - a document MyChart will not release answers with `downloadUrl` and
 *     `token` both empty (1 of 42 on the captured account, a BMP), and its
 *     `previewUrl` then streams **200 with an empty body**
 *   - a bogus download link answers **200 with an empty body and no
 *     Content-Type**, the same trap attachments have
 */
import { makeAuthenticatedRequest } from '../../core/makeAuthenticatedRequest';
import type { MyChartRequest } from '../../core/myChartRequest';
import type { RequestConfig } from '../../core/types';
import { RawCollector, describeResponseFailure } from '../../core/rawResponse';
import { safeFileName } from '../../core/safeFileName';
import type { FilePayload } from '../../../../shared/capabilities/types';
import { rec, text } from '../../processors/read';

/** A downloaded document: the file, and what MyChart said about it. */
export interface DocumentFile extends FilePayload {
  /** The `dcsID` from `get_documents` that was asked for. */
  dcsID: string;
  /** MyChart's own name for the file, before `fileName` made it safe. */
  displayName: string;
}

/**
 * `Content-Disposition: attachment; filename="Visit Summary.pdf"` — the name
 * a browser would save, extension included. Preferred over building one from
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
 * Download the document `documentId` — a `dcsID` from `get_documents` — from
 * the active patient record.
 */
export async function downloadDocument(
  mychartRequest: MyChartRequest,
  documentId: string,
): Promise<DocumentFile> {
  const collector = new RawCollector(mychartRequest);
  const token = await collector.pageToken('/app/document-center');
  const details = await collector.postJson('/api/documents/viewer/GetDocumentDetails', token, {
    dcsId: documentId,
    fileExtension: '',
    organizationId: '',
    useOldMobileLink: true,
  });

  // A literal `null` is MyChart saying this record holds no such document.
  if (details === null || typeof details !== 'object') {
    throw new Error(
      `MyChart has no document ${documentId} on the active patient record. ` +
        'Take the id from a `dcsID` in get_documents, copied verbatim, and check the right patient is active.',
    );
  }

  const downloadUrl = text(rec(details).downloadUrl);
  const displayName = text(rec(details).displayName) || text(rec(details).fileDescription);
  if (!downloadUrl) {
    // Both empty is MyChart offering the document for preview only; its
    // previewUrl then serves nothing, so there is no file to fall back to.
    throw new Error(
      `MyChart offers ${displayName || documentId} for viewing in the portal only and serves no file for it, ` +
        'so there is nothing to download. Opening it in MyChart itself is the only way to read it.',
    );
  }

  const config: RequestConfig = { path: downloadUrl.startsWith('/') ? downloadUrl : `/${downloadUrl}` };
  const response = await makeAuthenticatedRequest(mychartRequest, config);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const contentType = response.headers.get('content-type') ?? '';
  const declaredMime = text(rec(details).mimeType);

  const failure = describeResponseFailure(response, decodeStart(bytes), config);
  if (failure) {
    throw new Error(`MyChart answered the download of ${displayName || documentId} with ${failure}; nothing was downloaded.`);
  }
  if (bytes.length === 0) {
    throw new Error(
      `MyChart answered the download of ${displayName || documentId} with an empty body; nothing was downloaded.`,
    );
  }
  // A web page where a file should be. `text/html` is a real document type
  // here — an e-signed document is HTML, 8 of 42 on the captured account — so
  // this only fires when MyChart itself did not say the file was HTML.
  if (contentType.includes('text/html') && !declaredMime.includes('html')) {
    throw new Error(
      `MyChart answered the download of ${displayName || documentId} with a web page instead of the file; nothing was downloaded.`,
    );
  }

  const extension = extensionFrom(downloadUrl);
  const fallback = extension ? `document.${extension}` : 'document';
  const named = dispositionFileName(response.headers.get('content-disposition') ?? '')
    || (displayName && extension ? `${displayName}.${extension}` : displayName);
  return {
    dcsID: documentId,
    displayName,
    fileName: safeFileName(named, fallback),
    mimeType: declaredMime || contentType.split(';')[0]!.trim(),
    bytes,
  };
}

function decodeStart(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes.subarray(0, 4096));
}
