/**
 * Activity feed processor. Field decisions: docs/processor-layer-proposal.md, `get_activity_feed`.
 *
 * `FetchItemFeed` groups items per patient record the account can see under
 * `singleItemFeedViewModels[]`, each with `feedItems` (newer releases split
 * some into `todayItems` / `forYouItems`; all three lists are kept under
 * their own names). `priorityInstant` is epoch milliseconds; the derived
 * `priorityInstantISO` is the readable form, `null` when the item has no
 * instant (MyChart sends `0`).
 *
 * The contact-info nag item's own fields (`phone`, `email`, …), every action's
 * portal link, and the icons are UI; `linkedAccountsViewModel` duplicates
 * `get_linked_accounts`.
 */

import { bodyOf, type RawResponse } from '../../core/rawResponse';
import type { Processor } from '../../processors/processor';
import { isoFromMs, list, num, rec, textOrNull } from '../../processors/read';

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

function feedItem(value: unknown): FeedItemStandard {
  const item = rec(value);
  const priorityInstant = num(item.priorityInstant);
  return {
    identifier: textOrNull(item.identifier),
    displayText: textOrNull(item.displayText),
    titleDisplayText: textOrNull(item.titleDisplayText),
    announcementBody: textOrNull(item.announcementBody),
    type: textOrNull(item.type),
    defaultType: textOrNull(item.defaultType),
    topicId: num(item.topicId),
    priority: num(item.priority),
    priorityInstant,
    priorityInstantISO: priorityInstant !== null && priorityInstant > 0 ? isoFromMs(priorityInstant) : null,
    groupCount: num(item.groupCount),
    primaryAction: { uriDisplayText: textOrNull(rec(item.primaryAction).uriDisplayText) },
  };
}

export const activityFeedProcessor: Processor<ActivityFeedStandard> = {
  standard(raw: RawResponse): ActivityFeedStandard {
    const body = rec(bodyOf(raw, 'FetchItemFeed'));
    return {
      singleItemFeedViewModels: list(body.singleItemFeedViewModels).map((value) => {
        const vm = rec(value);
        return {
          displayName: textOrNull(vm.displayName),
          eptId: textOrNull(vm.eptId),
          feedItems: list(vm.feedItems).map(feedItem),
          todayItems: list(vm.todayItems).map(feedItem),
          forYouItems: list(vm.forYouItems).map(feedItem),
        };
      }),
    };
  },
  concise(standard) {
    const item = (i: FeedItemStandard) => ({ displayText: i.displayText, priorityInstantISO: i.priorityInstantISO });
    return {
      singleItemFeedViewModels: standard.singleItemFeedViewModels.map((vm) => ({
        displayName: vm.displayName,
        feedItems: vm.feedItems.map(item),
        todayItems: vm.todayItems.map(item),
        forYouItems: vm.forYouItems.map(item),
      })),
    };
  },
};
