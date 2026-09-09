/**
 * One Document Center document: the bytes MyChart holds for it.
 *
 * `get_documents` lists documents and hands back a `dcsID`; this fetches the
 * file, the way Epic's own row does — `useDcsDocument`
 * (`epic.px.client.document-viewer.js`), reached from
 * `epic.px.client.document-center.js` as
 * `{ dcsId: doc.dcsID, fileExtension: doc.docExt }` with `useOldMobileLink: true`
 * and no `legacyEncryption`, which is what picks `GetDocumentDetails` over the
 * `…Legacy` sibling the message viewer uses.
 *
 * The exchange itself, and the three traps in it, are in
 * [`core/dcsDocument.ts`](../../core/dcsDocument.ts) — attachments go through
 * the same store. All this adds is the id it was given and the wording of a
 * refusal, since only it knows the id came from `get_documents`.
 *
 * **It sends no extension**, where the portal sends `doc.docExt`. MyChart
 * ignores the field (measured five ways on one live instance: correct, empty,
 * omitted, wrong, and `dcsId` alone all returned the same 135,807-byte PDF),
 * and the only way to learn a document's extension is to walk the document
 * list — up to 40 requests, for a value the server never reads.
 */
import type { MyChartRequest } from '../../core/myChartRequest';
import { RawCollector } from '../../core/rawResponse';
import { DcsDocumentError, fetchDcsFile } from '../../core/dcsDocument';
import type { FilePayload } from '../../../../shared/capabilities/types';

/** A downloaded document: the file, and what MyChart said about it. */
export interface DocumentFile extends FilePayload {
  /** The `dcsID` from `get_documents` that was asked for. */
  dcsID: string;
  /** MyChart's own name for the file, before `fileName` made it safe. */
  displayName: string;
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

  try {
    const file = await fetchDcsFile(mychartRequest, collector, token, {
      dcsId: documentId,
      fileExtension: '',
      organizationId: '',
      useOldMobileLink: true,
      legacy: false,
    });
    return { ...file, dcsID: documentId };
  } catch (error) {
    if (!(error instanceof DcsDocumentError)) throw error;
    const { failure } = error;
    if (failure.reason === 'no_such_document') {
      throw new Error(
        `MyChart has no document ${documentId} on the active patient record. ` +
          'Take the id from a `dcsID` in get_documents, copied verbatim, and check the right patient is active.',
      );
    }
    const named = failure.displayName || documentId;
    if (failure.reason === 'not_released') {
      throw new Error(
        `MyChart offers ${named} for viewing in the portal only and serves no file for it, ` +
          'so there is nothing to download. Opening it in MyChart itself is the only way to read it.',
      );
    }
    throw new Error(`MyChart answered the download of ${named} with ${failure.detail}; nothing was downloaded.`);
  }
}
