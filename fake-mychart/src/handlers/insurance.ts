import { insurancePage } from '@/lib/html';
import { html } from './respond';
import type { ExactRoutes } from './types';

export const insuranceGet: ExactRoutes = {
  'insurance': ({ ds }) => html(insurancePage(ds.insurance)),
};
