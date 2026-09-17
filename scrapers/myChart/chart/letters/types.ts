/**
 * Raw MyChart responses for the `letters` scraper.
 *
 * Observed by the capture harness behind `fake-mychart/src/data/realShapes.ts`
 * on three real instances — what we have seen, never a contract Epic owes us.
 *
 * `unknown` means the field was `null` on every instance captured: we saw no
 * value, so we know no type. `unknown[]` means the array was always empty, so
 * we have never seen an element. Neither is `null` or `never[]`, which would
 * read as settled.
 *
 * Read a payload with `rec<T>()` from `processors/read.ts` — it checks the
 * field names and leaves every value to `text()` / `num()` / `list()`. Never
 * `as`: that checks the same names and then lies about the values.
 *
 * Endpoints: /api/letters/getletterslist
 *
 * Keep in step with `realShapes.ts` when the captures are refreshed.
 */

/** `/api/letters/getletterslist` */
export type GetLettersList = {
  letters?: Array<{
    dateISO?: string;
    viewed?: boolean;
    hnoId?: string;
    csn?: string;
    reason?: string;
    empId?: string;
  }>;
  users?: Record<string, {
    empId?: string;
    name?: string;
    photoUrl?: string;
  }>;
  departments?: Record<string, unknown>;
};
