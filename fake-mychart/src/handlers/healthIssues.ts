import { conformToShape } from '@/lib/shape';
import * as shapes from '@/data/realShapes';
import { healthIssuesPage } from '@/lib/html';
import { html, json } from './respond';
import type { ExactRoutes } from './types';

export const healthIssuesGet: ExactRoutes = {
  'clinical/healthissues': () => html(healthIssuesPage()),
};

export const healthIssuesPost: ExactRoutes = {
  'api/healthissues/loadhealthissuesdata': ({ ds }) => json(conformToShape(shapes.loadHealthIssuesData, ds.healthIssues)),
};
