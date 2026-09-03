/**
 * Upcoming orders processor. Field decisions: docs/processor-layer-proposal.md, `get_upcoming_orders`.
 *
 * Real `GetUpcomingOrders` responses are keyed MAPS — `orderList` holds the
 * orders by id with `orderGroupList` / `providerList` alongside — never a bare
 * `orders` array. Every captured account had all three maps empty, so the
 * order element is uncaptured and passes through whole (rule 10); `orderList`
 * is emitted as the map's values.
 *
 * `providerName` is derived by joining the order to `providerList`. Neither
 * the order's provider-key field nor the provider element's name field has
 * been captured, so the join is by value: any string field on the order that
 * is a key of `providerList` selects the entry, and the entry's `name` (or
 * `displayName`) is the provider's name. `null` until a capture shows the
 * real join.
 */

import { bodyOf, type RawResponse } from '../../core/rawResponse';
import type { Processor } from '../../processors/processor';
import { rec, text } from '../../processors/read';

export type UpcomingOrderStandard = Record<string, unknown> & {
  /** Derived: who ordered it, resolved from `providerList`. */
  providerName: string | null;
};

export interface UpcomingOrdersStandard {
  orderList: UpcomingOrderStandard[];
  /** Uncaptured; passed through whole. */
  orderGroupList: Record<string, unknown>;
}

export function resolveProviderName(order: Record<string, unknown>, providerList: Record<string, unknown>): string | null {
  for (const value of Object.values(order)) {
    if (typeof value !== 'string' || !(value in providerList)) continue;
    const entry = providerList[value];
    if (typeof entry === 'string') return entry;
    const name = text(rec(entry).name) || text(rec(entry).displayName);
    if (name) return name;
  }
  return null;
}

export const upcomingOrdersProcessor: Processor<UpcomingOrdersStandard> = {
  standard(raw: RawResponse): UpcomingOrdersStandard {
    const body = rec(bodyOf(raw, 'GetUpcomingOrders'));
    const providerList = rec(body.providerList);
    return {
      orderList: Object.values(rec(body.orderList)).map((value) => {
        const order = rec(value);
        return { ...order, providerName: resolveProviderName(order, providerList) };
      }),
      orderGroupList: rec(body.orderGroupList),
    };
  },
  /** Narrows to name, type, status, date and provider once the element is captured. */
  concise(standard) {
    return { orderList: standard.orderList };
  },
};
