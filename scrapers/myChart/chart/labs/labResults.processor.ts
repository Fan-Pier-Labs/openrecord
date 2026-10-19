// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * Lab results processor. Field decisions: docs/processor-layer-proposal.md, `get_lab_results`.
 *
 * The scraper records four `GetList` calls (one per group type; the ones the
 * instance does not serve come back 500, faithfully) and then, per order, a
 * `GetDetails`, a `GetMultipleHistoricalResultComponents` and, when the
 * result names a report, a `LoadReportContent`. This joins the three onto
 * the order by the request bodies the scraper posted (`orderKey`, `orderID`,
 * `reportID` + `assumedVariables`) and lifts the encounter context off the
 * `GetList` group.
 *
 * An order whose `GetDetails` failed is not an order here: it goes to
 * `unloadedOrders`, named from `GetList`, and `notice` says the list is
 * incomplete. A result whose report failed stays, listed in `unloadedReports`.
 *
 * `abnormalFlagCategoryValue` is in `raw` only: it is the literal `"Unknown"`
 * on every captured component, out-of-range ones included (#375). Neither
 * mode derives an abnormal verdict; `valueText`, `numericValue` and the
 * reference range pass through and that judgement is the client's.
 */

import { answered, findRequests, type RawResponse } from '../../core/rawResponse';
import type { ReportContent } from '../../eunity/imagingViewer';
import { htmlToText } from '../../processors/htmlText';
import type { Processor } from '../../processors/processor';
import { boolOrNull, list, num, rec, strings, text, textOrNull } from '../../processors/read';
import type { DetailsResult, FdiLink, GetMultipleHistoricalResultComponents, ImageStudy, Narrative, ReferenceRange, Scan, TestResultDetails, TestResultList } from './mychart.types';
import type { HistoricalComponentStandard, HistoricalPointStandard, LabComponentStandard, LabOrderConcise, LabOrderStandard, LabResultStandard, LabResultsStandard, OrderMetadataStandard, ReferenceRangeStandard, SignedTextStandard, StudyResultStandard, TestResultGaps, UnloadedOrderStandard, UnloadedReportStandard } from './standardized.types';

export type { HistoricalComponentStandard, HistoricalPointStandard, ImageStudyStandard, LabComponentStandard, LabOrderConcise, LabOrderStandard, LabResultStandard, LabResultsStandard, OrderMetadataStandard, ProviderCommentStandard, ReferenceRangeStandard, ResultingLabStandard, ScanStandard, SignedTextStandard, StudyResultStandard, TestResultGaps, UnloadedOrderStandard, UnloadedReportStandard } from './standardized.types';

/** How many trend points the concise view keeps per component. */
export const CONCISE_TREND_POINTS = 8;

function scalarOrNull(value: unknown): string | number | null {
  return typeof value === 'string' || typeof value === 'number' ? value : null;
}

function referenceRange(value: unknown): ReferenceRangeStandard {
  const r = rec<ReferenceRange>(value);
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
  const s = rec<Narrative>(value);
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
  const m = rec<NonNullable<DetailsResult['orderMetadata']>>(value);
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
  const s = rec<NonNullable<DetailsResult['studyResult']>>(value);
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

function result(value: unknown, reports: Map<string, string>): LabResultStandard {
  const r = rec<DetailsResult>(value);
  const report = rec(r.reportDetails);
  const reportID = textOrNull(report.reportID);
  const reportHtml = reportHtmlForResult(reports, r);
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
    imageStudies: list(r.imageStudies).map((study) => {
      const s = rec<ImageStudy>(study);
      return {
        studyDescription: textOrNull(s.studyDescription),
        modality: textOrNull(s.modality),
        studyDate: textOrNull(s.studyDate),
        numberOfImages: num(s.numberOfImages),
      };
    }),
    scans: list(r.scans).map((scan) => {
      const s = rec<Scan>(scan);
      return { scanType: textOrNull(s.scanType), scanDate: textOrNull(s.scanDate) };
    }),
    fdiLink: { redirectUrl: textOrNull(rec<FdiLink>(r.fdiLink).redirectUrl) },
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
 * `reportID` is the id of a report *template* (Epic's LRP record), and every
 * result of the same kind names the same one — on Mass General Brigham three
 * procedure results years apart all posted one `reportID`. What tells
 * the reports apart is the order in `assumedVariables`, so the join key is
 * the whole identity the scraper posted. Keying on `reportID` alone handed
 * every such result the first one's report.
 */
function reportKey(reportID: string, vars: Record<string, unknown>): string {
  return JSON.stringify([reportID, text(vars.ordId), text(vars.ordDat)]);
}

/**
 * The recorded `LoadReportContent` bodies keyed by the report identity the
 * scraper posted. A report that failed (non-JSON body) reads as no report.
 */
export function reportHtmlByReport(raw: RawResponse): Map<string, string> {
  const reports = new Map<string, string>();
  for (const request of findRequests(raw, 'LoadReportContent')) {
    const body = rec(request.requestBody);
    const reportID = text(body.reportID);
    const html = textOrNull(rec<ReportContent>(request.body).reportContent);
    if (!reportID || html === null) continue;
    const key = reportKey(reportID, rec(body.assumedVariables));
    if (!reports.has(key)) reports.set(key, html);
  }
  return reports;
}

/** The report HTML recorded for one raw `GetDetails` result, or null when it names none. */
export function reportHtmlForResult(reports: Map<string, string>, rawResult: unknown): string | null {
  const details = rec(rec(rawResult).reportDetails);
  const reportID = text(details.reportID);
  if (!reportID) return null;
  return reports.get(reportKey(reportID, rec(details.reportVars))) ?? null;
}

/** The raw `GetDetails` results recorded for the order with `key`, in the order MyChart sent them. */
export function rawResultsForOrder(raw: RawResponse, key: string | null): unknown[] {
  if (!key) return [];
  // Mirrors `standard()`'s `key: textOrNull(body.key) ?? orderKey`.
  const details = findRequests(raw, 'test-results/GetDetails').find(
    (d) => text(rec<TestResultDetails>(d.body).key) === key || text(rec(d.requestBody).orderKey) === key,
  );
  return list(rec<TestResultDetails>(details?.body).results);
}

/** The `GetList` groups across every recorded page, keyed by order key (first wins). */
function resultGroupsByKey(raw: RawResponse): Map<string, Record<string, unknown>> {
  const groups = new Map<string, Record<string, unknown>>();
  for (const page of findRequests(raw, 'test-results/GetList')) {
    for (const group of list(rec<TestResultList>(page.body).newResultGroups)) {
      const g = rec(group);
      const key = text(g.key);
      if (key && !groups.has(key)) groups.set(key, g);
    }
  }
  return groups;
}

/** The result names `GetList` gives for a group's `resultList`, matched on each result's own `key`. */
function resultNames(raw: RawResponse, group: Record<string, unknown>): string[] {
  const wanted = new Set(strings(group.resultList));
  const names: string[] = [];
  for (const page of findRequests(raw, 'test-results/GetList')) {
    for (const r of Object.values(rec(rec<TestResultList>(page.body).newResults))) {
      const name = text(rec(r).name);
      if (wanted.has(text(rec(r).key)) && name && !names.includes(name)) names.push(name);
    }
  }
  return names;
}

/**
 * The report keys some `LoadReportContent` answered. A report is unloaded when
 * its result names it and none did — whether its request failed with a status
 * or threw before anything was recorded.
 */
function answeredReports(raw: RawResponse): Set<string> {
  const keys = new Set<string>();
  for (const request of findRequests(raw, 'LoadReportContent')) {
    if (!answered(request)) continue;
    const body = rec(request.requestBody);
    keys.add(reportKey(text(body.reportID), rec(body.assumedVariables)));
  }
  return keys;
}

function gapsNotice(unloadedOrders: UnloadedOrderStandard[], unloadedReports: UnloadedReportStandard[], loaded: number): string | null {
  const sentences: string[] = [];
  if (unloadedOrders.length > 0) {
    const named = unloadedOrders.map((o) => `${o.names.join(', ') || o.key}${o.formattedDate ? ` (${o.formattedDate})` : ''}`);
    sentences.push(
      `MyChart failed to return ${unloadedOrders.length} of ${unloadedOrders.length + loaded} result orders: ${named.join('; ')}. ` +
        'They are listed under unloadedOrders and left out of orders, so this list is incomplete — it is not that those tests have no results. They may load on a retry.',
    );
  }
  if (unloadedReports.length > 0) {
    const named = unloadedReports.map((r) => r.name ?? r.orderName ?? 'a result');
    sentences.push(`The report text for ${named.join(', ')} failed to load; those results are in orders without reportContentText, listed under unloadedReports.`);
  }
  return sentences.length > 0 ? sentences.join(' ') : null;
}

/** The 8 most recent points, sorted by `dateISO` before capping so the cap keeps the newest whatever order the instance sent (#380). */
export function recentTrendPoints(points: HistoricalPointStandard[]): Array<{ dateISO: string | null; value: string | null }> {
  return [...points]
    .sort((a, b) => (a.dateISO ?? '').localeCompare(b.dateISO ?? ''))
    .slice(-CONCISE_TREND_POINTS)
    .map((p) => ({ dateISO: p.dateISO, value: p.value }));
}

/** The gap lists as concise mode carries them, shared with the imaging processor. */
export function conciseGaps(gaps: TestResultGaps) {
  return {
    unloadedOrders: gaps.unloadedOrders.map((o) => ({ names: o.names, formattedDate: o.formattedDate })),
    unloadedReports: gaps.unloadedReports,
  };
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
    const reports = reportHtmlByReport(raw);
    const trends = findRequests(raw, 'GetMultipleHistoricalResultComponents');

    const reportsAnswered = answeredReports(raw);

    const orders: LabOrderStandard[] = [];
    const unloadedReports: UnloadedReportStandard[] = [];
    const loadedKeys = new Set<string>();
    const expectedKeys = new Set(groups.keys());
    for (const details of findRequests(raw, 'test-results/GetDetails')) {
      const orderKey = text(rec(details.requestBody).orderKey);
      expectedKeys.add(orderKey);
      if (!answered(details)) continue;
      loadedKeys.add(orderKey);
      const group = groups.get(orderKey) ?? {};
      // A body that answered but is not the order (a literal null for an
      // unknown key) projects to an all-null order under the key we asked
      // for; the body itself is in `raw`.
      const body = rec<TestResultDetails>(details.body);
      for (const r of list(body.results)) {
        const report = rec(rec(r).reportDetails);
        const reportID = text(report.reportID);
        if (reportID && !reportsAnswered.has(reportKey(reportID, rec(report.reportVars)))) {
          unloadedReports.push({ orderName: textOrNull(body.orderName), name: textOrNull(rec(r).name) });
        }
      }
      const trend = trends.find((t) => text(rec(t.requestBody).orderID) === orderKey);
      const historicalResults: Record<string, HistoricalComponentStandard> = {};
      for (const [componentID, h] of Object.entries(rec(rec<GetMultipleHistoricalResultComponents>(trend?.body).historicalResults))) {
        historicalResults[componentID] = historicalComponent(h);
      }
      orders.push({
        orderName: textOrNull(body.orderName),
        key: textOrNull(body.key) ?? (orderKey || null),
        isInpatient: boolOrNull(group.isInpatient),
        isEDVisit: boolOrNull(group.isEDVisit),
        formattedAdmitDate: textOrNull(group.formattedAdmitDate),
        formattedDischargeDate: textOrNull(group.formattedDischargeDate),
        results: list(body.results).map((r) => result(r, reports)),
        historicalResults,
      });
    }
    // Every order `GetList` listed must have answered details; one that failed
    // with a status, or threw before anything was recorded, is unloaded.
    const unloadedOrders: UnloadedOrderStandard[] = [...expectedKeys]
      .filter((key) => key && !loadedKeys.has(key))
      .map((key) => {
        const group = groups.get(key) ?? {};
        return { key, names: resultNames(raw, group), formattedDate: textOrNull(group.formattedDate) };
      });
    return { notice: gapsNotice(unloadedOrders, unloadedReports, orders.length), orders, unloadedOrders, unloadedReports };
  },
  concise(standard) {
    return { notice: standard.notice, orders: standard.orders.map(conciseLabOrder), ...conciseGaps(standard) };
  },
};
