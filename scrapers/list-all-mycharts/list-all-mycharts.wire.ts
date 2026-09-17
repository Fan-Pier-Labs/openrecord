/**
 * Raw MyChart responses for the `list-all-mycharts` scraper.
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
 * Keep in step with the captures; `scrapers/myChart/__tests__/wireShapes.unit.test.ts`
 * fails the build if these miss a field or invent one.
 */

/** `hide the two logo fallbacks every client implements.` */
export type HelpOrganization = {
  slgId: string;
  name: string;
  states: unknown[];
  countries: unknown[];
  brandName: string;
  loginUrl: string;
  liveOnCentral: boolean;
  email: string;
  phone: string;
  faq: string;
  aliases: unknown[];
};

/** `entirely unless the request asks for it with includeOrganizations=1.` */
export type HelpOrganizations = {
  organizationOptionsByScreenId: Record<string, unknown>;
  countryData: {
    alpha_2_index: Record<string, unknown>;
  };
  stateData: {
    abbreviation_index: Record<string, unknown>;
  };
};
