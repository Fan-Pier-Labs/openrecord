import { conformToShape } from '@/lib/shape';
import * as shapes from '@/data/realShapes';
import { json } from './respond';
import type { ExactRoutes } from './types';

export const ehiExportPost: ExactRoutes = {
  'api/release-of-information/getehietemplates': ({ ds }) => json(conformToShape(shapes.getEhiETemplates, ds.ehiExport)),
};
