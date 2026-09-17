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

/** Repeated shape. Appears in: prelogin, chart/profile. */
export type County = {
  Value?: string | null;
  Number?: string;
  Title?: string | null;
  Abbreviation?: string | null;
  Abbr?: string | null;
  Comment?: string | null;
  IsInactive?: boolean;
  TitleUtf8?: string | null;
  AbbreviationUtf8?: string | null;
  IsFallbackUsed?: boolean;
};
