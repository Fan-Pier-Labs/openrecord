/**
 * Raw MyChart responses for the `documents` scraper.
 *
 * Observed by the capture harness behind `fake-mychart/src/data/realShapes.ts`
 * on three real instances — what we have seen, never a contract Epic owes us.
 *
 * `unknown` means the field was `null` on every instance captured: we saw no
 * value, so we know no type. `unknown[]` means the array was always empty, so
 * we have never seen an element. Neither is `null` or `never[]`, which would
 * read as settled.
 *
 * Read a payload with `rec<T>()` from `../../processors/read.ts` — it checks the
 * field names and leaves every value to `text()` / `num()` / `list()`. Never
 * `as`: that checks the same names and then lies about the values.
 *
 * Endpoints: /api/documents/viewer/loadotherdocuments. `GetDocumentDetailsLegacy`,
 * the DCS exchange both documents and message attachments go through, is in
 * `../../core/mychart.types.ts` beside `dcsDocument.ts`, which sends it.
 *
 * Keep in step with `realShapes.ts` when the captures are refreshed.
 */

/** `/api/documents/viewer/loadotherdocuments` */
export type LoadOtherDocuments = {
  documents?: Array<{
    blobCat?: string;
    dcsID?: string;
    docID?: string;
    date?: string;
    dateRaw?: string;
    dat?: string;
    docExt?: string;
    docDesc?: string;
    docType?: string;
    pendingApprovalStatus?: number;
    rejectionReasonFreetext?: string;
    wasESigned?: boolean;
    downloadOnly?: boolean;
    new?: boolean;
    isExpired?: boolean;
    pendingRequiredSignatures?: boolean;
    onlyAllowedPreview?: boolean;
  }>;
};
