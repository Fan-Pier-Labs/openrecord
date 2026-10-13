// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { conformToShape } from '@/lib/shape';
import * as shapes from '@/data/realShapes';
import { immunizationsPage } from '@/lib/html';
import { html, json } from './respond';
import type { ExactRoutes } from './types';

export const immunizationsGet: ExactRoutes = {
  'clinical/immunizations': () => html(immunizationsPage()),
};

export const immunizationsPost: ExactRoutes = {
  'api/immunizations/loadimmunizations': ({ ds }) => json(conformToShape(shapes.loadImmunizations, ds.immunizations)),
};
