import { SessionExpiredError } from '../../core/makeAuthenticatedRequest';
import type { MyChartRequest } from '../../core/myChartRequest';
import { RawCollector, type RawResponse } from '../../core/rawResponse';
import { followSamlChain, getImageViewerSamlUrl } from '../../eunity/imagingViewer';
import { list, rec, text } from '../../processors/read';
import { logger } from '../../../../shared/logger';
import { labResultsProcessor, type LabResultsStandard } from './labResults.processor';
import { fdiContextForOrder, imagingResultsProcessor, isImagingOrder, type ImagingResultsStandard } from './imagingResults.processor';

export type {
  LabResultsStandard,
  LabOrderStandard,
  LabOrderConcise,
  LabResultStandard,
  LabComponentStandard,
  ReferenceRangeStandard,
  SignedTextStandard,
  StudyResultStandard,
  ResultingLabStandard,
  OrderMetadataStandard,
  ProviderCommentStandard,
  ImageStudyStandard,
  ScanStandard,
  HistoricalPointStandard,
  HistoricalComponentStandard,
} from './labResults.processor';
export { labResultsProcessor, conciseLabOrder, recentTrendPoints, CONCISE_TREND_POINTS } from './labResults.processor';
export type { ImagingResultsStandard, ImagingOrderStandard, ImagingOrderConcise } from './imagingResults.processor';
export {
  imagingResultsProcessor,
  isImagingByName,
  isImagingByContent,
  isImagingOrder,
  fdiContextForOrder,
  imageIdFor,
} from './imagingResults.processor';

const TEST_RESULTS_PAGE = '/app/test-results';

/**
 * One `/api/test-results/GetList` page, or the failure when this instance
 * does not serve that group type. Group types 0-3 are probed speculatively —
 * real instances accept only 0 and 1 and answer the rest with a 500 — so a
 * failure here is expected on some probes, which is why it is the ONLY
 * failure tolerated on this path. It is recorded with its status, and the
 * caller decides whether the probes as a whole came up empty. A thrown
 * transport error is not recorded. A `SessionExpiredError` still propagates:
 * reporting a dead session as "unsupported group type" turns it into an
 * empty chart.
 */
async function fetchResultGroupList(
  collector: RawCollector,
  groupType: number,
  token: string,
): Promise<{ page: unknown } | { failure: Error }> {
  try {
    const { body, failure } = await collector.send(
      {
        path: '/api/test-results/GetList',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', __RequestVerificationToken: token },
        body: JSON.stringify({ groupType, searchString: '', maxResults: 1000, isCurAdmFilterEnabled: false }),
      },
      { tolerateFailure: true },
    );
    return failure ? { failure } : { page: body };
  } catch (err) {
    if (err instanceof SessionExpiredError) throw err;
    logger.debug(`test-results GetList failed for groupType ${groupType}:`, (err as Error).message);
    return { failure: err as Error };
  }
}

/** The trend body is best-effort: a failure is recorded (when there was a response) and otherwise tolerated. */
async function fetchHistoricalResults(collector: RawCollector, orderKey: string, token: string): Promise<void> {
  try {
    await collector.postJson(
      '/api/past-results/GetMultipleHistoricalResultComponents',
      token,
      {
        orderID: orderKey,
        selectedComponentIDs: [],
        isInitialLoad: true,
        startTime: '',
        endTime: '',
        organizationID: '',
        isCustomFilterEnabled: false,
        PageNonce: '',
      },
      { tolerateFailure: true },
    );
  } catch (err) {
    if (err instanceof SessionExpiredError) throw err;
    logger.debug(`historical results failed for ${orderKey}:`, (err as Error).message);
  }
}

/**
 * Every request behind `get_lab_results`, recorded on `collector`: the page
 * token, `GetList` for group types 0-3, then per unique order key
 * `GetDetails`, `LoadReportContent` for each result that names a report, and
 * `GetMultipleHistoricalResultComponents`. The join is the processor's.
 */
