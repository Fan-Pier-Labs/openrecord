/**
 * Open appointment availability, to anyone, with no account.
 *
 * `providerDirectory.ts` reads *who* an org lets you book. This reads *when*.
 * Both live behind the same anonymous `/<mount>/OpenScheduling` workflow and
 * share its session and antiforgery token; this module adds the third POST the
 * page makes once a specialty is chosen:
 *
 *   POST Scheduling/Anonymous/GetSlots
 *        workflow[…] & appointmentBuilder[…] & startDte & continueInfo[…]
 *     → Solutions[{ Slots[], HasPassedFilterCheck }], ContinueInfo, ErrorCode
 *
 * The endpoint name is not special-cased anywhere in Epic's client: its own
 * `$$WPSchedulingUtil.GetEndpointUrl(action, workflow)` prefixes *every*
 * scheduling action with `Scheduling/Anonymous/` whenever the workflow carries
 * `IsAnonymous`. So the anonymous surface mirrors the logged-in scheduling API
 * action for action — `GetSlots`, `ReserveAppointment`, `ReviewAppointment`,
 * `DeleteReservationFromSlot`, `CreateSecureSession`. This module implements
 * the read half only; see "What this deliberately does not do" below.
 *
 * ## What comes back
 *
 * A `Solution` is one bookable offer: a provider at a department, with the
 * slots that match. Slots carry both Epic's internal day number and a plain
 * `DisplayDateTimeUtc` ISO string; this module surfaces the ISO string and
 * keeps the raw record so nothing is lost.
 *
 * ## Paging
 *
 * The search is incremental, not offset-based. Each response returns a
 * `ContinueInfo` cursor — a date range plus a `NextProviderIndex` like
 * `"16^1"` — that must be echoed back verbatim to get the next tranche. The
 * server decides how far to walk per call, and sets `IsStopSearch` when the
 * walk is finished. `ErrorCode` carries back-pressure: the instance throttles
 * a caller that pages too hard, and says so rather than returning junk.
 *
 * ## What this deliberately does not do
 *
 * It never reserves, reviews, or books. `ReserveAppointment` places a real
 * hold on a real clinic's calendar and `ReviewAppointment`/`ScheduleAppointment`
 * create a real appointment for a real person — side effects on a live health
 * system, not scraping. Those actions also gate on a CAPTCHA and on identity
 * the org is entitled to verify, which this module has no business supplying.
 * Availability is public; booking is not ours to automate unattended.
 *
 * Nor does it expose a provider's *booked* appointments: MyChart never sends
 * those to an anonymous caller, and they would be patient data if it did. What
 * `fetchProviderAvailability` returns is the open half of a calendar only.
 */

import type { MyChartRequest } from '../core/myChartRequest';
import { logger } from '../../../shared/logger';
import { openPreloginPage, postForm } from './preloginSession';
import { OPEN_SCHEDULING_PATH } from './providerDirectory';
import type { OpenSlot, SlotSearchResult } from './types';

const SLOTS_PATH = '/Scheduling/Anonymous/GetSlots';
const SPECIALTY_DATA_PATH = '/Scheduling/Anonymous/GetSpecialtyData';
const WORKFLOW_DATA_PATH = '/Scheduling/Anonymous/GetSchedulingWorkflowData';

/**
 * Epic counts days from 1840-12-31 (the MUMPS `$HOROLOG` epoch), and every
 * date in the scheduling payloads — `Dte`, `SearchRangeStartDte`, `startDte` —
 * is that number. Verified against a live response: Dte 67821 is 2026-09-08.
 */
export const EPIC_EPOCH_UTC = Date.UTC(1840, 11, 31);

export function toEpicDte(date: Date): number {
  return Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - EPIC_EPOCH_UTC) / 86_400_000);
}

export function fromEpicDte(dte: number): Date {
  return new Date(EPIC_EPOCH_UTC + dte * 86_400_000);
}

// ── Raw shapes ───────────────────────────────────────────────────────────────

type RawSlot = {
  ProviderId?: string | null;
  DepartmentId?: string | null;
  VisitTypeId?: string | null;
  DisplayDateTimeUtc?: string | null;
  DateString?: string | null;
  TimeString?: string | null;
  TimeZoneMarker?: string | null;
  LengthInMinutes?: number | null;
  TelehealthMode?: number | null;
  Dte?: number | null;
};

