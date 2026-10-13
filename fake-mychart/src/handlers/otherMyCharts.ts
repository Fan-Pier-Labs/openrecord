// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { conformToShape } from '@/lib/shape';
import * as shapes from '@/data/realShapes';
import { json } from './respond';
import { prefix, type PatternRoute } from './types';

/** Linked accounts at other health systems ("Link My Accounts"). */
export const otherMyChartsPostPatterns: readonly PatternRoute[] = [
  prefix('community/shared/loadcommunitylinks', ({ ds }) =>
    json(conformToShape(shapes.loadCommunityLinks, ds.linkedAccounts))),
];
