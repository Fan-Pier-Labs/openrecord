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
import { postForm } from './preloginSession';
import { fetchSchedulingWorkflow, fetchSpecialtyData, OPEN_SCHEDULING_PATH, parseSpecialties } from './providerDirectory';
import { walkSchedulingQuestionnaire, type QuestionAnswer } from './schedulingQuestionnaire';
import type { OpenSlot, QuestionnaireState, SlotSearchResult, Specialty } from './types';

const SLOTS_PATH = '/Scheduling/Anonymous/GetSlots';

/**
 * Epic counts days from 1840-12-31 (the MUMPS `$HOROLOG` epoch), and every
 * date in the scheduling payloads — `Dte`, `SearchRangeStartDte`, `startDte` —
 * is that number. Verified against a live response: Dte 67821 is 2026-09-08.
 */
export const EPIC_EPOCH_UTC = Date.UTC(1840, 11, 31);

export function toEpicDte(date: Date): number {
  return Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - EPIC_EPOCH_UTC) / 86_400_000);
}

/**
 * Today, by the wall clock rather than UTC.
 *
 * Epic's page sends the browser's local date. Deriving it from UTC would skip
 * the rest of the current day for anyone west of Greenwich in the evening —
 * at 9pm Pacific, UTC is already tomorrow — which reads as "the scraper never
 * finds same-day slots".
 */