type RawSolution = { Slots?: RawSlot[] | null; HasPassedFilterCheck?: boolean };

/** The paging cursor. Echoed back verbatim; its fields are Epic's to define. */
export type ContinueInfo = {
  State?: number;
  SearchRangeStartDte?: number;
  SearchRangeEndDte?: number;
  NextProviderIndex?: string;
  IsStopSearch?: boolean;
};

export type RawSlotsResponse = {
  Solutions?: RawSolution[] | null;
  ContinueInfo?: ContinueInfo | null;
  ErrorCode?: number | string | null;
};

// ── Parsing ──────────────────────────────────────────────────────────────────

export function parseSlot(raw: RawSlot): OpenSlot | null {
  if (typeof raw?.ProviderId !== 'string' || typeof raw?.DepartmentId !== 'string') return null;
  return {
    providerId: raw.ProviderId,
    clinicId: raw.DepartmentId,
    visitTypeId: raw.VisitTypeId ?? null,
    startUtc: raw.DisplayDateTimeUtc ?? null,
    localDate: raw.DateString ?? null,
    localTime: raw.TimeString ?? null,
    timeZoneMarker: raw.TimeZoneMarker ?? null,
    lengthInMinutes: typeof raw.LengthInMinutes === 'number' ? raw.LengthInMinutes : null,
    /** 1 = in person, 2 = video, on every instance captured so far. */
    telehealthMode: typeof raw.TelehealthMode === 'number' ? raw.TelehealthMode : null,
    raw,
  };
}

export function parseSlotsResponse(data: RawSlotsResponse): OpenSlot[] {
  const out: OpenSlot[] = [];
  for (const solution of data.Solutions ?? []) {
    for (const raw of solution?.Slots ?? []) {
      const slot = parseSlot(raw);
      if (slot) out.push(slot);
    }
  }
  return out;
}

/**
 * Whether the walk is finished.
 *
 * Epic stops when it says so (`IsStopSearch`), and also when it stops moving:
 * a cursor identical to the one just sent means the server has no more ground
 * to cover, and echoing it again would loop forever.
 */
export function isSearchComplete(previous: ContinueInfo | null, next: ContinueInfo | null | undefined): boolean {
  if (!next) return true;
  if (next.IsStopSearch === true) return true;
  return previous !== null && JSON.stringify(previous) === JSON.stringify(next);
}

/** `ErrorCode` is set when the instance is throttling or cannot search. */
export function hasError(data: RawSlotsResponse): boolean {
  return data.ErrorCode !== null && data.ErrorCode !== undefined && data.ErrorCode !== 0;
}

// ── Fetching ─────────────────────────────────────────────────────────────────

export type OpenSlotsOptions = {
  /** Specialty name or id. Defaults to the first the instance lists. */
  specialty?: string;
  /** Reason-for-visit title or id. Defaults to the first directly schedulable one. */
  reasonForVisit?: string;
  /** Only search these provider ids. Unset means every provider in the specialty. */
  providerIds?: string[];
  /** First day to search. Defaults to today. */
  startDate?: Date;
  /** Stop after this many `GetSlots` round trips. Paging is server-paced. */
  maxPages?: number;
  /**
   * Cap on provider/department pairs sent per search. Epic's own page sends
   * the full set; a large specialty is ~200 pairs and makes for a slow search.
   */
  maxPairs?: number;
};

type RawPair = { ProviderId: string; DepartmentId: string };

/**
 * Search open appointment availability on an instance, anonymously.
 *
 * Walks the same three calls the "Find a Doctor" page makes — workflow,
 * specialty, then `GetSlots` until the server says it is done.
 */
