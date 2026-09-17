/**
 * Response shapes MyChart repeats across more than one scraper.
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
 * Endpoints: /api/report-content/loadreportcontent
 *
 * Keep in step with the captures; `scrapers/myChart/__tests__/wireShapes.unit.test.ts`
 * fails the build if these miss a field or invent one.
 */

/** Repeated shape. Appears in: prelogin, chart/profile. */
export type County = {
  Value: string | null;
  Number: string;
  Title: string | null;
  Abbreviation: string | null;
  Abbr: string | null;
  Comment: string | null;
  IsInactive: boolean;
  TitleUtf8: string | null;
  AbbreviationUtf8: string | null;
  IsFallbackUsed: boolean;
};

/** Repeated shape. Appears in: chart/immunizations, chart/medications. */
export type Organization = {
  organizationId: string;
  organizationName: string;
  logoUrl: string;
  isLocal: boolean;
  isSSO: boolean;
  incompleteH2GSetup: boolean;
  address: string[];
  linkType: number;
  currentlyLoadingData: boolean;
  errorLoadingData: boolean;
  hasValidRefreshToken: boolean;
  shouldRemindForUpdate: boolean;
  showInRefreshBanner: boolean;
  disclaimerOverride: boolean;
  isMyChartCentral: boolean;
};

/** `/api/report-content/loadreportcontent` */
export type LoadReportContent = {
  reportContent: string;
  reportCss: string;
  baseFontSize: number;
  stylesheets: string[];
};
