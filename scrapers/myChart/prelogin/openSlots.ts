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
import { toEpicDte, toEpicDteLocal } from '../../../shared/epicDate';
import { postForm } from './preloginSession';
import { OPEN_SCHEDULING_PATH } from './providerDirectory';
import { resolveSchedulingContext, type SchedulingSelector } from './schedulingContext';
import { walkSchedulingQuestionnaire } from './schedulingQuestionnaire';
import type { QuestionAnswer, QuestionnaireAnswerToken } from './types';
import type { OpenSlot, SchedulingQuestionnaire, SlotSearchResult } from './types';

const SLOTS_PATH = '/Scheduling/Anonymous/GetSlots';

// Every date in the scheduling payloads — `Dte`, `SearchRangeStartDte`,
// `startDte` — is an Epic day number; `shared/epicDate.ts` converts them.

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

export type OpenSlotsOptions = SchedulingSelector & {
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
   * The `answerToken` from a completed `submitSchedulingAnswers`. Preferred
   * over `answers`: it skips the tree walk entirely, and it survives the
   * session it was made in, so a client can carry it across a restart.
   */
  answerToken?: QuestionnaireAnswerToken;
  /**
   * Raw answers, walked here instead. Convenient for a one-shot script; a
   * client with a person to ask should use `fetchSchedulingQuestionnaire` /
   * `submitSchedulingAnswers` and pass the resulting `token`.
   */
  answers?: QuestionAnswer[];
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
  const context = await resolveSchedulingContext(request, options);
  const { token, specialty, reason, visitTypeId, treeId } = context;

  // A gated org needs the questionnaire cleared first. A token from
  // `submitSchedulingAnswers` is used as-is; raw answers are walked here; with
  // neither, the search still runs and the result carries the questions so the
  // caller learns what is being asked rather than just `LqfAnswersRequired`.
  let lqfIds: string[] = options.answerToken?.lqfIds ?? [];
  let patientAnswerIds: string[] = options.answerToken?.patientAnswerIds ?? [];
  let questionnaire: SchedulingQuestionnaire | null = null;
  if (treeId && lqfIds.length === 0) {
    const walk = await walkSchedulingQuestionnaire(request, { token, treeId, visitTypeId, answers: options.answers ?? [] });
    if (walk.treeAnswerId) {
      lqfIds = [walk.treeId];
      patientAnswerIds = [walk.treeAnswerId];
    } else {
      // The search still runs from here. It will come back
      // `LqfAnswersRequired`, and that is the point: the instance's own code
      // is better evidence than an assumption, and it costs one request.
      questionnaire = {
        required: true,
        treeId: walk.treeId,
        visitTypeId,
        nextQuestion: walk.unanswered,
        questions: walk.questions,
        complete: walk.traversalComplete,
        answerToken: null,
        specialty,
        reasonForVisit: reason?.Title ?? null,
        window: context.window,
      };
    }
  }

  let pairs = context.pairs
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

  // Today comes off the wall clock, not UTC: at 9pm Pacific it is already
  // tomorrow in UTC, and starting the search there silently skips same-day slots.
  const startDte = options.startDate ? toEpicDte(options.startDate) : toEpicDteLocal(new Date());
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
