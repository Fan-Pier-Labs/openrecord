/**
 * Condensed renderings of raw scraper payloads, for clients that hand results
 * to a model.
 *
 * The division of labour is deliberate and one-way: **scrapers return
 * everything MyChart returns.** A scraper that drops a field is a scraper that
 * silently loses a patient's data, and there is no way to get it back short of
 * another round trip. So the trimming happens at the presentation edge, where
 * it is reversible — every summarized tool still takes `full_detail` to opt
 * back into the untouched payload.
 *
 * The problem this solves is real rather than aesthetic. `get_past_visits`
 * over 20 visits returns ~220 KB: MyChart's visit object carries 159 fields,
 * of which four or five are load-bearing (when, what, who, where, and the CSN
 * that the follow-up tools take), and the rest are UI affordances — which
 * buttons the web portal should render. Handing that to a model burns the
 * context window that the answer needs to live in.
 *
 * This file holds only the **projections**. Which capability has one is
 * declared on the capability itself (`summary` in `shared/capabilities.ts`,
 * next to `rendersMedia`), so there is no second registry keyed by a string id
 * that a typo could silently miss and only one client could see.
 */

import { parseInstant, visitTimestamp } from '../scrapers/myChart/chart/visits/visits';
import type {
  PastVisitsContainer,
  Visit,
  VisitListContainer,
} from '../scrapers/myChart/chart/visits/types';

/**
 * A capability's condensed rendering: the projection, plus the note that tells
 * the model what it is looking at and how to get the rest.
 *
 * `project` takes and returns `unknown` on purpose. A payload that isn't what
 * the projection expects — a scrape error, a WAF interstitial — comes back
 * verbatim, because summarizing an error into nothing hides why the scrape
 * failed. The narrowing lives inside each projection, where the type guard can
 * be precise; the functions it guards are typed exactly.
 */
export interface CapabilitySummary {
  note: string;
  project: (payload: unknown) => unknown;
}

/**
 * The opt-out every summarized tool carries. Declared here, next to the
 * projections, so a client cannot register the condensing without also
 * offering the way back to the raw payload.
 */
export const FULL_DETAIL_PARAM = {
  name: 'full_detail',
  type: 'boolean',
  description:
    'Return the raw, unabridged MyChart payload instead of the condensed one. Large — only worth it when a specific field is missing from the summary.',
} as const;

// ── Visits ──────────────────────────────────────────────────────────────────

/** One visit, cut down to what a model actually reasons over. */
export interface VisitSummary {
  /** ISO-8601 instant when MyChart gave us a parseable one, else the raw `PrimaryDate`. */
  date: string;
  /** `VisitTypeName` — "Office Visit", "ER Visit", … */
  type?: string;
  provider?: string;
  /** Every other attending, when the visit had more than one. */
  other_providers?: string[];
  /** `PrimaryDepartment` — the clinic/unit, with its city line when MyChart gives one. */
  location?: string;
  /** The encounter id. get_visit_notes / get_note_content / get_visit_avs all take it. */
  csn?: string;
  /** Only when the account spans more than one health system. */
  organization?: string;
  chief_complaint?: string;
  diagnoses?: string[];
  /** Inpatient stays only. */
  admitted?: string;
  discharged?: string;
  procedures?: string[];
  /** Present and true only when they are — a false flag on every row is noise. */
  no_show?: boolean;
  canceled?: boolean;
  /** Whether get_visit_notes / get_visit_avs are worth calling for this CSN. */
  has_notes?: boolean;
  has_summary?: boolean;
}

/**
 * The type of an object literal after {@link compact}: keys that could be
 * undefined become genuinely optional (and lose the `| undefined`), the rest
 * stay required. Without this the projections don't typecheck under
 * `exactOptionalPropertyTypes`.
 */
type Compacted<T> =
  { [K in keyof T as undefined extends T[K] ? K : never]?: Exclude<T[K], undefined> } &
  { [K in keyof T as undefined extends T[K] ? never : K]: T[K] };

