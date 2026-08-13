import { makeAuthenticatedRequest } from '../makeAuthenticatedRequest';
import { login_TEST } from "../login";
import { MyChartRequest } from "../myChartRequest";
import { getRequestVerificationTokenFromBody } from "../util";
import { PastVisitsContainer, Visit, VisitListContainer, VisitsScrapeError } from "./types";
import { logger } from '../../../shared/logger';


export async function upcomingVisits(myChartRequest: MyChartRequest): Promise<VisitListContainer | VisitsScrapeError> {

  const res = await makeAuthenticatedRequest(myChartRequest, { path: '/Visits/VisitsList?noCache=' + Math.random() })

  const requestVerificationToken = getRequestVerificationTokenFromBody(await res.text())

  if (!requestVerificationToken) {
    logger.debug('could not find request verification token', res)
    return { visits: [], error: 'Authentication error: could not get CSRF token for visits' }
  }


  const result = await makeAuthenticatedRequest(myChartRequest, {
    path: '/Visits/VisitsList/LoadUpcoming?timeZone=America%2FNew_York&ComponentNumber=5&noCache=' + Math.random(),
    "headers": {
      __requestverificationtoken: requestVerificationToken
    },
    "method": "POST",
  })

  const json = await result.json() as VisitListContainer

  return json
}



// Hard cap on how many LoadPast pages we'll request in a single pastVisits()
// call. MyChart returns 10 visits per org per page, so the default of 50 pages
// covers ~500 visits per org — far more than the 2–3 years most callers ask
// for, while still guaranteeing termination on accounts with huge histories.
const MAX_PAST_VISIT_PAGES = 50;

// Fetch a single LoadPast page. `serializedIndex` is the opaque, URL-encoded
// continuation token from the previous page's top-level `SerializedIndex`
// (omitted for the first page).
async function loadPastVisitsPage(
  myChartRequest: MyChartRequest,
  requestVerificationToken: string,
  oldestRenderedDate: Date,
  serializedIndex?: string,
): Promise<PastVisitsContainer> {
  let path = '/Visits/VisitsList/LoadPast?loadpast=1&searchString=&oldestRenderedDate='
    + oldestRenderedDate.toISOString() + '&ComponentNumber=7&noCache=' + Math.random();
  if (serializedIndex) {
    path += '&serializedIndex=' + encodeURIComponent(serializedIndex);
  }

  // Match LoadUpcoming's request shape: no body, no Content-Type header.
  // The original implementation used application/x-www-form-urlencoded + body
  // 'serializedIndex=', which trips F5 Volterra WAF rules on some MyChart
  // deployments. The WAF returns 200 OK with a text/html "Request Rejected"
  // page (served by 'volt-adc'), which makes the JSON parse throw
  // 'Unexpected token <' rather than surface as an auth failure.
  //
  // Important: omit body entirely (not `body: ''`). On Node's undici fetch,
  // an empty-string body still triggers an auto-added
  // 'Content-Type: text/plain;charset=UTF-8'. Omitting body sends no
  // Content-Type at all on both Bun and Node, which is the shape the WAF
  // accepts and matches what upcomingVisits has always done.
  const result = await makeAuthenticatedRequest(myChartRequest, {
    path,
    "headers": {
      __requestverificationtoken: requestVerificationToken,
    },
    "method": "POST",
  })

  return await result.json() as PastVisitsContainer
}

