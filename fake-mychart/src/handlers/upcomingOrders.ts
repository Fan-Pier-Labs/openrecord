import { conformToShape } from '@/lib/shape';
import * as shapes from '@/data/realShapes';
import { json } from './respond';
import type { ExactRoutes } from './types';

export const upcomingOrdersPost: ExactRoutes = {
  // Real instances answer with keyed maps (orderList, orderGroupList,
  // providerList), never a bare array.
  'api/upcoming-orders/getupcomingorders': ({ ds }) => json(conformToShape(shapes.getUpcomingOrders, ds.upcomingOrders)),
};
