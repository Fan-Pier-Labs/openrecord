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
 * Read a payload with `rec<T>()` from `processors/read.ts` — it checks the
 * field names and leaves every value to `text()` / `num()` / `list()`. Never
 * `as`: that checks the same names and then lies about the values.
 *
 * Endpoints: /api/documents/viewer/getdocumentdetailslegacy, /api/documents/viewer/loadotherdocuments
 *
 * Keep in step with the captures; `scrapers/myChart/__tests__/wireShapes.unit.test.ts`
 * fails the build if these miss a field or invent one.
 */

/** `/api/documents/viewer/getdocumentdetailslegacy (and getdocumentdetails: same field set)` */
export type GetDocumentDetailsLegacy = {
  dcsId: string;
  token: string;
  orgId: string;
  displayName: string;
  userFriendlyDisplayName: string;
  legacyEncryption: boolean;
  isMobile: boolean;
  fileDescription: string;
  allowPreview: boolean;
  downloadUrl: string;
  previewUrl: string;
  mimeType: string;
};

/** `/api/documents/viewer/loadotherdocuments` */
export type LoadOtherDocuments = {
  documents: Array<{
    blobCat: string;
    dcsID: string;
    docID: string;
    date: string;
    dateRaw: string;
    dat: string;
    docExt: string;
    docDesc: string;
    docType: string;
    pendingApprovalStatus: number;
    rejectionReasonFreetext: string;
    wasESigned: boolean;
    downloadOnly: boolean;
    new: boolean;
    isExpired: boolean;
    pendingRequiredSignatures: boolean;
    onlyAllowedPreview: boolean;
  }>;
};
