import { conformToShape } from '@/lib/shape';
import * as shapes from '@/data/realShapes';
import { medicalHistoryPage } from '@/lib/html';
import { html, json } from './respond';
import type { ExactRoutes } from './types';

export const medicalHistoryGet: ExactRoutes = {
  'medicalhistory': () => html(medicalHistoryPage()),
};

export const medicalHistoryPost: ExactRoutes = {
  'api/histories/loadhistoriesviewmodel': ({ ds }) => json(conformToShape(shapes.loadHistoriesViewModel, ds.medicalHistory)),
};
