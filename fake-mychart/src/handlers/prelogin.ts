/**
 * The pre-login activities, standing in for `scrapers/myChart/prelogin`.
 *
 * "Find a Doctor" (open scheduling) and the guest price-estimate tool are open
 * to anyone on a real instance — no account, no session — and are served as the
 * login shell with the activity's data inlined in a script block.
 *
 * These are the only POSTs outside `authentication/` that answer without a
 * session, which is why {@link preloginPostPublic} is a group of its own rather
 * than an entry in `POST_ROUTES`. They are still antiforgery-gated: real
 * instances reject a token-less call here with the same ASP.NET error surface
 * they give a token-less `/api/*` POST (see `requiresAntiforgeryToken`).
 */

import { openSchedulingPage, guestEstimatesServiceAreaPage, guestEstimatesLocationPage } from '@/lib/html/prelogin';
import * as prelogin from '@/data/prelogin';
import { specialtySearchTermsFor } from '@/data/prelogin';
import { isLegacyEpicVersion } from '@/lib/epicVersion';
import { conformToShape } from '@/lib/shape';
import * as shapes from '@/data/realShapes';
import { aspNetFailure, html, json, redirectTo } from './respond';
import type { ExactRoutes } from './types';

/**
 * The newer scheduling build (three of the five captured instances) attaches
 * `SpecialtySearchTerms` to every provider and `UseLegacyQuestionnaires` to the
 * workflow settings; the older build sends neither. Like the test-result trio
 * in `withModernResultFields`, they ride on the epicVersion knob rather than
 * living in the shape templates, so both shapes get exercised.
 */
export function withNewerSchedulingFields(payload: unknown): unknown {
  if (isLegacyEpicVersion()) return payload;
  const p = payload as Record<string, unknown>;
  if (p?.WorkflowSettings && typeof p.WorkflowSettings === 'object') {
    p.WorkflowSettings = { ...(p.WorkflowSettings as Record<string, unknown>), UseLegacyQuestionnaires: false };
  }
  if (Array.isArray(p?.Providers)) {
    p.Providers = p.Providers.map((provider: { Specialties: { Title: string }[] }) => ({
      ...provider,
      SpecialtySearchTerms: specialtySearchTermsFor(provider),
    }));
  }
  return p;
}

// ─── GET ────────────────────────────────────────────────────────────
// Public: an anonymous visitor reaches all of these before signing in.

export const preloginGetPublic: ExactRoutes = {
  'openscheduling': () => html(openSchedulingPage()),

  // Real instances 302 the bare entry point to the first step of the flow.
  'guestestimates': ({ request }) => redirectTo(request, '/GuestEstimates/SelectServiceArea'),

  'guestestimates/selectservicearea': () => html(guestEstimatesServiceAreaPage()),

  'guestestimates/selectlocation': ({ request }) => {
    const url = new URL(request.url);
    const svcArea = url.searchParams.get('svcArea') ?? '';
    const area = prelogin.SERVICE_AREAS.find(a => a.Id === svcArea);
    // A billing entity that doesn't group by location skips this step on real
    // instances: the flow bounces straight on to the disclaimer.
    if (!area || !area.SelectLocations) {
      return redirectTo(request, `/GuestEstimates/AcceptDisclaimer?svcArea=${encodeURIComponent(svcArea)}`);
    }
    return html(guestEstimatesLocationPage(area.Id, url.searchParams.get('isMultiSA')?.toLowerCase() === 'true'));
  },
};

// ─── POST ───────────────────────────────────────────────────────────
// The "Find a Doctor" workflow's own data calls. Form-encoded, the way the
// page's `$$WPUtil.postify` sends them; a payload the controller doesn't
// recognize gets the release's error surface, never a JSON error.

/**
 * Read a nested field from a postify-encoded body, in either convention.
 *
 * `$$WPUtil.postify` writes nested properties with dots (`outer.inner`), and
 * that is what the real page sends. These two endpoints' model binder also
 * accepts jQuery's `outer[inner]` — verified against live instances, where a
 * bracket-encoded body is answered 200 by both of them.
 *
 * `GetSlots` is the strict one: it binds dots only and answers 500 (November
 * 2025) or 302 (August 2025) to brackets. So the leniency here is real
 * behavior worth mirroring, not a convenience — an instance really will let a
 * caller get this far on the wrong encoding and only fail at the slot search.
 */
