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
};
