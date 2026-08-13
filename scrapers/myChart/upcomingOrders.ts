import { makeAuthenticatedRequest } from './makeAuthenticatedRequest';
import { MyChartRequest } from "./myChartRequest";
import { getRequestVerificationTokenFromBody } from "./util";
import { logger } from '../../shared/logger';

export type UpcomingOrder = {
  orderName: string;
  orderType: string;
  status: string;
  orderedDate: string;
  orderedByProvider: string;
  facilityName: string;
}

type OrderResponse = {
  orderName?: string;
  orderType?: string;
  status?: string;
  orderedDate?: string;
  orderedByProvider?: string;
  facilityName?: string;
}

// Real GetUpcomingOrders responses are keyed MAPS — `orderList` holds the
// orders by id, with `orderGroupList`/`providerList` alongside — never a bare
// `orders` array. (An earlier version read `orders`, which only the fake
// served, so this scraper returned nothing against every real instance. The
// order VALUE shape is modelled from the fake — every captured real account
// had the maps empty.)
type GetUpcomingOrdersResponse = {
  orderList?: Record<string, OrderResponse>;
}

export async function getUpcomingOrders(mychartRequest: MyChartRequest): Promise<UpcomingOrder[]> {
  const pageResp = await makeAuthenticatedRequest(mychartRequest, { path: '/app/upcoming-orders' });
  const html = await pageResp.text();
  const token = getRequestVerificationTokenFromBody(html);

  if (!token) {
    logger.debug('Could not find request verification token for upcoming orders');
    return [];
  }

  const resp = await makeAuthenticatedRequest(mychartRequest, {
    path: '/api/upcoming-orders/GetUpcomingOrders',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      '__RequestVerificationToken': token,
    },
    body: JSON.stringify({}),
  });

  const json: GetUpcomingOrdersResponse = await resp.json();

  return Object.values(json.orderList || {}).map((o: OrderResponse) => ({
    orderName: o.orderName || '',
    orderType: o.orderType || '',
    status: o.status || '',
    orderedDate: o.orderedDate || '',
    orderedByProvider: o.orderedByProvider || '',
    facilityName: o.facilityName || '',
  }));
}
