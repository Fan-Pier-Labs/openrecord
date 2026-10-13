// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { conformToShape } from '@/lib/shape';
import * as shapes from '@/data/realShapes';
import { json } from './respond';
import type { ExactRoutes } from './types';

export const healthSummaryPost: ExactRoutes = {
  'api/health-summary/fetchhealthsummary': ({ ds }) => json(conformToShape(shapes.fetchHealthSummary, ds.healthSummary)),
  'api/health-summary/fetchh2gheader': ({ ds }) => json(conformToShape(shapes.fetchH2GHeader, ds.healthSummaryHeader)),
};
