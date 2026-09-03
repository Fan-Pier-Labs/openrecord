import { conformToShape } from '@/lib/shape';
import * as shapes from '@/data/realShapes';
import { allergiesPage } from '@/lib/html';
import { html, json } from './respond';
import type { ExactRoutes } from './types';

export const allergiesGet: ExactRoutes = {
  'clinical/allergies': () => html(allergiesPage()),
};

export const allergiesPost: ExactRoutes = {
  'api/allergies/loadallergies': ({ ds }) => json(conformToShape(shapes.loadAllergies, ds.allergies)),
};