function postifyField(form: URLSearchParams, ...path: string[]): string | null {
  return form.get(path.join('.')) ?? form.get(`${path[0]}${path.slice(1).map(p => `[${p}]`).join('')}`);
}

export const preloginPostPublic: ExactRoutes = {
  'scheduling/anonymous/getschedulingworkflowdata': async ({ request, path }) => {
    const form = new URLSearchParams(await request.text());
    if (postifyField(form, 'schedulingParameters', 'workflow') !== 'NewProvider') {
      return aspNetFailure(request, 'fivehundred', path);
    }
    return json(withNewerSchedulingFields(conformToShape(shapes.anonymousSchedulingWorkflowData, prelogin.WORKFLOW_DATA)));
  },

  'scheduling/anonymous/getspecialtydata': async ({ request, path }) => {
    const form = new URLSearchParams(await request.text());
    const specialtyId = form.get('SpecialtyId');
    if (!specialtyId) {
      return aspNetFailure(request, 'fivehundred', path);
    }
    return json(withNewerSchedulingFields(conformToShape(shapes.anonymousSpecialtyData, prelogin.specialtyData(specialtyId))));
  },

  /**
   * The slot search, with the three ways a real instance refuses one.
   *
   * Each was found by probing live instances, and none of them is catchable by
   * a mocked transport — so they live here as behaviour:
   *
   *   1. Bracket-encoded nesting. `$$WPUtil.postify` writes `outer.inner`;
   *      jQuery's `outer[inner]` is refused. The two lenient endpoints above
   *      bind either form, which is exactly why this one has to be strict.
   *   2. A provider/department pair the reason for visit does not cover.
   *   3. A visit type gated behind a decision tree, until the traversal's
   *      answer id arrives as `PatientAnswerIds`.
   *
   * Availability itself is paged with a `ContinueInfo` cursor, one pair per
   * call, so a caller that ignores the cursor sees only the first pair.
   */
  'scheduling/anonymous/getslots': async ({ request, path }) => {
    const form = new URLSearchParams(await request.text());

    // (1) Dots only. A bracket-encoded body has none of the keys below.
    const visitTypeId = form.get('appointmentBuilder.Appointments[0].VisitTypeId');
    if (!visitTypeId) {
      return aspNetFailure(request, 'fivehundred', path);
    }

    const specialtyId = form.get('appointmentBuilder.SpecialtyId') ?? prelogin.SPECIALTIES[0]!.Id;
    const data = prelogin.specialtyData(specialtyId);
    const reason = data.ReasonsForVisit[0];

    const sent: { ProviderId: string; DepartmentId: string }[] = [];
    for (let i = 0; ; i++) {
      const providerId = form.get(`appointmentBuilder.Appointments[0].ProviderDepartmentPairs[${i}].ProviderId`);
      const departmentId = form.get(`appointmentBuilder.Appointments[0].ProviderDepartmentPairs[${i}].DepartmentId`);
      if (!providerId || !departmentId) break;
      sent.push({ ProviderId: providerId, DepartmentId: departmentId });
    }
    if (sent.length === 0) {
      return aspNetFailure(request, 'fivehundred', path);
    }

    // (2) Every pair must be one the reason covers.
    const covered = new Set(reason?.DirectProviderDepartmentPairIDs ?? []);
    if (covered.size > 0 && sent.some((p) => !covered.has(`${p.ProviderId}^${p.DepartmentId}`))) {
      return aspNetFailure(request, 'fivehundred', path);
    }

    // (3) A gated visit type needs the traversal's answer id.
    const gated = data.VisitTypes.some((v) => v.ID === visitTypeId && v.AnonymousSchedulingDecisionTreeId);
    const answerId = form.get('appointmentBuilder.Appointments[0].PatientAnswerIds[0]');
    if (gated && answerId !== prelogin.SCHEDULING_TREE_ANSWER_ID) {
      return json({ Solutions: [], ContinueInfo: null, ErrorCode: 'LqfAnswersRequired' });
    }

    const startDte = Number(form.get('startDte') ?? '0') || 0;
    const cursor = Number(form.get('continueInfo.NextProviderIndex') ?? '0') || 0;
    const pair = sent[cursor];
    const isLast = cursor >= sent.length - 1;
    return json({
      Solutions: pair ? [{ Slots: prelogin.slotsForPair(pair, visitTypeId, startDte), HasPassedFilterCheck: true }] : [],
      ContinueInfo: {
        State: isLast ? 2 : 1,
        SearchRangeStartDte: startDte,
        SearchRangeEndDte: startDte + 5,
        NextProviderIndex: String(cursor + 1),
        IsStopSearch: isLast,
      },
      ErrorCode: null,
    });
  },
};

