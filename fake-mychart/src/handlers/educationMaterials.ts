import { conformToShape } from '@/lib/shape';
import * as shapes from '@/data/realShapes';
import { educationPage } from '@/lib/html';
import { html, json } from './respond';
import type { ExactRoutes } from './types';

export const educationMaterialsGet: ExactRoutes = {
  'education': () => html(educationPage()),
};

export const educationMaterialsPost: ExactRoutes = {
  // Real instances return a bare ARRAY of titles, not an object.
  'api/education/getpateducationtitles': ({ ds }) => json(conformToShape(shapes.getPatEducationTitles, ds.educationMaterials)),
};