// The epoch-millis timestamp of a visit, parsed from its `.Instant`
// (`/Date(1761851400000)/`) field, falling back to `PrimaryDate`. Returns
// null when neither yields a usable date so callers can keep paginating
// rather than stop on an unparseable row.
function visitTimestamp(visit: Visit): number | null {
  const instant = visit.Instant?.match(/\/Date\((\d+)\)\//);
  if (instant) return Number(instant[1]);
  if (visit.PrimaryDate) {
    const t = Date.parse(visit.PrimaryDate);
    if (!Number.isNaN(t)) return t;
  }
  return null;
}

/**
 * Fetch a patient's past visits, following MyChart's pagination so callers get
 * the full history back to `oldestRenderedDate` rather than just the most
 * recent 10.
 *
 * MyChart's `LoadPast` endpoint returns visits 10-at-a-time per organization,
 * newest first. `oldestRenderedDate` is NOT a server-side "give me everything
 * since" filter — each response carries a `HasMoreData` flag and a top-level
 * `SerializedIndex` continuation token that must be echoed back on the next
 * request to retrieve the next 10. The original implementation issued a single
 * request and silently dropped everything past the first page (see issue #189).
 *
 * We page until one of: no organization reports `HasMoreData`, every visit on
 * the page predates `oldestRenderedDate` (results are newest→oldest, so once a
 * full page is older we've covered the requested window), the continuation
 * token stops advancing, or we hit `MAX_PAST_VISIT_PAGES`. Pages are merged
 * per-organization so the returned `PastVisitsContainer` keeps its original
 * shape; `HasMoreData` on the merged result reflects whether visits older than
 * the requested window remain.
 */
export async function pastVisits(myChartRequest: MyChartRequest, oldestRenderedDate: Date): Promise<PastVisitsContainer | VisitsScrapeError> {

  const res = await makeAuthenticatedRequest(myChartRequest, { path: '/Visits/VisitsList?noCache=' + Math.random() })

  const requestVerificationToken = getRequestVerificationTokenFromBody(await res.text())

  if (!requestVerificationToken) {
    logger.debug('could not find request verification token', res)
    return { visits: [], error: 'Authentication error: could not get CSRF token for visits' }
  }

  const cutoffMs = oldestRenderedDate.getTime();
  const firstPage = await loadPastVisitsPage(myChartRequest, requestVerificationToken, oldestRenderedDate);

  // Defensive: a non-container response (e.g. a WAF/login interstitial) has no
  // List — return it untouched so existing error handling stays intact.
  if (!firstPage || !firstPage.List) return firstPage;

  // Accumulate visits per organization across pages. `latestPage` is the most
  // recently fetched page; the stop conditions look at it (not the merged
  // accumulator, which always still holds the newest visit) to decide whether
  // another page is worth fetching.
  const merged = firstPage;
  let latestPage = firstPage;
  let serializedIndex = firstPage.SerializedIndex;
  let pagesFetched = 1;

  while (pagesFetched < MAX_PAST_VISIT_PAGES) {
    const latestOrgs = Object.values(latestPage.List);

    // Stop once no organization has more data to give.
    if (!latestOrgs.some(org => org.HasMoreData)) break;

    // Stop once we've paged back far enough: results are newest→oldest, so once
    // every visit on the latest page predates the cutoff, the next page would
    // be older still and there's nothing left in the requested window. We only
    // consider visits with a parseable timestamp.
    const timestamps = latestOrgs.flatMap(org => org.List.map(visitTimestamp)).filter((t): t is number => t !== null);
    if (timestamps.length > 0 && timestamps.every(t => t < cutoffMs)) break;

    // No continuation token (or one that stopped advancing) → can't page further.
    if (!serializedIndex) break;

    const nextPage = await loadPastVisitsPage(myChartRequest, requestVerificationToken, oldestRenderedDate, serializedIndex);
    if (!nextPage || !nextPage.List) break;
    if (nextPage.SerializedIndex === serializedIndex) break; // guard against a stuck cursor

    // Merge each org's visits into the accumulator.
    for (const [orgId, orgPage] of Object.entries(nextPage.List)) {
      const existing = merged.List[orgId];
      if (!existing) {
        merged.List[orgId] = orgPage;
      } else {
        existing.List.push(...orgPage.List);
        existing.ListSize = existing.List.length;
        existing.HasMoreData = orgPage.HasMoreData;
        existing.SerializedIndex = orgPage.SerializedIndex;
      }
    }

    latestPage = nextPage;
    serializedIndex = nextPage.SerializedIndex;
    merged.SerializedIndex = nextPage.SerializedIndex;
    pagesFetched++;
  }

  if (pagesFetched >= MAX_PAST_VISIT_PAGES) {
    logger.debug(`pastVisits: hit page cap (${MAX_PAST_VISIT_PAGES}); some older visits may be omitted`);
  }

  return merged;
}



if (import.meta.main) {
  (async () => {
    const mychartRequest = await login_TEST('mychart.example.org')
    await pastVisits(mychartRequest, new Date('2025-01-01T00:30:50.183Z'))
  })()
}