export async function fetchOpenSlots(
  request: MyChartRequest,
  options: OpenSlotsOptions = {},
): Promise<SlotSearchResult> {
  const page = await openPreloginPage(request, OPEN_SCHEDULING_PATH);
  const workflow = await postForm<{ Specialties?: { Id: string; Name: string }[] }>(
    request,
    WORKFLOW_DATA_PATH,
    page.token,
    { schedulingParameters: { workflow: 'NewProvider' }, isFirstLoad: true },
    OPEN_SCHEDULING_PATH,
  );

  const specialties = workflow.Specialties ?? [];
  const wanted = options.specialty?.trim().toLowerCase();
  const specialty = wanted
    ? specialties.find((s) => s.Name.toLowerCase() === wanted || s.Id.toLowerCase() === wanted)
    : specialties[0];
  if (!specialty) {
    throw new Error(
      wanted
        ? `no specialty named ${JSON.stringify(options.specialty)} on ${request.hostname}`
        : `${request.hostname} lists no open-scheduling specialties`,
    );
  }

  const specialtyData = await postForm<{
    ProviderDepartmentPairs?: RawPair[] | null;
    ReasonsForVisit?: { Id: string; Title?: string | null; CategoryValue?: string | null; CanDirectSchedule?: boolean; DefaultVisitTypeId?: string | null }[] | null;
    VisitTypes?: { ID: string }[] | null;
  }>(request, SPECIALTY_DATA_PATH, page.token, { SpecialtyId: specialty.Id }, OPEN_SCHEDULING_PATH);

  const reasons = specialtyData.ReasonsForVisit ?? [];
  const wantedRfv = options.reasonForVisit?.trim().toLowerCase();
  const reason =
    (wantedRfv ? reasons.find((r) => r.Title?.toLowerCase() === wantedRfv || r.Id.toLowerCase() === wantedRfv) : null) ??
    reasons.find((r) => r.CanDirectSchedule) ??
    reasons[0] ??
    null;
  const visitTypeId = reason?.DefaultVisitTypeId ?? specialtyData.VisitTypes?.[0]?.ID ?? null;

  let pairs = (specialtyData.ProviderDepartmentPairs ?? []).filter(
    (p) => typeof p?.ProviderId === 'string' && typeof p?.DepartmentId === 'string',
  );
  if (options.providerIds?.length) {
    const keep = new Set(options.providerIds);
    pairs = pairs.filter((p) => keep.has(p.ProviderId));
  }
  if (options.maxPairs !== undefined && options.maxPairs >= 0) pairs = pairs.slice(0, options.maxPairs);
  if (pairs.length === 0) {
    return { specialty: { id: specialty.Id, name: specialty.Name }, slots: [], pages: 0, throttled: false, complete: true };
  }

  const startDte = toEpicDte(options.startDate ?? new Date());
  const maxPages = options.maxPages ?? 10;
  const slots: OpenSlot[] = [];
  let cursor: ContinueInfo | null = null;
  let pages = 0;
  let throttled = false;
  let complete = false;

  while (pages < maxPages) {
    const body: Record<string, unknown> = {
      workflow: { Type: 'NewProvider', FinderType: 'Provider', IsGuest: true, IsAnonymous: true, IsFromPrelogin: true },
      appointmentBuilder: {
        Appointments: [{ VisitTypeId: visitTypeId, ProviderDepartmentPairs: pairs, Slot: '', SearchStartDte: startDte }],
        ReasonForVisitLine: reason?.Id ?? null,
        ReasonForVisitValue: reason?.CategoryValue ?? null,
      },
      startDte,
      useSchedulingPreferences: false,
    };
    if (cursor) body.continueInfo = cursor;

    const data: RawSlotsResponse = await postForm<RawSlotsResponse>(
      request,
      SLOTS_PATH,
      page.token,
      body,
      OPEN_SCHEDULING_PATH,
    );
    pages++;
    slots.push(...parseSlotsResponse(data));

    if (hasError(data)) {
      throttled = true;
      logger.debug(`GetSlots on ${request.hostname} returned ErrorCode ${String(data.ErrorCode)} — stopping`);
      break;
    }
    if (isSearchComplete(cursor, data.ContinueInfo)) {
      complete = true;
      break;
    }
    cursor = data.ContinueInfo ?? null;
  }

  return { specialty: { id: specialty.Id, name: specialty.Name }, slots, pages, throttled, complete };
}

/**
 * Every open slot one provider has, across the departments they book at.
 *
 * This is the open half of a doctor's calendar and nothing more — MyChart does
 * not tell an anonymous caller which slots are taken, only which are free.
 */
export async function fetchProviderAvailability(
  request: MyChartRequest,
  providerId: string,
  options: Omit<OpenSlotsOptions, 'providerIds'> = {},
): Promise<SlotSearchResult> {
  return fetchOpenSlots(request, { ...options, providerIds: [providerId] });
}
