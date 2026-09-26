/**
 * Raw MyChart responses for the `referrals` scraper.
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
 * Endpoints: /api/referrals/listreferrals
 *
 * Keep in step with `realShapes.ts` when the captures are refreshed.
 */

/** `/api/referrals/listreferrals` */
export type ListReferrals = {
  referralList?: Array<{
    internalId?: string;
    externalId?: string;
    status?: string;
    statusString?: string;
    creationDate?: string;
    dte?: number;
    referredToProviderName?: string;
    referredByProviderName?: string;
    referredToFacility?: string;
    start?: string;
    end?: string;
  }>;
  canSendMessage?: boolean;
  canSeeAuthorizations?: boolean;
  shouldRedirect?: boolean;
};
