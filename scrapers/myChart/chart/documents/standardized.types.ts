/**
 * What the `documents` capabilities return: the standard objects the processors
 * build from MyChart's responses. MyChart's own shapes are in
 * `./mychart.types.ts`.
 */

export interface DocumentStandard {
  /** The handle GetDocumentDetailsLegacy takes as `dcsId` to fetch the file. */
  dcsID: string | null;
  docID: string | null;
  /** What the Document Center shows as the document's name. */
  docType: string | null;
  docDesc: string | null;
  /** PDF, TIF, JPG, PNG, BMP or HTML — HTML is an e-signed document. */
  docExt: string | null;
  /** MyChart's own display date, M/D/YYYY. */
  date: string | null;
  /** Epic day number, as a string. */
  dateRaw: string | null;
  /** Derived: `dateRaw` as a calendar date. */
  dateISO: string | null;
  blobCat: string | null;
  dat: string | null;
  /** Not yet opened in MyChart. */
  new: boolean | null;
  wasESigned: boolean | null;
  isExpired: boolean | null;
  downloadOnly: boolean | null;
  onlyAllowedPreview: boolean | null;
  pendingRequiredSignatures: boolean | null;
  /** 0 Other, 1 Pending, 2 Rejected. */
  pendingApprovalStatus: number | null;
  rejectionReasonFreetext: string | null;
}

export interface DocumentsStandard {
  documents: DocumentStandard[];
}
