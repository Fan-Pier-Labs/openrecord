/**
 * The visit summarizers exist because `get_past_visits` over 20 visits returns
 * ~220 KB of MyChart's 159-field visit object, which overflows the context
 * window of the thing that asked for it. These tests pin the two properties
 * that make the projection safe to default on: nothing load-bearing is
 * dropped, and a payload that isn't a visits container survives untouched.
 */

import { describe, it, expect } from 'bun:test';

import {
  FULL_DETAIL_PARAM,
  PAST_VISITS_SUMMARY,
  UPCOMING_VISITS_SUMMARY,
  isPastVisitsContainer,
  isUpcomingVisitsContainer,
  summarizePastVisits,
  summarizeUpcomingVisits,
  summarizeVisit,
} from '../summaries';
import { CAPABILITIES } from '../capabilities';
import type { PastVisitsContainer, Visit } from '../../scrapers/myChart/chart/visits/types';
// The captured skeleton of a real LoadPast response. Imported rather than
// retyped so the size assertion below measures the projection against the
// object MyChart actually sends, not a stand-in someone sized to pass.
import { visitsLoadPast } from '../../fake-mychart/src/data/realShapes';

/** A visit with only the fields the projection reads, cast to the full type. */
function visit(fields: Partial<Visit>): Visit {
  return fields as Visit;
}

/**
 * A `LoadPast` container carrying only the fields the projection reads — the
 * cast stands in for the ~150 the fake and the real portal also send.
 */
function pastContainer(
  orgs: Record<string, { name?: string; visits: Partial<Visit>[]; hasMore?: boolean }>,
): PastVisitsContainer {
  return {
    ViewBagProperties: { LoadingOrgNames: '', ErrorOrgNames: '', ManualOrgNames: '' },
    SerializedIndex: '',
    List: Object.fromEntries(
      Object.entries(orgs).map(([id, org]) => [
        id,
        {
          ViewbagProperties: {},
          Organization: { OrganizationId: id, OrganizationName: org.name ?? '' },
          List: org.visits.map(visit),
          ListSize: org.visits.length,
          HasMoreData: org.hasMore ?? false,
          CanSearch: false,
          SkippedSomeResults: false,
          SerializedIndex: '',
        },
      ]),
    ),
  } as unknown as PastVisitsContainer;
}

const OFFICE_VISIT: Partial<Visit> = {
  Csn: 'CSN-1',
  Instant: '/Date(1761851400000)/',
  PrimaryDate: '10/30/2025 02:30:00 PM',
  VisitTypeName: 'Office Visit',
  PrimaryProviderName: 'A. Provider, MD',
  Providers: [{ Name: 'A. Provider, MD' }, { Name: 'B. Resident, DO' }] as Visit['Providers'],
  PrimaryDepartment: {
    Name: 'Internal Medicine',
    Address: ['1 Example Way', 'Exampleville, XX 00000'],
  } as Visit['PrimaryDepartment'],
  IsClinicalNoteAvailable: true,
  IsVisitSummaryEnabled: true,
};

describe('summarizeVisit', () => {
  it('keeps the load-bearing fields and drops the portal UI flags', () => {
    expect(summarizeVisit(OFFICE_VISIT)).toEqual({
      date: new Date(1761851400000).toISOString(),
      type: 'Office Visit',
      provider: 'A. Provider, MD',
      other_providers: ['B. Resident, DO'],
      location: 'Internal Medicine, Exampleville, XX 00000',
      csn: 'CSN-1',
      has_notes: true,
      has_summary: true,
    });
  });

  it('falls back to PrimaryDate verbatim when Instant is missing', () => {
    // PrimaryDate is local-time prose with no zone, so it is passed through
    // rather than parsed into an ISO instant it cannot justify.
    const summary = summarizeVisit(visit({ PrimaryDate: '10/30/2025 02:30:00 PM', Csn: 'CSN-2' }));
    expect(summary.date).toBe('10/30/2025 02:30:00 PM');
  });

  it('omits empty strings rather than emitting blank fields', () => {
    const summary = summarizeVisit(
      visit({ Csn: 'CSN-3', Instant: '/Date(0)/', VisitTypeName: '', PrimaryProviderName: '' }),
    );
    expect(summary).toEqual({ date: new Date(0).toISOString(), csn: 'CSN-3' });
  });

  it('falls back to CsnForECheckIn when Csn is absent', () => {
    // The CSN is what get_visit_notes / get_visit_avs take; losing it makes
    // the visit unreadable, so both spellings are accepted.
    expect(summarizeVisit(visit({ CsnForECheckIn: 'CSN-4' })).csn).toBe('CSN-4');
  });

  it('carries the clinical extras when the visit has them', () => {
    const summary = summarizeVisit(
      visit({
        Csn: 'CSN-5',
        ChiefComplaint: 'Chest pain',
        Diagnoses: [{ Code: 'R07.9', Description: 'Chest pain, unspecified' }],
        AdmissionDateRange: { Start: '01/02/2025', End: '01/05/2025' },
        SurgicalProcedures: [{ Name: 'Cardiac catheterization', Providers: [], Instructions: null }],
        IsNoShow: true,
      }),
    );
    expect(summary.chief_complaint).toBe('Chest pain');
    expect(summary.diagnoses).toEqual(['Chest pain, unspecified (R07.9)']);
    expect(summary.admitted).toBe('01/02/2025');
    expect(summary.discharged).toBe('01/05/2025');
    expect(summary.procedures).toEqual(['Cardiac catheterization']);
    expect(summary.no_show).toBe(true);
  });

  it('does not emit false flags', () => {
    const summary = summarizeVisit(visit({ Csn: 'CSN-6', IsNoShow: false, IsCanceled: false }));
    expect('no_show' in summary).toBe(false);
    expect('canceled' in summary).toBe(false);
  });
});

