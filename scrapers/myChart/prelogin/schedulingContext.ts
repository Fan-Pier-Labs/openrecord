/**
 * Resolving "what am I searching for" on an anonymous scheduling instance.
 *
 * Every call in this corner of the API needs the same four things first: the
 * antiforgery token, the specialty, the reason for visit, and the visit type
 * the reason defaults to. The slot search needs them to build a payload; the
 * questionnaire needs them to find the decision tree hanging off the visit
 * type. Resolving it twice, slightly differently, is how the two drift apart.
 *
 * It also carries the org's bookable window. `WorkflowSettings` publishes how
 * far out an instance will look — as day offsets, with a separate pair for the
 * new-provider workflow — which is what a client needs to ask someone "when
 * would you like to be seen?" without offering dates the instance will refuse.
 */

import type { MyChartRequest } from '../core/myChartRequest';
import { fetchSchedulingWorkflow, fetchSpecialtyData, parseSpecialties } from './providerDirectory';
import type { SchedulingWindow, Specialty } from './types';

export type SchedulingSelector = {
  /** Specialty name or id. Defaults to the first the instance lists. */
  specialty?: string;
  /** Reason-for-visit title or id. Defaults to the first directly schedulable one. */
  reasonForVisit?: string;
};

export type RawPair = { ProviderId: string; DepartmentId: string; IsTeamMember?: boolean };

export type RawReason = {
  Id: string;
  Title?: string | null;
  CategoryValue?: string | null;
  CanDirectSchedule?: boolean;
  DefaultVisitTypeId?: string | null;
  /**
   * The provider/department pairs bookable under this reason, as
   * `"<ProviderId>^<DepartmentId>"` composites — not indices into
   * `ProviderDepartmentPairs`. Sending a pair outside this set is refused by
   * some instances, so the slot search filters on it.
   */
  DirectProviderDepartmentPairIDs?: string[] | null;
};

export type RawVisitType = { ID: string; AnonymousSchedulingDecisionTreeId?: string | null };

type RawSpecialtyPayload = {
  ProviderDepartmentPairs?: RawPair[] | null;
  ReasonsForVisit?: RawReason[] | null;
  VisitTypes?: RawVisitType[] | null;
};

type RawWorkflowSettings = {
  FromDaysOffset?: number | null;
  ToDaysOffset?: number | null;
  NewProvFromDaysOffset?: number | null;
  NewProvToDaysOffset?: number | null;
};

export type SchedulingContext = {
  token: string | null;
  specialty: Specialty;
  /** Every specialty the instance lists, for a caller offering a choice. */
  specialties: Specialty[];
  reason: RawReason | null;
  reasons: RawReason[];
  visitTypeId: string | null;
  visitType: RawVisitType | null;
  /** The decision tree gating this visit type, when the org attaches one. */
  treeId: string | null;
  pairs: RawPair[];
  window: SchedulingWindow;
};

/**
 * How far out this instance will look, in whole days from today.
 *
 * The new-provider offsets win when the org sets them — that is the workflow
 * the anonymous "Find a Doctor" page runs — and the general pair is the
 * fallback. Both are absent on some instances; 0 and 365 are then the sane
 * reading, and `explicit` says which case a caller is looking at.
 */
export function parseSchedulingWindow(settings: RawWorkflowSettings | null | undefined): SchedulingWindow {
  const s = settings ?? {};
  const from = s.NewProvFromDaysOffset ?? s.FromDaysOffset;
  const to = s.NewProvToDaysOffset ?? s.ToDaysOffset;
  return {
    earliestDaysOut: typeof from === 'number' ? from : 0,
    latestDaysOut: typeof to === 'number' ? to : 365,
    explicit: typeof from === 'number' && typeof to === 'number',
  };
}

/** Turn the window into concrete dates, for a client rendering a date picker. */
export function windowDates(window: SchedulingWindow, today: Date = new Date()): { earliest: Date; latest: Date } {
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const shift = (days: number) => new Date(midnight.getTime() + days * 86_400_000);
  return { earliest: shift(window.earliestDaysOut), latest: shift(window.latestDaysOut) };
}

/**
 * Resolve the workflow and specialty calls into everything downstream needs.
 *
 * An unknown `specialty` or `reasonForVisit` throws with the list the instance
 * publishes, rather than quietly searching something else — a substituted
 * reason means a different visit type and different slots, with nothing in the
 * result saying so.
 */
export async function resolveSchedulingContext(
  request: MyChartRequest,
  selector: SchedulingSelector = {},
): Promise<SchedulingContext> {
  const { token, data: workflowData } = await fetchSchedulingWorkflow(request);
  const specialties = parseSpecialties(workflowData);

  const wanted = selector.specialty?.trim().toLowerCase();
  const specialty = wanted
    ? specialties.find((s) => s.name.toLowerCase() === wanted || s.id.toLowerCase() === wanted)
    : specialties[0];
  if (!specialty) {
    throw new Error(
      wanted
        ? `no specialty named ${JSON.stringify(selector.specialty)} on ${request.hostname} — it lists ` +
          (specialties.map((s) => s.name).join(', ') || 'none')
        : `${request.hostname} lists no open-scheduling specialties`,
    );
  }

  const specialtyData = await fetchSpecialtyData<RawSpecialtyPayload>(request, token, specialty.id);
  const reasons = (specialtyData.ReasonsForVisit ?? []).filter((r): r is RawReason => typeof r?.Id === 'string');

  const wantedRfv = selector.reasonForVisit?.trim().toLowerCase();
  let reason: RawReason | null;
  if (wantedRfv) {
    reason = reasons.find((r) => r.Title?.toLowerCase() === wantedRfv || r.Id.toLowerCase() === wantedRfv) ?? null;
    if (!reason) {
      throw new Error(
        `no reason for visit named ${JSON.stringify(selector.reasonForVisit)} in ${specialty.name} on ` +
          `${request.hostname} — it lists ${reasons.map((r) => r.Title).filter(Boolean).join(', ') || 'none'}`,
      );
    }
  } else {
    // Falling back to a request-only reason is expected to return no slots: it
    // is the reason the org publishes when nothing is directly bookable.
    reason = reasons.find((r) => r.CanDirectSchedule) ?? reasons[0] ?? null;
  }

  const visitTypeId = reason?.DefaultVisitTypeId ?? specialtyData.VisitTypes?.[0]?.ID ?? null;
  const visitType = specialtyData.VisitTypes?.find((v) => v.ID === visitTypeId) ?? null;

  return {
    token,
    specialty,
    specialties,
    reason,
    reasons,
    visitTypeId,
    visitType,
    treeId: visitType?.AnonymousSchedulingDecisionTreeId?.trim() || null,
    pairs: (specialtyData.ProviderDepartmentPairs ?? []).filter(
      (p): p is RawPair => typeof p?.ProviderId === 'string' && typeof p?.DepartmentId === 'string',
    ),
    window: parseSchedulingWindow((workflowData as { WorkflowSettings?: RawWorkflowSettings | null }).WorkflowSettings),
  };
}
