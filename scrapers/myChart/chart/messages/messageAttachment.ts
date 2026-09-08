/**
 * One message attachment, downloaded whole.
 *
 * The portal opens a DCS attachment (`type: 2`, a `dcsId`) through
 * `/Documents/ViewDocument/Download?dcsId=<id>&method=view` — the URL its
 * shared `useDcsDocument` hook builds for `legacyEncryption: true`, which is
 * what the communication-center bundle passes. Measured live: 200 with the
 * file's real `Content-Type`, `Content-Length` and a generic
 * `Content-Disposition: inline; filename="Document.PDF"` — the attachment's
 * own name is only in the message that listed it. A HEAD answers 500, so
 * there is no way to learn the size without downloading.
 *
 * An id MyChart does not recognise answers **200 with an empty body and no
 * Content-Type** (four of four instances). So a 200 is not enough: an empty
 * answer is the unknown-id case and is refused, or a wrong id becomes an
 * empty file on disk that looks like a real attachment.
 */
import type { MyChartRequest } from '../../core/myChartRequest';
import { makeAuthenticatedRequest } from '../../core/makeAuthenticatedRequest';
import { extensionForMime, safeFileName, type DownloadedFile } from '../../core/downloadedFile';

/** The extension in a `Content-Disposition` filename, lower-cased, or null. */
function extensionFromDisposition(contentDisposition: string): string | null {
  const match = /filename\*?=(?:UTF-8'')?"?[^";]*\.([A-Za-z0-9]{1,8})"?(?:;|$)/i.exec(contentDisposition);
  return match ? match[1]!.toLowerCase() : null;
}

/**
 * Download the attachment `dcsId` names. `fileName` is the name the message
 * listed for it, used to name the file; the extension always follows what
 * MyChart actually sent.
 */
export async function fetchMessageAttachment(
  mychartRequest: MyChartRequest,
  dcsId: string,
  fileName?: string,
): Promise<DownloadedFile> {
  const path = `/Documents/ViewDocument/Download?dcsId=${encodeURIComponent(dcsId)}&method=view`;
  const response = await makeAuthenticatedRequest(mychartRequest, { path });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `MyChart answered GET /Documents/ViewDocument/Download with HTTP ${response.status}. ` +
        'The attachment was not downloaded; retry later.',
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const mimeType = (response.headers.get('content-type') ?? '').split(';')[0]!.trim();
  if (bytes.length === 0 || !mimeType) {
    throw new Error(
      `No attachment ${dcsId} on the active patient record. Check the dcsId from get_message_thread, and that the right patient is active.`,
    );
  }
  const extension =
    extensionFromDisposition(response.headers.get('content-disposition') ?? '') ?? extensionForMime(mimeType) ?? 'bin';
  return {
    fileName: safeFileName(fileName, extension, `attachment-${dcsId.replace(/[^A-Za-z0-9_-]+/g, '_')}`),
    mimeType,
    size: bytes.length,
    bytes,
  };
}
