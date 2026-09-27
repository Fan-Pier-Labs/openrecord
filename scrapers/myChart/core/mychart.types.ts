/**
 * Raw MyChart responses for the requests core sends itself: the DCS document
 * exchange in `dcsDocument.ts`, which `chart/documents` and `chart/messages`
 * both call through. Same conventions as every scraper's `mychart.types.ts`:
 * captured shapes, every field optional, read through `rec<T>()`.
 *
 * Endpoints: /api/documents/viewer/getdocumentdetailslegacy
 */

/** `/api/documents/viewer/getdocumentdetailslegacy (and getdocumentdetails: same field set)` */
export type GetDocumentDetailsLegacy = {
  dcsId?: string;
  token?: string;
  orgId?: string;
  displayName?: string;
  userFriendlyDisplayName?: string;
  legacyEncryption?: boolean;
  isMobile?: boolean;
  fileDescription?: string;
  allowPreview?: boolean;
  downloadUrl?: string;
  previewUrl?: string;
  mimeType?: string;
};