describe('summarizePastVisits', () => {
  it('flattens the per-organization nesting into one newest-first list', () => {
    const summary = summarizePastVisits(
      pastContainer({
        'ORG-A': {
          visits: [
            { Csn: 'old', Instant: '/Date(1000)/' },
            { Csn: 'new', Instant: '/Date(3000)/' },
            { Csn: 'mid', Instant: '/Date(2000)/' },
          ],
        },
      }),
    );

    expect(summary.visits.map((v) => v.csn)).toEqual(['new', 'mid', 'old']);
    expect(summary.count).toBe(3);
    // A single-org account gets no organization field — it would be the same
    // value on every row.
    expect(summary.visits.every((v) => v.organization === undefined)).toBe(true);
    expect('has_more' in summary).toBe(false);
  });

  it('names the organization only when the account spans more than one', () => {
    const summary = summarizePastVisits(
      pastContainer({
        'ORG-A': { name: 'North Clinic', visits: [{ Csn: 'a', Instant: '/Date(2000)/' }] },
        'ORG-B': { name: 'South Clinic', visits: [{ Csn: 'b', Instant: '/Date(1000)/' }] },
      }),
    );

    expect(summary.visits.map((v) => [v.csn, v.organization])).toEqual([
      ['a', 'North Clinic'],
      ['b', 'South Clinic'],
    ]);
  });

  it('reports has_more so the caller knows to widen years_back', () => {
    const summary = summarizePastVisits(pastContainer({ 'ORG-A': { visits: [{ Csn: 'a' }], hasMore: true } }));
    expect(summary.has_more).toBe(true);
  });

  it('passes a scrape error through untouched', () => {
    // `{ visits: [], error }` from pastVisits() has no List. A summary of it
    // would hide the reason the scrape failed.
    const error = { visits: [], error: 'Authentication error: could not get CSRF token for visits' };
    expect(isPastVisitsContainer(error)).toBe(false);
    expect(PAST_VISITS_SUMMARY.project(error)).toBe(error);
    expect(PAST_VISITS_SUMMARY.project(null)).toBeNull();
    expect(PAST_VISITS_SUMMARY.project('<html>Request Rejected</html>')).toBe('<html>Request Rejected</html>');
  });

  it('is an order of magnitude smaller than the payload it projects', () => {
    // The whole point: 20 visits of the real object is ~220 KB, which is what
    // overflowed the context window and sent the result to a file on disk.
    const skeleton = visitsLoadPast.List['*'].List[0] as unknown as Partial<Visit>;
    expect(Object.keys(skeleton).length).toBeGreaterThan(150);

    const raw = pastContainer({
      'ORG-A': {
        visits: Array.from({ length: 20 }, (_, i) => ({ ...skeleton, ...OFFICE_VISIT, Csn: `CSN-${i}` })),
      },
    });
    const rawSize = JSON.stringify(raw).length;
    const summarySize = JSON.stringify(summarizePastVisits(raw)).length;
    expect(summarySize).toBeLessThan(rawSize / 10);
  });
});

describe('summarizeUpcomingVisits', () => {
  it('keeps the three buckets apart because they mean different things', () => {
    const summary = summarizeUpcomingVisits({
      InProgressVisits: [visit({ Csn: 'now', VisitTypeName: 'Telehealth' })],
      NextNDaysVisits: [visit({ Csn: 'soon', VisitTypeName: 'Lab Work' })],
      LaterVisitsList: [visit({ Csn: 'later', VisitTypeName: 'Annual Physical' })],
      HighlightDays: [],
      HasPVG: false,
    });

    expect(summary.in_progress.map((v) => v.csn)).toEqual(['now']);
    expect(summary.next_days.map((v) => v.csn)).toEqual(['soon']);
    expect(summary.later.map((v) => v.csn)).toEqual(['later']);
    expect(summary.count).toBe(3);
  });

  it('passes a non-container payload through untouched', () => {
    const error = { visits: [], error: 'Authentication error: could not get CSRF token for visits' };
    expect(isUpcomingVisitsContainer(error)).toBe(false);
    expect(UPCOMING_VISITS_SUMMARY.project(error)).toBe(error);
  });
});

describe('summaries declared on the capability', () => {
  it('is what the visit capabilities carry, and nothing else does yet', () => {
    expect(CAPABILITIES.filter((c) => c.summary).map((c) => c.id).sort()).toEqual([
      'get_past_visits',
      'get_upcoming_visits',
    ]);
  });

  it('gives every summary a note that names the full_detail escape hatch', () => {
    // A condensed payload a caller cannot opt out of is a payload with data
    // silently missing from it.
    for (const capability of CAPABILITIES.filter((c) => c.summary)) {
      expect(capability.summary!.note, capability.id).toContain(FULL_DETAIL_PARAM.name);
    }
  });
});
