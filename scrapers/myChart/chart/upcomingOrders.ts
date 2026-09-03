import type { MyChartRequest } from '../core/myChartRequest';
import { RawCollector, type RawResponse } from '../core/rawResponse';
import { upcomingOrdersProcessor, type UpcomingOrdersStandard } from './upcomingOrders.processor';

export type { UpcomingOrdersStandard, UpcomingOrderStandard } from './upcomingOrders.processor';
export { upcomingOrdersProcessor } from './upcomingOrders.processor';

/** `GET /app/upcoming-orders` for the token, then `POST /api/upcoming-orders/GetUpcomingOrders`. */
export async function fetchUpcomingOrdersRaw(mychartRequest: MyChartRequest): Promise<RawResponse> {
  const collector = new RawCollector(mychartRequest);
  const token = await collector.pageToken('/app/upcoming-orders');
  await collector.postJson('/api/upcoming-orders/GetUpcomingOrders', token, {});
  return collector.toRaw();
}

/** The standard object — what `mode: 'json'` returns. */
export async function getUpcomingOrders(mychartRequest: MyChartRequest): Promise<UpcomingOrdersStandard> {
  return upcomingOrdersProcessor.standard(await fetchUpcomingOrdersRaw(mychartRequest));
}
