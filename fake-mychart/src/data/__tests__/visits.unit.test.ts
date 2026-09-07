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

/** `instantMs` as 'MM/DD/YYYY HH:MM' in `zone` — the clinic's own wall clock. */
function renderInZone(instantMs: number, zone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(instantMs));
  const at = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${at('month')}/${at('day')}/${at('year')} ${String(Number(at('hour')) % 24).padStart(2, '0')}:${at('minute')}`;
}

/** What Instant would read if the wall clock had simply been stamped as UTC. */
function naiveWallClockIso(primaryDate: string): string {
  const [date, time, meridiem] = primaryDate.split(' ');
  const [mm, dd, yyyy] = date!.split('/') as [string, string, string];
  const [hh, min] = time!.split(':') as [string, string];
  const hour24 = meridiem === 'PM' ? (Number(hh) % 12) + 12 : Number(hh) % 12;
  return `${yyyy}-${mm}-${dd}T${String(hour24).padStart(2, '0')}:${min}`;
}

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

        // Instant is the machine-readable twin a client builds a reminder
        // from. PrimaryDate is the clinic's wall clock and Instant is the
        // absolute time, so the two differ by the department's UTC offset --
        // stamping the wall clock with a `Z` instead puts every reminder off
        // by that offset. Rendering Instant back into the row's own TimeZone
        // has to give the wall clock back, on any host.
        const instantMs = Number(/^\/Date\((\d+)\)\/$/.exec(visit.Instant as string)?.[1]);
        expect(Number.isFinite(instantMs)).toBe(true);
        expect(renderInZone(instantMs, visit.TimeZone as string)).toBe(
          `${String(mm).padStart(2, '0')}/${String(dd).padStart(2, '0')}/${yyyy} ` +
          `${String(meridiem === 'PM' ? (hh % 12) + 12 : hh % 12).padStart(2, '0')}:${String(min).padStart(2, '0')}`,
        );
      }
    });
  }

  it('offsets Instant from the wall clock, rather than stamping it with a Z', () => {
    // A regression guard with a value in it: the two fixture zones are both
    // behind UTC, so an Instant equal to the naive wall clock means the
    // conversion was skipped. Without this the suite above still passes when
    // TimeZone is dropped to UTC.
    for (const visit of [...conformedUpcoming(), ...conformedPast()]) {
      const instantMs = Number(/^\/Date\((\d+)\)\/$/.exec(visit.Instant as string)?.[1]);
      expect({ csn: visit.Csn, naive: false }).toEqual({
        csn: visit.Csn,
        naive: new Date(instantMs).toISOString().slice(0, 16) === naiveWallClockIso(visit.PrimaryDate as string),
      });
    }
  });

  it('highlights a day for every upcoming visit', () => {
    const container = conformToShape(shapes.visitsLoadUpcoming, upcomingVisits) as { HighlightDays: string[] };
    // Derived from the visits in the fixture, so this only has to prove the
    // wiring survives conformToShape — not that the two lists agree.
    expect(container.HighlightDays.length).toBeGreaterThan(0);
    expect(container.HighlightDays).not.toContain('');
  });
});