/** Drop keys whose value is undefined, so absent facts cost nothing. */
function compact<T extends object>(o: T): Compacted<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Compacted<T>;
}

/** A non-empty trimmed string, or undefined. MyChart writes "absent" as `""` as often as null. */
function text(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t === '' ? undefined : t;
}

/**
 * The best date we can state for a visit.
 *
 * `Instant` is an absolute epoch-millis stamp, so it renders as ISO-8601.
 * `PrimaryDate` ("01/10/2026 09:00:00 AM") is local-time prose with no zone,
 * so it is passed through verbatim rather than parsed into a precision it
 * cannot justify — but it still beats reporting no date at all.
 */
function visitDate(visit: Partial<Visit>): string {
  const instant = parseInstant(visit.Instant);
  if (instant !== null) return new Date(instant).toISOString();
  return text(visit.PrimaryDate) ?? '';
}

/**
 * The department, plus the city/state line when MyChart supplies an address.
 * `Address` is an array of address lines; the last one carries the city, which
 * is the part that distinguishes two clinics with the same name.
 */
function visitLocation(visit: Partial<Visit>): string | undefined {
  const dept = visit.PrimaryDepartment;
  const name = text(dept?.Name);
  if (!name) return undefined;
  const lines = Array.isArray(dept?.Address) ? dept.Address.map(text).filter((l): l is string => !!l) : [];
  const city = lines.length > 1 ? lines[lines.length - 1] : undefined;
  return city ? `${name}, ${city}` : name;
}

function providerNames(providers: Visit['Providers'] | undefined): string[] {
  if (!Array.isArray(providers)) return [];
  return providers.map((p) => text(p?.Name)).filter((n): n is string => !!n);
}

/**
 * Project one raw MyChart visit down to {@link VisitSummary}.
 *
 * Exported because both visit capabilities use it — MyChart returns the
 * identical 159-field object for past and upcoming visits alike.
 */
export function summarizeVisit(visit: Partial<Visit>, organization?: string): VisitSummary {
  const names = providerNames(visit.Providers);
  const primaryProvider = text(visit.PrimaryProviderName) ?? text(visit.PrimaryProvider?.Name) ?? names[0];
  const others = names.filter((n) => n !== primaryProvider);

  const diagnoses = Array.isArray(visit.Diagnoses)
    ? visit.Diagnoses
        .map((d) => {
          const description = text(d?.Description);
          const code = text(d?.Code);
          if (description && code) return `${description} (${code})`;
          return description ?? code;
        })
        .filter((d): d is string => !!d)
    : [];

  const procedures = Array.isArray(visit.SurgicalProcedures)
    ? visit.SurgicalProcedures.map((p) => text(p?.Name)).filter((p): p is string => !!p)
    : [];

  return compact({
    date: visitDate(visit),
    type: text(visit.VisitTypeName),
    provider: primaryProvider,
    other_providers: others.length ? others : undefined,
    location: visitLocation(visit),
    csn: text(visit.Csn) ?? text(visit.CsnForECheckIn),
    organization,
    chief_complaint: text(visit.ChiefComplaint),
    diagnoses: diagnoses.length ? diagnoses : undefined,
    admitted: text(visit.AdmissionDateRange?.Start),
    discharged: text(visit.DischargeDate) ?? text(visit.AdmissionDateRange?.End),
    procedures: procedures.length ? procedures : undefined,
    no_show: visit.IsNoShow ? true : undefined,
    canceled: visit.IsCanceled ? true : undefined,
    has_notes: visit.IsClinicalNoteAvailable || visit.IsClinicalInformationAvailable ? true : undefined,
    has_summary: visit.IsVisitSummaryEnabled ? true : undefined,
  });
}

export interface PastVisitsSummary {
  visits: VisitSummary[];
  count: number;
  /** True when MyChart still had older visits to give — ask for more `years_back`. */
  has_more?: boolean;
  note: string;
}

const PAST_VISITS_NOTE =
  'Condensed view. Pass full_detail: true for the raw MyChart payload (~150 fields per visit, mostly portal UI flags). ' +
  'Use a visit\'s csn with get_visit_notes, get_note_content or get_visit_avs to read what happened at it.';

