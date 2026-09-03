/**
 * Lab results processor. Field decisions: docs/processor-layer-proposal.md, `get_lab_results`.
 *
 * The scraper records four `GetList` calls (one per group type; the ones the
 * instance does not serve come back 500, faithfully) and then, per order, a
 * `GetDetails`, a `GetMultipleHistoricalResultComponents` and, when the
 * result names a report, a `LoadReportContent`. This joins the three onto
 * the order by the request bodies the scraper posted (`orderKey`, `orderID`,
 * `reportID`) and lifts the encounter context off the `GetList` group.
 *
 * `abnormalFlagCategoryValue` is in `raw` only: it is the literal `"Unknown"`
 * on every captured component, out-of-range ones included (#375). Neither
 * mode derives an abnormal verdict; `valueText`, `numericValue` and the
 * reference range pass through and that judgement is the client's.
 */

import { findRequests, type RawResponse } from '../../core/rawResponse';
import { htmlToText } from '../../processors/htmlText';
import type { Processor } from '../../processors/processor';
import { boolOrNull, list, num, rec, strings, text, textOrNull } from '../../processors/read';

export interface ReferenceRangeStandard {
  formattedReferenceRange: string | null;
  low: number | null;
  high: number | null;
  displayLow: string | null;
  displayHigh: string | null;
  lowerBoundExclusive: boolean | null;
  upperBoundExclusive: boolean | null;
}

export interface LabComponentStandard {
  componentInfo: {
    /** Key into `historicalResults`. */
    componentID: string | null;
    name: string | null;
    commonName: string | null;
    units: string | null;
  };
  componentResultInfo: {
    /**
     * Derived: the value as plain text. Today this is `value` itself — no RTF
     * value has ever been captured (`isValueRtf` exists only in the skeleton),
     * so there is nothing to convert against. TODO(docs/processor-layer-todo.md
     * §1): when a capture shows what MyChart's RTF looks like, strip it here
     * with a real converter; until then an RTF value passes through as-is.
     */
    valueText: string | null;
    numericValue: number | null;
    isValueRtf: boolean | null;
    referenceRange: ReferenceRangeStandard;
  };
  componentComments: { contentAsString: string | null };
}

/** A signed block of text: narrative, impression, addendum, note, letter. */
export interface SignedTextStandard {
  contentAsString: string | null;
  signingInstantTimestamp: string | null;
}

export interface StudyResultStandard {
  narrative: SignedTextStandard;
  impression: SignedTextStandard;
  addenda: SignedTextStandard[];
  /** Uncaptured; passed through whole. */
  transcriptions: unknown[];
  /** Uncaptured; passed through whole. */
  ecgDiagnosis: unknown[];
  hasStudyContent: boolean | null;
  isFullResultText: boolean | null;
  isCupidAddendum: boolean | null;
}

export interface ResultingLabStandard {
  name: string | null;
  address: string[];
  phoneNumber: string | null;
  labDirector: string | null;
  cliaNumber: string | null;
  accreditationType: string | null;
}

export interface OrderMetadataStandard {
  prioritizedInstantISO: string | null;
  prioritizedInstantDisplay: string | null;
  resultTimestampDisplay: string | null;
  latestUpdateInstantISO: string | null;
  collectionTimestampsDisplay: string | null;
  specimensDisplay: string | null;
  resultStatus: string | null;
  orderProviderName: string | null;
  authorizingProviderName: string | null;
  readingProviderName: string | null;
  resultType: string | number | null;
  associatedDiagnoses: string[];
  resultingLab: ResultingLabStandard;
}

export interface ProviderCommentStandard {
  commentText: string | null;
  providerName: string | null;
  commentDate: string | null;
}

export interface ImageStudyStandard {
  studyDescription: string | null;
  modality: string | null;
  studyDate: string | null;
  numberOfImages: number | null;
}

export interface ScanStandard {
  scanType: string | null;
  scanDate: string | null;
}

