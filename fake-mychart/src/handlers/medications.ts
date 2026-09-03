import { conformToShape } from '@/lib/shape';
import * as shapes from '@/data/realShapes';
import { medicationsPage } from '@/lib/html';
import { html, json } from './respond';
import type { ExactRoutes } from './types';

export const medicationsGet: ExactRoutes = {
  'clinical/medications': () => html(medicationsPage()),
};

export const medicationsPost: ExactRoutes = {
  'api/medications/loadmedicationspage': ({ ds }) => json(conformToShape(shapes.loadMedicationsPage, ds.medications)),
  'api/medications/requestrefill': () => json({ success: true }),
};
