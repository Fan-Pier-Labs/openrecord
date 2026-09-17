/**
 * Response shapes MyChart repeats across more than one scraper.
 *
 * A shape lives here only when two folders both need it; a scraper's own
 * shapes stay in its `mychart.types.ts`. Observed by the capture harness
 * behind `fake-mychart/src/data/realShapes.ts` on three real instances — what
 * we have seen, never a contract Epic owes us, so every field is optional.
 *
 * Keep in step with `realShapes.ts` when the captures are refreshed.
 */

/** Repeated shape. Appears in: chart/immunizations, chart/medications. */
export type Organization = {
  organizationId?: string;
  organizationName?: string;
  logoUrl?: string;
  isLocal?: boolean;
  isSSO?: boolean;
  incompleteH2GSetup?: boolean;
  address?: string[];
  linkType?: number;
  currentlyLoadingData?: boolean;
  errorLoadingData?: boolean;
  hasValidRefreshToken?: boolean;
  shouldRemindForUpdate?: boolean;
  showInRefreshBanner?: boolean;
  disclaimerOverride?: boolean;
  isMyChartCentral?: boolean;
};
