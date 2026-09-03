import type { MyChartRequest } from '../../core/myChartRequest';
import { RawCollector, type RawResponse } from '../../core/rawResponse';
import { logger } from '../../../../shared/logger';
import { bool, list, rec, text } from '../../processors/read';
import { requireJsonBody } from '../notes/notes';
import {
  pastVisitsProcessor,
  upcomingVisitsProcessor,
  visitInstantMs,
  type PastVisitsStandard,
  type UpcomingVisitsStandard,
} from './visits.processor';

export type {
  VisitStandard,
  VisitConcise,
  VisitStatus,
  VisitBucket,
  UpcomingVisitStandard,
  UpcomingVisitsStandard,
  PastVisitsStandard,
  VisitDiagnosisStandard,
  VisitProcedureStandard,
  VisitProviderStandard,
  VisitDepartmentStandard,
  VisitPreadmissionLocationStandard,
} from './visits.processor';
export {
  upcomingVisitsProcessor,
  pastVisitsProcessor,
  visitStandard,
  visitConcise,
  visitStatus,
  visitInstantMs,
} from './visits.processor';

const VISITS_PAGE = '/Visits/VisitsList';

/**
 * `GET /Visits/VisitsList` for the token, then `POST /Visits/VisitsList/LoadUpcoming`.
 *
 * The POST carries no body and no Content-Type: an empty-string body still
 * makes Node's undici add `Content-Type: text/plain`, which trips F5 Volterra
 * WAF rules on some deployments.
 */
export async function fetchUpcomingVisitsRaw(myChartRequest: MyChartRequest): Promise<RawResponse> {
  const collector = new RawCollector(myChartRequest);
  const token = await collector.pageToken(VISITS_PAGE + '?noCache=' + Math.random());
  const result = await collector.send({
    path: '/Visits/VisitsList/LoadUpcoming?timeZone=America%2FNew_York&ComponentNumber=5&noCache=' + Math.random(),
    method: 'POST',
    headers: { __requestverificationtoken: token },
  });
  requireJsonBody(result, '/Visits/VisitsList/LoadUpcoming');
  return collector.toRaw();
}

/** The standard object — what `mode: 'json'` returns. */
export async function upcomingVisits(myChartRequest: MyChartRequest): Promise<UpcomingVisitsStandard | null> {
  return upcomingVisitsProcessor.standard(await fetchUpcomingVisitsRaw(myChartRequest));
}

// Hard cap on how many LoadPast pages one call will request. MyChart returns
// 10 visits per organization per page, so 50 pages covers ~500 visits per
// organization — far more than the 2–3 years most callers ask for, while still
// guaranteeing termination on accounts with huge histories.
const MAX_PAST_VISIT_PAGES = 50;

/**
 * Fetch every `LoadPast` page back to `oldestRenderedDate` and record each one.
 *
 * `oldestRenderedDate` is NOT a server-side "everything since" filter: each
 * response carries `HasMoreData` per organization and a top-level
 * `SerializedIndex` continuation token that must be echoed back to get the
 * next 10 (issue #189). The loop stops when no organization has more data,
 * when every visit on the latest page predates the cutoff (results are
 * newest→oldest), when the token is missing or stops advancing, or at
 * `MAX_PAST_VISIT_PAGES`. The pages are NOT merged here — the processor does
 * that — so `raw` mode is the envelope of every page fetched.
 */
export async function fetchPastVisitsRaw(myChartRequest: MyChartRequest, oldestRenderedDate: Date): Promise<RawResponse> {
  const collector = new RawCollector(myChartRequest);
  const token = await collector.pageToken(VISITS_PAGE + '?noCache=' + Math.random());
  const cutoffMs = oldestRenderedDate.getTime();

  let serializedIndex: string | undefined;
  let pagesFetched = 0;
  while (pagesFetched < MAX_PAST_VISIT_PAGES) {
    let path =
      '/Visits/VisitsList/LoadPast?loadpast=1&searchString=&oldestRenderedDate=' +
      oldestRenderedDate.toISOString() +
      '&ComponentNumber=7&noCache=' +
      Math.random();
    if (serializedIndex) path += '&serializedIndex=' + encodeURIComponent(serializedIndex);

    // Same WAF-safe shape as LoadUpcoming: no body, no Content-Type.
    const result = await collector.send({ path, method: 'POST', headers: { __requestverificationtoken: token } });
    requireJsonBody(result, '/Visits/VisitsList/LoadPast');
    pagesFetched++;

    const page = rec(result.body);
    // A non-container response (a literal null, a login interstitial that
    // happened to be JSON) cannot be paged; it is in the envelope as-is.
    if (!page.List) break;

    const orgs = Object.values(rec(page.List)).map(rec);
    if (!orgs.some((org) => bool(org.HasMoreData))) break;

    const timestamps = orgs
      .flatMap((org) => list(org.List).map((v) => visitInstantMs(rec(v))))
      .filter((t): t is number => t !== null);
    if (timestamps.length > 0 && timestamps.every((t) => t < cutoffMs)) break;

    const next = text(page.SerializedIndex);
    if (!next || next === serializedIndex) break; // no cursor, or a stuck one
    serializedIndex = next;
  }

  if (pagesFetched >= MAX_PAST_VISIT_PAGES) {
    logger.debug(`pastVisits: hit page cap (${MAX_PAST_VISIT_PAGES}); some older visits may be omitted`);
  }
  return collector.toRaw();
}

/** The standard object — what `mode: 'json'` returns. */
export async function pastVisits(myChartRequest: MyChartRequest, oldestRenderedDate: Date): Promise<PastVisitsStandard | null> {
  return pastVisitsProcessor.standard(await fetchPastVisitsRaw(myChartRequest, oldestRenderedDate));
}
