import { conformToShape } from '@/lib/shape';
import * as shapes from '@/data/realShapes';
import { careTeamPage } from '@/lib/html';
import { aspNetFailure, html, json } from './respond';
import type { ExactRoutes } from './types';

export const careTeamGet: ExactRoutes = {
  'clinical/careteam': () => html(careTeamPage()),

  // The Care Team activity's two data endpoints are POST-only on real
  // instances: a GET answers 500 whatever query string it carries.
  'clinical/careteam/load': ({ request, path }) => aspNetFailure(request, 'fivehundred', path),
  'clinical/careteam/loadexternal': ({ request, path }) => aspNetFailure(request, 'fivehundred', path),
};

// A legacy MVC activity, so PascalCase and no /api prefix. Every parameter the
// page's JS sends is optional; a bare POST returns the full list.
export const careTeamPost: ExactRoutes = {
  'clinical/careteam/load': ({ ds }) => json(conformToShape(shapes.careTeamLoad, ds.careTeam)),
  'clinical/careteam/loadexternal': ({ ds }) => json(conformToShape(shapes.careTeamLoad, ds.careTeamExternal)),

  // The React provider-details page's data call, reached from a care team row's
  // "provider details" link with the row's own `ID`. On the one instance
  // captured, any id it cannot resolve — another record's token, the
  // `NationalProviderID` token, an empty string, bare digits — is a 500 with
  // the ASP.NET Web API `{"Message":"An error has occurred."}` body, never an
  // empty bio. A GET is 405 there; the shared guard handles the missing token.
  'api/providers/getproviderbioprivate': async ({ request, ds }) => {
    let id: unknown;
    try {
      id = (await request.json()).id;
    } catch { /* no body: treated like an unknown id */ }
    const bio = typeof id === 'string' ? ds.providerBios[id] : undefined;
    if (!bio) return json({ Message: 'An error has occurred.' }, 500);
    return json(conformToShape(shapes.getProviderBioPrivate, bio));
  },
};
