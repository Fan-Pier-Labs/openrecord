/**
 * Raw MyChart responses for the `upcomingOrders` scraper.
 *
 * Observed by the capture harness behind `fake-mychart/src/data/realShapes.ts`
 * on three real instances — what we have seen, never a contract Epic owes us.
 *
 * `unknown` means the field was `null` on every instance captured: we saw no
 * value, so we know no type. `unknown[]` means the array was always empty, so
 * we have never seen an element. Neither is `null` or `never[]`, which would
 * read as settled.
 *
 * Read a payload with `rec<T>()` from `../../processors/read.ts` — it checks the
 * field names and leaves every value to `text()` / `num()` / `list()`. Never
 * `as`: that checks the same names and then lies about the values.
 *
 * Endpoints: /api/upcoming-orders/getupcomingorders
 *
 * Keep in step with `realShapes.ts` when the captures are refreshed.
 */

/** `/api/upcoming-orders/getupcomingorders` */
export type GetUpcomingOrders = {
  orderGroupList?: Record<string, unknown>;
  orderList?: Record<string, unknown>;
  providerList?: Record<string, unknown>;
  upcomingOrdersSettings?: {
    canHideOrUnhideReminders?: boolean;
  };
};