export function localTodayDte(now: Date = new Date()): number {
  return toEpicDte(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}

export function fromEpicDte(dte: number): Date {
  return new Date(EPIC_EPOCH_UTC + dte * 86_400_000);
}

// ── Raw shapes ───────────────────────────────────────────────────────────────

export type RawSlot = {
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
 *
 * The comparison is `JSON.stringify` on purpose: the cursor is the server's own
 * object echoed back untouched, so its key order is the server's to keep and a
 * structural compare would only be slower.
 */
export function isSearchComplete(previous: ContinueInfo | null, next: ContinueInfo | null | undefined): boolean {
  if (!next) return true;
  if (next.IsStopSearch === true) return true;
  return previous !== null && JSON.stringify(previous) === JSON.stringify(next);
}

/**
 * The instance's own error code for this search, or null.
 *
 * Deliberately not interpreted. A non-zero code covers both "you are paging
 * too hard, back off" and "this search cannot be run", and the code table is
 * not published — so the number is passed through and the caller decides,
 * rather than being told `throttled` and retrying a search that will never
 * succeed.
 */
export function errorCodeOf(data: RawSlotsResponse): number | string | null {
  const code = data.ErrorCode;
  if (code === null || code === undefined || code === 0) return null;
  return code;
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
  /**
   * Answers to the screening questionnaire, when the org attaches one. Without
   * them a gated instance answers `LqfAnswersRequired` and the result carries
   * the questions instead of slots — see `schedulingQuestionnaire.ts`.
   */
  answers?: QuestionAnswer[];
};

type RawPair = { ProviderId: string; DepartmentId: string; IsTeamMember?: boolean };

type RawReason = {
  Id: string;
  Title?: string | null;
  CategoryValue?: string | null;
  CanDirectSchedule?: boolean;
  DefaultVisitTypeId?: string | null;
  /**
   * The provider/department pairs bookable under this reason, as
   * `"<ProviderId>^<DepartmentId>"` composites — not indices into
   * `ProviderDepartmentPairs`.
   */
  DirectProviderDepartmentPairIDs?: string[] | null;
};

type RawVisitType = { ID: string; AnonymousSchedulingDecisionTreeId?: string | null };

type RawSpecialtyPayload = {
  ProviderDepartmentPairs?: RawPair[] | null;
  ReasonsForVisit?: RawReason[] | null;
  VisitTypes?: RawVisitType[] | null;
};

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
  const { token, data: workflowData } = await fetchSchedulingWorkflow(request);
  const specialties = parseSpecialties(workflowData);

  const wanted = options.specialty?.trim().toLowerCase();
  const specialty: Specialty | undefined = wanted
    ? specialties.find((s) => s.name.toLowerCase() === wanted || s.id.toLowerCase() === wanted)
    : specialties[0];
  if (!specialty) {
    throw new Error(
      wanted
        ? `no specialty named ${JSON.stringify(options.specialty)} on ${request.hostname} — it lists ${specialties.map((s) => s.name).join(', ') || 'none'}`
        : `${request.hostname} lists no open-scheduling specialties`,
    );
  }

  const specialtyData = await fetchSpecialtyData<RawSpecialtyPayload>(request, token, specialty.id);
  const reasons = specialtyData.ReasonsForVisit ?? [];

  // An unknown reason throws rather than searching on a different one: a
  // silently substituted reason means a different visit type and different
  // slots, with nothing in the result saying so. Same rule as `specialty`.
  const wantedRfv = options.reasonForVisit?.trim().toLowerCase();
  let reason: RawReason | null = null;
  if (wantedRfv) {
    reason = reasons.find((r) => r.Title?.toLowerCase() === wantedRfv || r.Id.toLowerCase() === wantedRfv) ?? null;
    if (!reason) {
      throw new Error(
        `no reason for visit named ${JSON.stringify(options.reasonForVisit)} in ${specialty.name} on ` +
          `${request.hostname} — it lists ${reasons.map((r) => r.Title).filter(Boolean).join(', ') || 'none'}`,
      );
    }
  } else {
    // Falling back to a request-only reason is expected to return no slots:
    // it is the reason the org publishes when nothing is directly bookable.
    reason = reasons.find((r) => r.CanDirectSchedule) ?? reasons[0] ?? null;
  }
  const visitTypeId = reason?.DefaultVisitTypeId ?? specialtyData.VisitTypes?.[0]?.ID ?? null;
  const visitType = specialtyData.VisitTypes?.find((v) => v.ID === visitTypeId) ?? null;

  // An org can gate the search behind a screening questionnaire. Walk it now
  // so the ids are ready; with no answers this only reads the first question.
  const treeId = visitType?.AnonymousSchedulingDecisionTreeId?.trim() || null;
  let lqfIds: string[] = [];
  let patientAnswerIds: string[] = [];
  let questionnaire: QuestionnaireState | null = null;
  if (treeId) {
    const walk = await walkSchedulingQuestionnaire(request, token, treeId, visitTypeId, options.answers ?? []);
    if (walk.complete && walk.treeAnswerId) {
      lqfIds = [walk.treeId];
      patientAnswerIds = [walk.treeAnswerId];
    } else {
      questionnaire = { required: true, questions: walk.questions, unanswered: walk.unanswered };
    }
  }

  let pairs = (specialtyData.ProviderDepartmentPairs ?? [])
    .filter((p) => typeof p?.ProviderId === 'string' && typeof p?.DepartmentId === 'string')
    // Only the three keys the live page sends per pair.
    .map((p) => ({ ProviderId: p.ProviderId, DepartmentId: p.DepartmentId, IsTeamMember: p.IsTeamMember === true }));

  // Keep only the pairs actually bookable under the chosen reason.
  //
  // `ProviderDepartmentPairs` is the whole specialty; a reason for visit
  // covers a subset. Sending a pair the reason does not cover is what the
  // second refusal surface was: the instance answers 302 to the error page
  // rather than ignoring it. Some instances tolerate the full list, which is
  // why this only showed up on 59 of 577 hosts.
  const bookable = new Set(reason?.DirectProviderDepartmentPairIDs ?? []);
  if (bookable.size > 0) {
    pairs = pairs.filter((p) => bookable.has(`${p.ProviderId}^${p.DepartmentId}`));
  }
  if (options.providerIds?.length) {
    const keep = new Set(options.providerIds);
    pairs = pairs.filter((p) => keep.has(p.ProviderId));
  }
  if (options.maxPairs !== undefined && options.maxPairs >= 0) pairs = pairs.slice(0, options.maxPairs);
  if (pairs.length === 0) {
    return { specialty, slots: [], pages: 0, errorCode: null, complete: true, questionnaire };
  }

  const startDte = options.startDate ? toEpicDte(options.startDate) : localTodayDte();
  const maxPages = options.maxPages ?? 10;
  const slots: OpenSlot[] = [];
  let cursor: ContinueInfo | null = null;
  let pages = 0;
  let errorCode: number | string | null = null;
  let complete = false;

  while (pages < maxPages) {
    const body: Record<string, unknown> = {
      workflow: {
        Type: 2,
        IsGuest: false,
        IsAnonymous: true,
        IsFromPrelogin: false,
        SchedulingControllerParams: { isAnonymous: true, workflow: 'NewProvider' },
        IsAuthenticatedWidget: false,
      },
      appointmentBuilder: {
        Appointments: [
          {
            VisitTypeId: visitTypeId,
            ProviderDepartmentPairs: pairs,
            Slot: '',
            SelectedTelehealthMode: 0,
            CanSkipLicensureCheck: true,
            ...(lqfIds.length ? { LqfIds: lqfIds, PatientAnswerIds: patientAnswerIds } : {}),
          },
        ],
        ReasonForVisitLine: reason?.Id ?? null,
        ReasonForVisitValue: reason?.CategoryValue ?? null,
        SpecialtyId: specialty.id,
      },
      startDte,
      useSchedulingPreferences: false,
    };
    if (cursor) body.continueInfo = cursor;

    const data = await postForm<RawSlotsResponse>(request, SLOTS_PATH, token, body, OPEN_SCHEDULING_PATH);
    pages++;
    slots.push(...parseSlotsResponse(data));

    errorCode = errorCodeOf(data);
    if (errorCode !== null) {
      logger.debug(`GetSlots on ${request.hostname} returned ErrorCode ${String(errorCode)} — stopping`);
      break;
    }
    if (isSearchComplete(cursor, data.ContinueInfo)) {
      complete = true;
      break;
    }
    cursor = data.ContinueInfo ?? null;
  }

  return { specialty, slots, pages, errorCode, complete, questionnaire };
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
