// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { conformToShape } from '@/lib/shape';
import * as shapes from '@/data/realShapes';
import { goalsPage } from '@/lib/html';
import { html, json } from './respond';
import type { ExactRoutes } from './types';

export const goalsGet: ExactRoutes = {
  'goals': () => html(goalsPage()),
};

export const goalsPost: ExactRoutes = {
  'api/goals/loadcareteamgoals': ({ ds }) => json(conformToShape(shapes.loadCareTeamGoals, ds.careTeamGoals)),
  'api/goals/loadpatientgoals': ({ ds }) => json(conformToShape(shapes.loadPatientGoals, ds.patientGoals)),
};
