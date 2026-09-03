import { conformToShape } from '@/lib/shape';
import * as shapes from '@/data/realShapes';
import { json } from './respond';
import type { ExactRoutes } from './types';

export const activityFeedPost: ExactRoutes = {
  'api/item-feed/fetchitemfeed': ({ ds }) => json(conformToShape(shapes.fetchItemFeed, ds.activityFeed)),
};
