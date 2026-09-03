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
};
