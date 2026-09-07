import type { MyChartRequest } from '../../core/myChartRequest';
import { RawCollector, type RawResponse } from '../../core/rawResponse';
import { logger } from '../../../../shared/logger';
import { bool, rec, text } from '../../processors/read';
import { requireJsonBody } from '../notes/notes';
import {
  pastVisitsProcessor,
  upcomingVisitsProcessor,
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
// organization, while still guaranteeing termination on accounts with huge
// histories. `hasOlderVisits` says when it was hit.
const MAX_PAST_VISIT_PAGES = 50;

/**
 * `oldestRenderedDate` is required on the query string, and MyChart does
 * nothing with it (#190) — the request that carries "1970" and the one that
 * carries "two years ago" come back with the same 10 visits. In Epic's own
 * page it is the browser reporting how far down it has already rendered, not
 * a filter. Pinned to the epoch so it can never be mistaken for one.
 */
const OLDEST_RENDERED_DATE = new Date(0).toISOString();

/**
 * Fetch every `LoadPast` page and record each one.
 *
 * Each response carries `HasMoreData` per organization and a top-level
 * `SerializedIndex` continuation token that must be echoed back to get the
 * next 10 (issue #189), so the walk runs to exhaustion: it stops when no
 * organization has more data, when the token is missing or stops advancing,
 * or at `MAX_PAST_VISIT_PAGES`. The pages are NOT merged here — the processor
 * does that — so `raw` mode is the envelope of every page fetched.
 */
export async function fetchPastVisitsRaw(myChartRequest: MyChartRequest): Promise<RawResponse> {
  const collector = new RawCollector(myChartRequest);
  const token = await collector.pageToken(VISITS_PAGE + '?noCache=' + Math.random());

  let serializedIndex: string | undefined;
  let pagesFetched = 0;
  while (pagesFetched < MAX_PAST_VISIT_PAGES) {
    let path =
      '/Visits/VisitsList/LoadPast?loadpast=1&searchString=&oldestRenderedDate=' +
      OLDEST_RENDERED_DATE +
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
export async function pastVisits(myChartRequest: MyChartRequest): Promise<PastVisitsStandard | null> {
  return pastVisitsProcessor.standard(await fetchPastVisitsRaw(myChartRequest));
}