/**
 * A `LoadPast` response, as opposed to a scrape error or a WAF interstitial.
 * `List` — the per-organization map — is the field that distinguishes them.
 */
export function isPastVisitsContainer(payload: unknown): payload is PastVisitsContainer {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    typeof (payload as PastVisitsContainer).List === 'object' &&
    (payload as PastVisitsContainer).List !== null
  );
}

/**
 * Flatten a {@link PastVisitsContainer} — `List` keyed by organization id,
 * each holding its own page of visits — into one newest-first array.
 *
 * The per-organization nesting is a real distinction only for accounts linked
 * to several health systems, which is the minority; for everyone else it is a
 * layer of wrapping around a single key. So the org survives as a field on
 * each visit (and only when there is more than one), not as a level of
 * structure the reader has to walk.
 */
export function summarizePastVisits(container: PastVisitsContainer): PastVisitsSummary {
  const orgs = Object.entries(container.List);
  const multiOrg = orgs.length > 1;

  const rows = orgs.flatMap(([orgId, org]) => {
    const orgName = multiOrg ? (text(org?.Organization?.OrganizationName) ?? orgId) : undefined;
    return (Array.isArray(org?.List) ? org.List : []).map((visit) => ({ visit, orgName }));
  });

  // Sort the raw visits, then project: `visitTimestamp` reads MyChart's own
  // fields, so the projection never has to carry a sort key it does not
  // otherwise need.
  rows.sort((a, b) => (visitTimestamp(b.visit) ?? 0) - (visitTimestamp(a.visit) ?? 0));

  const visits = rows.map(({ visit, orgName }) => summarizeVisit(visit, orgName));

  return compact({
    visits,
    count: visits.length,
    has_more: orgs.some(([, org]) => org?.HasMoreData) ? true : undefined,
    note: PAST_VISITS_NOTE,
  });
}

export const PAST_VISITS_SUMMARY: CapabilitySummary = {
  note: PAST_VISITS_NOTE,
  project: (payload) => (isPastVisitsContainer(payload) ? summarizePastVisits(payload) : payload),
};

export interface UpcomingVisitsSummary {
  in_progress: VisitSummary[];
  next_days: VisitSummary[];
  later: VisitSummary[];
  count: number;
  note: string;
}

const UPCOMING_VISITS_NOTE =
  'Condensed view. Pass full_detail: true for the raw MyChart payload (~150 fields per visit, mostly portal UI flags).';

const UPCOMING_BUCKETS = ['InProgressVisits', 'NextNDaysVisits', 'LaterVisitsList'] as const;

/** A `LoadUpcoming` response: at least one of its three visit buckets is an array. */
export function isUpcomingVisitsContainer(payload: unknown): payload is VisitListContainer {
  if (typeof payload !== 'object' || payload === null) return false;
  return UPCOMING_BUCKETS.some((bucket) => Array.isArray((payload as VisitListContainer)[bucket]));
}

/**
 * Project a {@link VisitListContainer}. Unlike past visits these three buckets
 * mean different things — happening now, within MyChart's near window, and
 * everything after — so they are kept as separate keys rather than merged.
 */
export function summarizeUpcomingVisits(container: VisitListContainer): UpcomingVisitsSummary {
  const project = (list: Visit[] | undefined): VisitSummary[] =>
    (Array.isArray(list) ? list : []).map((v) => summarizeVisit(v));

  const in_progress = project(container.InProgressVisits);
  const next_days = project(container.NextNDaysVisits);
  const later = project(container.LaterVisitsList);

  return {
    in_progress,
    next_days,
    later,
    count: in_progress.length + next_days.length + later.length,
    note: UPCOMING_VISITS_NOTE,
  };
}

export const UPCOMING_VISITS_SUMMARY: CapabilitySummary = {
  note: UPCOMING_VISITS_NOTE,
  project: (payload) => (isUpcomingVisitsContainer(payload) ? summarizeUpcomingVisits(payload) : payload),
};
