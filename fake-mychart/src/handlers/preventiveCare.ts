import { preventiveCarePage } from '@/lib/html';
import { html } from './respond';
import type { ExactRoutes } from './types';

export const preventiveCareGet: ExactRoutes = {
  'healthadvisories': ({ ds }) => html(preventiveCarePage(ds.preventiveCare)),
};
