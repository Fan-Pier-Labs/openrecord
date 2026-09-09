/**
 * Health Advisories — the legacy `HealthAdvisories` activity.
 *
 * The page is a client-rendered shell (see `preventiveCarePage`); every
 * advisory comes from `HealthAdvisories/GetTopics`, which is where the
 * dataset's topics are served. A GET of the endpoint throws inside the action,
 * so it gets the *error* surface, not the not-found one — captured live as the
 * bare 500 an August-2025-shaped instance answers with (the same instance
 * answers a token-less POST the same way, which is what the shared antiforgery
 * gate already models). No November-2025 instance has been captured refusing
 * this endpoint, so which of the two redirects it would serve is untested.
 */

import { conformToShape } from '@/lib/shape';
import * as shapes from '@/data/realShapes';
import { preventiveCarePage } from '@/lib/html';
import { aspNetFailure, html, json } from './respond';
import type { ExactRoutes } from './types';

export const preventiveCareGet: ExactRoutes = {
  'healthadvisories': () => html(preventiveCarePage()),
  'healthadvisories/gettopics': ({ request, path }) => aspNetFailure(request, 'fivehundred', path),
};

export const preventiveCarePost: ExactRoutes = {
  // `registryID` is whatever the controller was constructed with — the empty
  // string on the standalone activity. The captured instance ignores it
  // entirely (absent, lowercased and bogus values all returned the same
  // topics), so nothing here reads it.
  'healthadvisories/gettopics': ({ ds }) =>
    json(conformToShape(shapes.healthAdvisoriesGetTopics, ds.preventiveCare)),
};
