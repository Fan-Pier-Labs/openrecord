import { describe, it, expect } from 'bun:test';
import { conformToShape } from '../../lib/shape';
import * as shapes from '../realShapes';
import { upcomingVisits, pastVisits } from '../homer';

/**
 * The fields a reader reaches for first. If one is blank on a fixture visit,
 * the fake is lying about the record — see "The trap" in fake-mychart/README.md
 * for why `conformToShape` makes a forgotten field indistinguishable from an
 * empty one.
 *
 * This file is the authority on the fixture's internal consistency; the
 * integration suite only checks that the route serves what's here.
 */
const REQUIRED_VISIT_FIELDS = [
  'PrimaryDate', 'Instant', 'Dat', 'Date', 'ShortDate', 'HighlightDate', 'Time',
  'DateOfMonth', 'Year', 'VisitTypeName', 'PrimaryProviderName', 'Csn',
] as const;

/** Keys the fixture used to invent. None of them exists on a real instance. */
const NON_EPIC_FIELDS = [
  'VisitType', 'Location', 'LocationAddress',
  'CancelRescheduleLink', 'ScheduleNewLink', 'VisitProviderAppointment',
] as const;

type ConformedVisit = Record<string, unknown>;

function conformedUpcoming(): ConformedVisit[] {
  const container = conformToShape(shapes.visitsLoadUpcoming, upcomingVisits) as {
    LaterVisitsList: ConformedVisit[]; NextNDaysVisits: ConformedVisit[]; InProgressVisits: ConformedVisit[];
  };
  return [...container.InProgressVisits, ...container.NextNDaysVisits, ...container.LaterVisitsList];
}

function conformedPast(): ConformedVisit[] {
  // LoadPast wraps each org's page in List[orgId].List; conform against that
  // element shape, which is the same visit skeleton the route serves.
  const visitShape = shapes.visitsLoadPast.List['*'].List[0];
  return pastVisits.PastVisitsList.map((v) => conformToShape(visitShape, v) as ConformedVisit);
}

describe('homer visit fixtures', () => {
  it('has visits to check', () => {
    expect(conformedUpcoming().length).toBeGreaterThan(0);
    expect(conformedPast().length).toBeGreaterThan(0);
  });

  for (const [label, visits] of [['upcoming', conformedUpcoming()], ['past', conformedPast()]] as const) {
    it(`serves every ${label} visit with its display fields populated, not shadowed by empty strings`, () => {
      for (const visit of visits) {
        const blank = REQUIRED_VISIT_FIELDS.filter((f) => !visit[f]);
        expect({ csn: visit.Csn, blank }).toEqual({ csn: visit.Csn, blank: [] });
      }
    });

    it(`gives every ${label} visit a named provider and department`, () => {
      for (const visit of visits) {
        const providers = visit.Providers as { Name: string }[];
        expect(providers.length).toBeGreaterThan(0);
        expect(providers[0]!.Name).not.toBe('');
        expect((visit.PrimaryDepartment as { Name: string }).Name).not.toBe('');
        expect((visit.PrimaryDepartment as { Address: string[] }).Address.length).toBeGreaterThan(0);
      }
    });

    it(`invents no ${label}-visit field real MyChart doesn't have`, () => {
      for (const visit of visits) {
        expect(NON_EPIC_FIELDS.filter((f) => f in visit)).toEqual([]);
      }
    });

    it(`keeps every ${label} visit's derived date fields agreeing with PrimaryDate`, () => {
      for (const visit of visits) {
        // PrimaryDate is the wall clock the rest are derived from. Split it
        // here rather than through `new Date`, whose parse depends on the
        // process timezone (see visitWhen in the fixture).
        const [date, time, meridiem] = (visit.PrimaryDate as string).split(' ');
        const [mm, dd, yyyy] = date!.split('/').map(Number) as [number, number, number];
        const [hh, min] = time!.split(':').map(Number) as [number, number];

        expect(visit.Year).toBe(String(yyyy));
        expect(visit.Month).toBe(mm);
        expect(visit.DateOfMonth).toBe(String(dd));
        expect(visit.IsAM).toBe(meridiem === 'AM');
        expect(visit.ShortDate).toBe(`${mm}/${dd}/${yyyy}`);
        expect(visit.HighlightDate).toBe(visit.ShortDate);
        expect(visit.Time).toBe(`${hh % 12 === 0 ? 12 : hh % 12}:${String(min).padStart(2, '0')} ${meridiem}`);
        expect(visit.Date).toContain(`${dd}, ${yyyy}`);

        // Instant is the machine-readable twin the scraper sorts on. It must
        // point at the same wall clock, and be host-timezone independent.
        const instantMs = Number(/^\/Date\((\d+)\)\/$/.exec(visit.Instant as string)?.[1]);
        expect(Number.isFinite(instantMs)).toBe(true);
        expect(new Date(instantMs).toISOString()).toBe(
          `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}` +
          `T${String(meridiem === 'PM' ? (hh % 12) + 12 : hh % 12).padStart(2, '0')}:${String(min).padStart(2, '0')}:00.000Z`,
        );
      }
    });
  }

  it('highlights a day for every upcoming visit', () => {
    const container = conformToShape(shapes.visitsLoadUpcoming, upcomingVisits) as { HighlightDays: string[] };
    // Derived from the visits in the fixture, so this only has to prove the
    // wiring survives conformToShape — not that the two lists agree.
    expect(container.HighlightDays.length).toBeGreaterThan(0);
    expect(container.HighlightDays).not.toContain('');
  });
});
