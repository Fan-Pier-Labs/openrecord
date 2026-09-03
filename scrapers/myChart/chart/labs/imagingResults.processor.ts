/**
 * Imaging results processor. Field decisions: docs/processor-layer-proposal.md, `get_imaging_results`.
 *
 * Imaging is the lab envelope filtered to imaging orders, plus the handle
 * `download_imaging_study` takes. The filter is a heuristic — an order-name
 * keyword match or imaging-shaped content — and `isImagingByName` /
 * `isImagingByContent` are its audit trail. `image_id` packs the fdi/ord
 * pair found in the report HTML's `data-fdi-context` or in
 * `fdiLink.redirectUrl`; the FdiData response (`samlUrl`) is a single-use
 * viewer entry that expires within minutes, so it stays in `raw`.
 *
 * Today's top-level copies (`reportText`, `narrative`, `impression`,
 * `resultDate`, `orderProvider`) were duplicates of the lab fields and are
 * not carried over.
 */

import { base64UrlEncode } from '../../../../shared/base64url';
import type { RawResponse } from '../../core/rawResponse';
import { extractFdiContext, extractFdiContextFromFdiLink, type FdiContext } from '../../eunity/imagingViewer';
import type { Processor } from '../../processors/processor';
import {
  conciseLabOrder,
  labResultsProcessor,
  reportHtmlByReportId,
  type ImageStudyStandard,
  type LabOrderConcise,
  type LabOrderStandard,
} from './labResults.processor';

export interface ImagingOrderStandard extends LabOrderStandard {
  /** Derived handle: position in this list, the fallback when a model garbles `image_id`. */
  index: number;
  /** Derived handle: base64url of `{ fdi, ord }`; what `download_imaging_study` takes. */
  image_id: string | null;
  /** Derived: an `image_id` could be extracted — pictures, not just a report. */
  hasViewableImages: boolean;
  /** Derived: the order name matched an imaging keyword. */
  isImagingByName: boolean;
  /** Derived: a result carried imaging-shaped content. */
  isImagingByContent: boolean;
}

export interface ImagingResultsStandard {
  orders: ImagingOrderStandard[];
}

export interface ImagingOrderConcise extends LabOrderConcise {
  index: number;
  image_id: string | null;
  hasViewableImages: boolean;
  results: Array<LabOrderConcise['results'][number] & { imageStudies: ImageStudyStandard[] }>;
}

const IMAGING_KEYWORDS = [
  'x-ray', 'xray', 'xr ', 'mri', 'ct ', 'ct,', 'imaging', 'radiology', 'ultrasound',
  'fluoroscop', 'arthrogram', 'mammogram', 'oct,', 'oct ', 'pathology', 'excision',
];

export function isImagingByName(orderName: string | null): boolean {
  const lower = (orderName ?? '').toLowerCase();
  return IMAGING_KEYWORDS.some((keyword) => lower.includes(keyword));
}

/** Structured images, a narrative or impression, or a report: the shapes only an imaging (or pathology) result has. */
export function isImagingByContent(order: LabOrderStandard): boolean {
  return order.results.some(
    (r) =>
      r.imageStudies.length > 0 ||
      r.scans.length > 0 ||
      Boolean(r.studyResult.narrative.contentAsString) ||
      Boolean(r.studyResult.impression.contentAsString) ||
      Boolean(r.reportDetails.reportID),
  );
}

export function isImagingOrder(order: LabOrderStandard): boolean {
  return isImagingByName(order.orderName) || isImagingByContent(order);
}

/**
 * The fdi/ord pair for an order: from the `data-fdi-context` in a result's
 * recorded report HTML, else from the structured `fdiLink` some instances
 * (Mass General Brigham) serve instead. The first result that yields one wins.
 */
export function fdiContextForOrder(raw: RawResponse, order: LabOrderStandard): FdiContext | null {
  const reports = reportHtmlByReportId(raw);
  for (const r of order.results) {
    const html = r.reportDetails.reportID ? reports.get(r.reportDetails.reportID) : undefined;
    const fdi =
      (html ? extractFdiContext(html) : null) ??
      (r.fdiLink.redirectUrl ? extractFdiContextFromFdiLink(r.fdiLink.redirectUrl) : null);
    if (fdi) return fdi;
  }
  return null;
}

/**
 * Same encoding as `encodeImageId` in `shared/capabilities.ts` — duplicated
 * rather than imported because capabilities imports this scraper, and the
 * two must stay byte-for-byte equal so `download_imaging_study` decodes it.
 */
export function imageIdFor(fdi: FdiContext): string {
  return base64UrlEncode(JSON.stringify({ fdi: fdi.fdi, ord: fdi.ord }));
}

export const imagingResultsProcessor: Processor<ImagingResultsStandard> = {
  standard(raw: RawResponse): ImagingResultsStandard {
    const orders: ImagingOrderStandard[] = [];
    for (const order of labResultsProcessor.standard(raw).orders) {
      const byName = isImagingByName(order.orderName);
      const byContent = isImagingByContent(order);
      if (!byName && !byContent) continue;
      const fdi = fdiContextForOrder(raw, order);
      orders.push({
        index: orders.length,
        image_id: fdi ? imageIdFor(fdi) : null,
        hasViewableImages: fdi !== null,
        isImagingByName: byName,
        isImagingByContent: byContent,
        ...order,
      });
    }
    return { orders };
  },
  concise(standard) {
    const orders: ImagingOrderConcise[] = standard.orders.map((order) => {
      const lab = conciseLabOrder(order);
      return {
        index: order.index,
        image_id: order.image_id,
        hasViewableImages: order.hasViewableImages,
        orderName: lab.orderName,
        results: lab.results.map((r, i) => ({ ...r, imageStudies: order.results[i]?.imageStudies ?? [] })),
        historicalResults: lab.historicalResults,
      };
    });
    return { orders };
  },
};