export interface LabResultStandard {
  name: string | null;
  key: string | null;
  isAbnormal: boolean | null;
  hasComment: boolean | null;
  warningType: string | null;
  warningMessage: string | null;
  orderMetadata: OrderMetadataStandard;
  resultComponents: LabComponentStandard[];
  studyResult: StudyResultStandard;
  resultNote: SignedTextStandard;
  resultLetter: SignedTextStandard;
  providerComments: ProviderCommentStandard[];
  reportDetails: { reportID: string | null; isDownloadablePDFReport: boolean | null };
  /**
   * Derived: plain text of the joined `LoadReportContent.reportContent`.
   * `null` when the result named no report or none was fetched.
   */
  reportContentText: string | null;
  imageStudies: ImageStudyStandard[];
  scans: ScanStandard[];
  fdiLink: { redirectUrl: string | null };
}

export interface HistoricalPointStandard {
  dateISO: string | null;
  value: string | null;
  numericValue: number | null;
  isValueRtf: boolean | null;
  referenceRange: ReferenceRangeStandard;
}

export interface HistoricalComponentStandard {
  name: string | null;
  commonName: string | null;
  units: string | null;
  oldestResultISO: string | null;
  historicalResultData: HistoricalPointStandard[];
}

export interface LabOrderStandard {
  orderName: string | null;
  key: string | null;
  /** Lifted from the matching `GetList` group: the encounter the order belongs to. */
  isInpatient: boolean | null;
  isEDVisit: boolean | null;
  formattedAdmitDate: string | null;
  formattedDischargeDate: string | null;
  results: LabResultStandard[];
  /** The joined trend body, keyed by `componentID`. */
  historicalResults: Record<string, HistoricalComponentStandard>;
}

export interface LabResultsStandard {
  orders: LabOrderStandard[];
}

/** The concise projection of one order, shared with the imaging processor. */
export interface LabOrderConcise {
  orderName: string | null;
  results: Array<{
    name: string | null;
    prioritizedInstantISO: string | null;
    resultStatus: string | null;
    orderProviderName: string | null;
    resultComponents: Array<{
      name: string | null;
      commonName: string | null;
      units: string | null;
      valueText: string | null;
      formattedReferenceRange: string | null;
      contentAsString: string | null;
    }>;
    narrative: string | null;
    impression: string | null;
    addenda: Array<string | null>;
    resultNote: string | null;
    resultLetter: string | null;
    reportContentText: string | null;
  }>;
  historicalResults: Record<string, { name: string | null; historicalResultData: Array<{ dateISO: string | null; value: string | null }> }>;
}

/** How many trend points the concise view keeps per component. */
export const CONCISE_TREND_POINTS = 8;

function scalarOrNull(value: unknown): string | number | null {
  return typeof value === 'string' || typeof value === 'number' ? value : null;
}

function referenceRange(value: unknown): ReferenceRangeStandard {
  const r = rec(value);
  return {
    formattedReferenceRange: textOrNull(r.formattedReferenceRange),
    low: num(r.low),
    high: num(r.high),
    displayLow: textOrNull(r.displayLow),
    displayHigh: textOrNull(r.displayHigh),
    lowerBoundExclusive: boolOrNull(r.lowerBoundExclusive),
    upperBoundExclusive: boolOrNull(r.upperBoundExclusive),
  };
}

function signedText(value: unknown): SignedTextStandard {
  const s = rec(value);
  return { contentAsString: textOrNull(s.contentAsString), signingInstantTimestamp: textOrNull(s.signingInstantTimestamp) };
}

function component(value: unknown): LabComponentStandard {
  const c = rec(value);
  const info = rec(c.componentInfo);
  const resultInfo = rec(c.componentResultInfo);
  const rawValue = textOrNull(resultInfo.value);
  return {
    componentInfo: {
      componentID: textOrNull(info.componentID),
      name: textOrNull(info.name),
      commonName: textOrNull(info.commonName),
      units: textOrNull(info.units),
    },
    componentResultInfo: {
      valueText: rawValue,
      numericValue: num(resultInfo.numericValue),
      isValueRtf: boolOrNull(resultInfo.isValueRtf),
      referenceRange: referenceRange(resultInfo.referenceRange),
    },
    componentComments: { contentAsString: textOrNull(rec(c.componentComments).contentAsString) },
  };
}

