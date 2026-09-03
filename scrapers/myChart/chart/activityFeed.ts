import type { MyChartRequest } from '../core/myChartRequest';
import { RawCollector, type RawResponse } from '../core/rawResponse';
import { activityFeedProcessor, type ActivityFeedStandard } from './activityFeed.processor';

export type { ActivityFeedStandard, FeedViewModelStandard, FeedItemStandard } from './activityFeed.processor';
export { activityFeedProcessor } from './activityFeed.processor';

/** `GET /app/home` for the token, then `POST /api/item-feed/FetchItemFeed` `{ maxItems: 50, offset: 0 }`. */
export async function fetchActivityFeedRaw(mychartRequest: MyChartRequest): Promise<RawResponse> {
  const collector = new RawCollector(mychartRequest);
  const token = await collector.pageToken('/app/home');
  await collector.postJson('/api/item-feed/FetchItemFeed', token, { maxItems: 50, offset: 0 });
  return collector.toRaw();
}

/** The standard object — what `mode: 'json'` returns. */
export async function getActivityFeed(mychartRequest: MyChartRequest): Promise<ActivityFeedStandard> {
  return activityFeedProcessor.standard(await fetchActivityFeedRaw(mychartRequest));
}
