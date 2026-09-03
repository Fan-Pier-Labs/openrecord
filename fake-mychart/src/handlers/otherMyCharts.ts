import { conformToShape } from '@/lib/shape';
import * as shapes from '@/data/realShapes';
import { json } from './respond';
import { prefix, type PatternRoute } from './types';

/** Linked accounts at other health systems ("Link My Accounts"). */
export const otherMyChartsPostPatterns: readonly PatternRoute[] = [
  prefix('community/shared/loadcommunitylinks', ({ ds }) =>
    json(conformToShape(shapes.loadCommunityLinks, ds.linkedAccounts))),
];