function orderMetadata(value: unknown): OrderMetadataStandard {
  const m = rec(value);
  const lab = rec(m.resultingLab);
  return {
    prioritizedInstantISO: textOrNull(m.prioritizedInstantISO),
    prioritizedInstantDisplay: textOrNull(m.prioritizedInstantDisplay),
    resultTimestampDisplay: textOrNull(m.resultTimestampDisplay),
    latestUpdateInstantISO: textOrNull(m.latestUpdateInstantISO),
    collectionTimestampsDisplay: textOrNull(m.collectionTimestampsDisplay),
    specimensDisplay: textOrNull(m.specimensDisplay),
    resultStatus: textOrNull(m.resultStatus),
    orderProviderName: textOrNull(m.orderProviderName),
    authorizingProviderName: textOrNull(m.authorizingProviderName),
    readingProviderName: textOrNull(m.readingProviderName),
    resultType: scalarOrNull(m.resultType),
    associatedDiagnoses: strings(m.associatedDiagnoses),
    resultingLab: {
      name: textOrNull(lab.name),
      address: strings(lab.address),
      phoneNumber: textOrNull(lab.phoneNumber),
      labDirector: textOrNull(lab.labDirector),
      cliaNumber: textOrNull(lab.cliaNumber),
      accreditationType: textOrNull(lab.accreditationType),
    },
  };
}

function studyResult(value: unknown): StudyResultStandard {
  const s = rec(value);
  return {
    narrative: signedText(s.narrative),
    impression: signedText(s.impression),
    addenda: list(s.addenda).map(signedText),
    transcriptions: list(s.transcriptions),
    ecgDiagnosis: list(s.ecgDiagnosis),
    hasStudyContent: boolOrNull(s.hasStudyContent),
    isFullResultText: boolOrNull(s.isFullResultText),
    isCupidAddendum: boolOrNull(s.isCupidAddendum),
  };
}

function result(value: unknown, reportHtmlFor: (reportID: string) => string | null): LabResultStandard {
  const r = rec(value);
  const report = rec(r.reportDetails);
  const reportID = textOrNull(report.reportID);
  const reportHtml = reportID ? reportHtmlFor(reportID) : null;
  return {
    name: textOrNull(r.name),
    key: textOrNull(r.key),
    isAbnormal: boolOrNull(r.isAbnormal),
    hasComment: boolOrNull(r.hasComment),
    warningType: textOrNull(r.warningType),
    warningMessage: textOrNull(r.warningMessage),
    orderMetadata: orderMetadata(r.orderMetadata),
    resultComponents: list(r.resultComponents).map(component),
    studyResult: studyResult(r.studyResult),
    resultNote: signedText(r.resultNote),
    resultLetter: signedText(r.resultLetter),
    providerComments: list(r.providerComments).map((c) => ({
      commentText: textOrNull(rec(c).commentText),
      providerName: textOrNull(rec(c).providerName),
      commentDate: textOrNull(rec(c).commentDate),
    })),
    reportDetails: { reportID, isDownloadablePDFReport: boolOrNull(report.isDownloadablePDFReport) },
    reportContentText: reportHtml === null ? null : htmlToText(reportHtml),
    imageStudies: list(r.imageStudies).map((s) => ({
      studyDescription: textOrNull(rec(s).studyDescription),
      modality: textOrNull(rec(s).modality),
      studyDate: textOrNull(rec(s).studyDate),
      numberOfImages: num(rec(s).numberOfImages),
    })),
    scans: list(r.scans).map((s) => ({ scanType: textOrNull(rec(s).scanType), scanDate: textOrNull(rec(s).scanDate) })),
    fdiLink: { redirectUrl: textOrNull(rec(r.fdiLink).redirectUrl) },
  };
}

function historicalComponent(value: unknown): HistoricalComponentStandard {
  const h = rec(value);
  return {
    name: textOrNull(h.name),
    commonName: textOrNull(h.commonName),
    units: textOrNull(h.units),
    oldestResultISO: textOrNull(h.oldestResultISO),
    historicalResultData: list(h.historicalResultData).map((p) => ({
      dateISO: textOrNull(rec(p).dateISO),
      value: textOrNull(rec(p).value),
      numericValue: num(rec(p).numericValue),
      isValueRtf: boolOrNull(rec(p).isValueRtf),
      referenceRange: referenceRange(rec(p).referenceRange),
    })),
  };
}

/**
 * The recorded `LoadReportContent` bodies keyed by the `reportID` the scraper
 * posted. A report that failed (non-JSON body) reads as no report.
 */
export function reportHtmlByReportId(raw: RawResponse): Map<string, string> {
  const reports = new Map<string, string>();
  for (const request of findRequests(raw, 'LoadReportContent')) {
    const reportID = text(rec(request.requestBody).reportID);
    const html = textOrNull(rec(request.body).reportContent);
    if (reportID && html !== null && !reports.has(reportID)) reports.set(reportID, html);
  }
  return reports;
}

