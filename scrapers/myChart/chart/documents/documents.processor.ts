/**
 * Documents processor. Field decisions: docs/processor-layer-proposal.md, `get_documents`.
 *
 * Every `LoadOtherDocuments` page in the envelope is concatenated, then sorted
 * newest first on `dateRaw` — the same key Epic's own Document Center sorts
 * on, because the server returns the pages in no particular order relative to
 * each other.
 *
 * `dateRaw` is an Epic day number, not a timestamp: it matched the `date`
 * string on all 42 documents of the one live account captured, so `dateISO`
 * is derived from it rather than from parsing `date`'s locale-shaped M/D/YYYY.
 */

import { findRequests, type RawResponse } from '../../core/rawResponse';
import type { Processor } from '../../processors/processor';
import { boolOrNull, list, num, rec, textOrNull } from '../../processors/read';
import { fromEpicDte } from '../../../../shared/epicDate';

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

function dateISO(dateRaw: string | null): string | null {
  const dte = Number(dateRaw);
  if (dateRaw === null || dateRaw === '' || !Number.isFinite(dte)) return null;
  return fromEpicDte(dte).toISOString().slice(0, 10);
}

export const documentsProcessor: Processor<DocumentsStandard> = {
  standard(raw: RawResponse): DocumentsStandard {
    const documents = findRequests(raw, 'LoadOtherDocuments')
      .flatMap((page) => list(rec(page.body).documents))
      .map((entry) => {
        const d = rec(entry);
        const dateRaw = textOrNull(d.dateRaw);
        return {
          dcsID: textOrNull(d.dcsID),
          docID: textOrNull(d.docID),
          docType: textOrNull(d.docType),
          docDesc: textOrNull(d.docDesc),
          docExt: textOrNull(d.docExt),
          date: textOrNull(d.date),
          dateRaw,
          dateISO: dateISO(dateRaw),
          blobCat: textOrNull(d.blobCat),
          dat: textOrNull(d.dat),
          new: boolOrNull(d.new),
          wasESigned: boolOrNull(d.wasESigned),
          isExpired: boolOrNull(d.isExpired),
          downloadOnly: boolOrNull(d.downloadOnly),
          onlyAllowedPreview: boolOrNull(d.onlyAllowedPreview),
          pendingRequiredSignatures: boolOrNull(d.pendingRequiredSignatures),
          pendingApprovalStatus: num(d.pendingApprovalStatus),
          rejectionReasonFreetext: textOrNull(d.rejectionReasonFreetext),
        };
      });
    documents.sort((a, b) => Number(b.dateRaw ?? 0) - Number(a.dateRaw ?? 0));
    return { documents };
  },
  /**
   * `dcsID` is deliberately not here. It is the download handle, but nothing
   * takes it yet, and at 85-94 characters on a real instance it is both a
   * third of concise's bytes and enough on its own to push every row out of
   * table form (`MAX_TABLE_CELL` in processors/markdown.ts). It belongs back
   * in concise the day a capability accepts it, the way `dcsId` joined the
   * message projections once attachments could be fetched (#439).
   */
  concise(standard) {
    return {
      documents: standard.documents.map((d) => ({
        docType: d.docType,
        docDesc: d.docDesc,
        docExt: d.docExt,
        dateISO: d.dateISO,
        new: d.new,
      })),
    };
  },
};
