/**
 * What the `activityFeed` capabilities return: the standard objects the processors
 * build from MyChart's responses. MyChart's own shapes are in
 * `./mychart.types.ts`.
 */

export interface FeedItemStandard {
  identifier: string | null;
  displayText: string | null;
  titleDisplayText: string | null;
  announcementBody: string | null;
  type: string | null;
  defaultType: string | null;
  topicId: number | null;
  priority: number | null;
  priorityInstant: number | null;
  /** Derived: `priorityInstant` as ISO-8601; `null` when there is no instant. */
  priorityInstantISO: string | null;
  groupCount: number | null;
  primaryAction: { uriDisplayText: string | null };
}

export interface FeedViewModelStandard {
  displayName: string | null;
  eptId: string | null;
  feedItems: FeedItemStandard[];
  todayItems: FeedItemStandard[];
  forYouItems: FeedItemStandard[];
}

export interface ActivityFeedStandard {
  singleItemFeedViewModels: FeedViewModelStandard[];
}
