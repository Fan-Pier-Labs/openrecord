// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { conformToShape } from '@/lib/shape';
import * as shapes from '@/data/realShapes';
import { json } from './respond';
import type { ExactRoutes } from './types';

export const ehiExportPost: ExactRoutes = {
  'api/release-of-information/getehietemplates': ({ ds }) => json(conformToShape(shapes.getEhiETemplates, ds.ehiExport)),
};