async function collectLabResults(collector: RawCollector): Promise<void> {
  const token = await collector.pageToken(TEST_RESULTS_PAGE);
  const seenKeys = new Set<string>();
  // A probe the instance rejects is expected; every probe rejected is not. An
  // instance that answered nothing has not said "no results", and the first
  // failure is the one to report.
  let firstFailure: Error | null = null;
  let pagesRead = 0;

  for (const groupType of [0, 1, 2, 3]) {
    const outcome = await fetchResultGroupList(collector, groupType, token);
    if ('failure' in outcome) {
      firstFailure ??= outcome.failure;
      continue;
    }
    pagesRead++;
    const page = outcome.page;

    // Outside the swallow: these are results the instance says exist, so a
    // failure here would return a short list indistinguishable from a
    // complete one — "you have 39 results" when you have 60.
    for (const group of list(rec(page).newResultGroups)) {
      const key = text(rec(group).key);
      if (!key || seenKeys.has(key)) continue;
      seenKeys.add(key);

      const details = rec(await collector.postJson('/api/test-results/GetDetails', token, { orderKey: key, organizationID: '', PageNonce: '' }));
      logger.debug('got detail back:', details.orderName);

      for (const result of list(details.results)) {
        const reportDetails = rec(rec(result).reportDetails);
        const reportID = text(reportDetails.reportID);
        if (!reportID) continue;
        const vars = rec(reportDetails.reportVars);
        await collector.postJson('/api/report-content/LoadReportContent', token, {
          reportID,
          assumedVariables: { ordId: vars.ordId ?? '', ordDat: vars.ordDat ?? '' },
          isFullReportPage: false,
          uniqueClass: 'EID-4',
          nonce: '',
        });
      }

      await fetchHistoricalResults(collector, key, token);
    }
  }

  if (pagesRead === 0 && firstFailure) throw firstFailure;
}

export async function fetchLabResultsRaw(mychartRequest: MyChartRequest): Promise<RawResponse> {
  const collector = new RawCollector(mychartRequest);
  await collectLabResults(collector);
  return collector.toRaw();
}

/** The standard object — what `mode: 'json'` returns. */
export async function listLabResults(mychartRequest: MyChartRequest): Promise<LabResultsStandard> {
  return labResultsProcessor.standard(await fetchLabResultsRaw(mychartRequest));
}

/**
 * The lab requests plus, for every imaging order with a viewer context, the
 * `FdiData` exchange that mints the (single-use, short-lived) SAML URL. With
 * `followSaml`, the chain is walked to the eUnity viewer and the final hop is
 * recorded too, since it goes through its own cookie jar rather than the
 * session's request path.
 */
export async function fetchImagingResultsRaw(
  mychartRequest: MyChartRequest,
  options?: { followSaml?: boolean },
): Promise<RawResponse> {
  const collector = new RawCollector(mychartRequest);
  await collectLabResults(collector);

  const labs = labResultsProcessor.standard(collector.toRaw());
  for (const order of labs.orders) {
    if (!isImagingOrder(order)) continue;
    const fdi = fdiContextForOrder(collector.toRaw(), order);
    if (!fdi) continue;
    try {
      const session = await getImageViewerSamlUrl(mychartRequest, fdi, collector);
      if (session && options?.followSaml) {
        const viewer = await followSamlChain(mychartRequest, session.samlUrl);
        if (viewer) {
          collector.requests.push({ path: viewer.viewerUrl, method: 'GET', status: 200, contentType: 'text/html', body: viewer.viewerBody });
        }
      }
    } catch (err) {
      if (err instanceof SessionExpiredError) throw err;
      logger.debug('Error getting viewer URL:', (err as Error).message);
    }
  }

  return collector.toRaw();
}

/** The standard object — what `mode: 'json'` returns. */
export async function getImagingResults(
  mychartRequest: MyChartRequest,
  options?: { followSaml?: boolean },
): Promise<ImagingResultsStandard> {
  return imagingResultsProcessor.standard(await fetchImagingResultsRaw(mychartRequest, options));
}