/**
 * The decision tree behind a gated visit type.
 *
 * Walked one question at a time. Two behaviours here are what the live
 * captures showed and what a scraper gets wrong without them:
 *
 *   - `traversalInfo.AdditionalContext` is mandatory. Without the block the
 *     endpoint answers the release's error surface, not the first question.
 *   - The response echoes `RestartTree: true` back. A client that returns it
 *     unchanged restarts the traversal and re-serves question one forever, so
 *     this handler honours the flag rather than ignoring it.
 */
export const decisionTreePostPublic: ExactRoutes = {
  'decisiontrees/anonymousdecisiontree/nextstep': async ({ request, path }) => {
    const form = new URLSearchParams(await request.text());
    const treeId = form.get('traversalInfo.TreeID');
    if (treeId !== prelogin.SCHEDULING_TREE_ID) {
      return aspNetFailure(request, 'fivehundred', path);
    }
    // AdditionalContext is not optional on a real instance, and it is echoed
    // back on every step — so a caller that drops it mid-walk fails here too.
    const visitTypeId = form.get('traversalInfo.AdditionalContext.VisitTypeID');
    if (visitTypeId === null) {
      return aspNetFailure(request, 'fivehundred', path);
    }

    const questions = prelogin.SCHEDULING_QUESTIONS;
    const answeredId = form.get('question.ID');
    const answeredChoice = form.get('question.Answer.Choices[0].Index');
    const restart = form.get('traversalInfo.RestartTree') === 'true';

    // A restart drops whatever was answered and serves question one again.
    const answeredIndex = restart || !answeredId ? -1 : questions.findIndex((q) => q.ID === answeredId);
    const nextIndex = answeredIndex + 1;

    // Answering "yes" to the emergency question ends the walk with no answer
    // id: a real instance routes an emergency out of online scheduling.
    if (answeredIndex === 0 && answeredChoice === prelogin.EMERGENCY_CHOICE_INDEX) {
      return json({
        NextInputNode: null,
        TraversalInfo: traversalInfo(treeId, visitTypeId, { IsTraversalComplete: true, TreeAnswerID: null }),
      });
    }

    if (nextIndex >= questions.length) {
      return json({
        NextInputNode: null,
        TraversalInfo: traversalInfo(treeId, visitTypeId, {
          IsTraversalComplete: true,
          TreeAnswerID: prelogin.SCHEDULING_TREE_ANSWER_ID,
        }),
      });
    }

    const question = questions[nextIndex]!;
    return json({
      NextInputNode: {
        CSN: `${question.ID}-csn`,
        ID: `${question.ID}-node`,
        Type: 1,
        IsFirst: nextIndex === 0,
        Question: question,
        Questionnaire: null,
        DecisionTree: null,
        DeclutterNavigationButtons: false,
      },
      TraversalInfo: traversalInfo(treeId, visitTypeId, { IsTraversalComplete: false, TreeAnswerID: null }),
    });
  },
};

/** The cursor, echoing `RestartTree: true` back the way a real instance does. */
function traversalInfo(treeId: string, visitTypeId: string, over: Record<string, unknown>) {
  return {
    TreeID: treeId,
    SourceWorkflow: 5,
    RestartTree: true,
    TreeWasDirty: false,
    TreeWasLocked: false,
    UseInProgress: '',
    AdditionalContext: {
      VisitTypeID: visitTypeId,
      SchedulingWorkflowType: 2,
      IsGuest: false,
      IsAuthenticatedWidget: false,
    },
    ...over,
  };
}
