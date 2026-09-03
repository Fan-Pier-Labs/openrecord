import { careJourneysPage } from '@/lib/html';
import { html, json } from './respond';
import type { ExactRoutes } from './types';

export const careJourneysGet: ExactRoutes = {
  'carejourneys': () => html(careJourneysPage()),
};

export const careJourneysPost: ExactRoutes = {
  'api/care-journeys/getcarejourneys': ({ ds }) => json(ds.careJourneys),
};
