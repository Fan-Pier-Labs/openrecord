import { conformToShape } from '@/lib/shape';
import * as shapes from '@/data/realShapes';
import { referralsPage } from '@/lib/html';
import { html, json } from './respond';
import type { ExactRoutes } from './types';

export const referralsGet: ExactRoutes = {
  'referrals': () => html(referralsPage()),
};

export const referralsPost: ExactRoutes = {
  'api/referrals/listreferrals': ({ ds }) => json(conformToShape(shapes.listReferrals, ds.referrals)),
};
