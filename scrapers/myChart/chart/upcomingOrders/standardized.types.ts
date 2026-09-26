/**
 * What the `upcomingOrders` capabilities return: the standard objects the processors
 * build from MyChart's responses. MyChart's own shapes are in
 * `./mychart.types.ts`.
 */

export type UpcomingOrderStandard = Record<string, unknown> & {
  /** Derived: who ordered it, resolved from `providerList`. */
  providerName: string | null;
};

export interface UpcomingOrdersStandard {
  orderList: UpcomingOrderStandard[];
  /** Uncaptured; passed through whole. */
  orderGroupList: Record<string, unknown>;
}
