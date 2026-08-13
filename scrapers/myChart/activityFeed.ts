import { makeAuthenticatedRequest } from './makeAuthenticatedRequest';
import { type MyChartRequest } from "./myChartRequest";
import { getRequestVerificationTokenFromBody } from "./util";
import { logger } from '../../shared/logger';

export type ActivityFeedItem = {
  id: string;
  title: string;
  description: string;
  date: string;
  type: string;
  link: string;
}

// Real FetchItemFeed responses group items per patient tab under
// `singleItemFeedViewModels`, each with `feedItems` (newer instances split
// some into `todayItems`/`forYouItems`). The item's text is `displayText` and
// its timestamp is the epoch-milliseconds `priorityInstant`. (An earlier
// version read a flat `items` key that only the fake served, so this scraper
// returned nothing against every real instance.)
type FeedItemResponse = {
  identifier?: string;
  displayText?: string;
  titleDisplayText?: string;
  announcementBody?: string;
  type?: string;
  priorityInstant?: number;
  primaryAction?: { uri?: string };
}

type FeedViewModelResponse = {
  displayName?: string;
  feedItems?: FeedItemResponse[];
  todayItems?: FeedItemResponse[];
  forYouItems?: FeedItemResponse[];
}

type FetchItemFeedResponse = {
  singleItemFeedViewModels?: FeedViewModelResponse[];
}

export async function getActivityFeed(mychartRequest: MyChartRequest): Promise<ActivityFeedItem[]> {
  const pageResp = await makeAuthenticatedRequest(mychartRequest, { path: '/app/home' });
  const html = await pageResp.text();
  const token = getRequestVerificationTokenFromBody(html);

  if (!token) {
    logger.debug('Could not find request verification token for activity feed');
    return [];
  }

  const resp = await makeAuthenticatedRequest(mychartRequest, {
    path: '/api/item-feed/FetchItemFeed',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      '__RequestVerificationToken': token,
    },
    body: JSON.stringify({ maxItems: 50, offset: 0 }),
  });

  const json: FetchItemFeedResponse = await resp.json();

  const items = (json.singleItemFeedViewModels ?? []).flatMap((vm) => [
    ...(vm.feedItems ?? []),
    ...(vm.todayItems ?? []),
    ...(vm.forYouItems ?? []),
  ]);

  return items.map((item: FeedItemResponse) => ({
    id: item.identifier || '',
    title: item.titleDisplayText || item.displayText || '',
    description: item.announcementBody || '',
    date: item.priorityInstant ? new Date(item.priorityInstant).toISOString() : '',
    type: item.type || '',
    link: item.primaryAction?.uri || '',
  }));
}