/** The `GetList` groups across every recorded page, keyed by order key (first wins). */
function resultGroupsByKey(raw: RawResponse): Map<string, Record<string, unknown>> {
  const groups = new Map<string, Record<string, unknown>>();
  for (const page of findRequests(raw, 'test-results/GetList')) {
    for (const group of list(rec(page.body).newResultGroups)) {
      const g = rec(group);
      const key = text(g.key);
      if (key && !groups.has(key)) groups.set(key, g);
    }
  }
  return groups;
}

/** The 8 most recent points, sorted by `dateISO` before capping so the cap keeps the newest whatever order the instance sent (#380). */
export function recentTrendPoints(points: HistoricalPointStandard[]): Array<{ dateISO: string | null; value: string | null }> {
  return [...points]
    .sort((a, b) => (a.dateISO ?? '').localeCompare(b.dateISO ?? ''))
    .slice(-CONCISE_TREND_POINTS)
    .map((p) => ({ dateISO: p.dateISO, value: p.value }));
}

export function conciseLabOrder(order: LabOrderStandard): LabOrderConcise {
  return {
    orderName: order.orderName,
    results: order.results.map((r) => ({
      name: r.name,
      prioritizedInstantISO: r.orderMetadata.prioritizedInstantISO,
      resultStatus: r.orderMetadata.resultStatus,
      orderProviderName: r.orderMetadata.orderProviderName,
      resultComponents: r.resultComponents.map((c) => ({
        name: c.componentInfo.name,
        commonName: c.componentInfo.commonName,
        units: c.componentInfo.units,
        valueText: c.componentResultInfo.valueText,
        formattedReferenceRange: c.componentResultInfo.referenceRange.formattedReferenceRange,
        contentAsString: c.componentComments.contentAsString,
      })),
      narrative: r.studyResult.narrative.contentAsString,
      impression: r.studyResult.impression.contentAsString,
      addenda: r.studyResult.addenda.map((a) => a.contentAsString),
      resultNote: r.resultNote.contentAsString,
      resultLetter: r.resultLetter.contentAsString,
      reportContentText: r.reportContentText,
    })),
    historicalResults: Object.fromEntries(
      Object.entries(order.historicalResults).map(([componentID, h]) => [
        componentID,
        { name: h.name, historicalResultData: recentTrendPoints(h.historicalResultData) },
      ]),
    ),
  };
}

export const labResultsProcessor: Processor<LabResultsStandard> = {
  standard(raw: RawResponse): LabResultsStandard {
    const groups = resultGroupsByKey(raw);
    const reports = reportHtmlByReportId(raw);
    const reportHtmlFor = (reportID: string) => reports.get(reportID) ?? null;
    const trends = findRequests(raw, 'GetMultipleHistoricalResultComponents');

    const orders: LabOrderStandard[] = [];
    for (const details of findRequests(raw, 'test-results/GetDetails')) {
      const orderKey = text(rec(details.requestBody).orderKey);
      // A body that is not the order (a WAF page, a literal null for an
      // unknown key) projects to an all-null order under the key we asked
      // for; the body itself is in `raw`.
      const body = rec(details.body);
      const group = groups.get(orderKey) ?? {};
      const trend = trends.find((t) => text(rec(t.requestBody).orderID) === orderKey);
      const historicalResults: Record<string, HistoricalComponentStandard> = {};
      for (const [componentID, h] of Object.entries(rec(rec(trend?.body).historicalResults))) {
        historicalResults[componentID] = historicalComponent(h);
      }
      orders.push({
        orderName: textOrNull(body.orderName),
        key: textOrNull(body.key) ?? (orderKey || null),
        isInpatient: boolOrNull(group.isInpatient),
        isEDVisit: boolOrNull(group.isEDVisit),
        formattedAdmitDate: textOrNull(group.formattedAdmitDate),
        formattedDischargeDate: textOrNull(group.formattedDischargeDate),
        results: list(body.results).map((r) => result(r, reportHtmlFor)),
        historicalResults,
      });
    }
    return { orders };
  },
  concise(standard) {
    return { orders: standard.orders.map(conciseLabOrder) };
  },
};
