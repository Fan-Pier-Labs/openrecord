import { conformToShape } from '@/lib/shape';
import * as shapes from '@/data/realShapes';
import { visitsPage } from '@/lib/html';
import type { PatientDataset } from '@/lib/dataset';
import { html, json } from './respond';
import { prefix, type ExactRoutes, type PatternRoute } from './types';

// How many past visits MyChart's LoadPast endpoint returns per page. This MUST
// match real MyChart exactly (10 per org per page) — the fake is a faithful
// stand-in, not a convenience mock. The fixture carries more than one page of
// visits so the scraper's pagination loop is still exercised.
const PAST_VISITS_PAGE_SIZE = 10;

/**
 * Mimic MyChart's paginated `Visits/VisitsList/LoadPast` response.
 *
 * Real MyChart returns past visits 10-at-a-time per organization, newest
 * first, with a `HasMoreData` flag and an opaque top-level `SerializedIndex`
 * continuation token that the client echoes back to fetch the next page. We
 * model the token as a simple numeric offset into the full visit list. See
 * issue #189 — the scraper previously only ever read the first page.
 */
function buildPastVisitsPage(ds: PatientDataset, serializedIndex: string | null) {
  const all = ds.pastVisits.PastVisitsList;
  const offset = serializedIndex ? (Number(serializedIndex) || 0) : 0;
  const slice = all.slice(offset, offset + PAST_VISITS_PAGE_SIZE);
  const nextOffset = offset + slice.length;
  const hasMore = nextOffset < all.length;
  const nextToken = hasMore ? String(nextOffset) : '';

  const orgId = 'ORG-SPRINGFIELD';
  const org = { OrganizationId: orgId, OrganizationName: 'Springfield General Hospital', IsLocal: true };

  return {
    ViewBagProperties: { LoadingOrgNames: '', ErrorOrgNames: '', ManualOrgNames: '' },
    SerializedIndex: nextToken,
    List: {
      [orgId]: {
        ViewbagProperties: {},
        Organization: org,
        List: slice,
        ListSize: slice.length,
        HasMoreData: hasMore,
        CanSearch: false,
        SkippedSomeResults: false,
        SerializedIndex: nextToken,
      },
    },
    CanSearch: false,
    CanAllSearch: false,
    CanSort: false,
    AutoRenderThisSet: offset === 0,
    SkippedSomeResults: false,
    Organizations: { [orgId]: org },
  };
}

export const visitsGet: ExactRoutes = {
  'visits': () => html(visitsPage()),
};

export const visitsPostPatterns: readonly PatternRoute[] = [
  prefix('visits/visitslist/loadupcoming', ({ ds }) =>
    json(conformToShape(shapes.visitsLoadUpcoming, ds.upcomingVisits))),
  prefix('visits/visitslist/loadpast', ({ request, ds }) => {
    const serializedIndex = new URL(request.url).searchParams.get('serializedIndex');
    return json(conformToShape(shapes.visitsLoadPast, buildPastVisitsPage(ds, serializedIndex)));
  }),
];
