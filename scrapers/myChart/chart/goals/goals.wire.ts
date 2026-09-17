/**
 * Raw MyChart responses for the `goals` scraper.
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
 * Endpoints: /api/goals/loadcareteamgoals, /api/goals/loadpatientgoals
 *
 * Keep in step with the captures; `scrapers/myChart/__tests__/wireShapes.unit.test.ts`
 * fails the build if these miss a field or invent one.
 */

/** Repeated shape. Appears in: chart/goals. */
export type QuickLinkDictionary = {
  HealthSummary: string;
  HealthIssues: string;
  Allergies: string;
  Immunizations: string;
  PreventiveCare: string;
  Medications: string;
  TrackMyHealth: string;
};

/** `/api/goals/loadcareteamgoals` */
export type LoadCareTeamGoals = {
  careTeamGoals: unknown[];
  hasChartGraphSecurity: boolean;
  isSharingNotesEnabled: boolean;
  quickLinkDictionary: QuickLinkDictionary;
};

/** `/api/goals/loadpatientgoals` */
export type LoadPatientGoals = {
  patientGoals: Array<{
    goalId: string;
    goalType: number;
    readings: unknown[];
    complianceType: number;
    lastUpdatedDate: string;
    creationDate: string;
    isSharingNotesEnabled: boolean;
  }>;
  hasChartGraphSecurity: boolean;
  isSharingNotesEnabled: boolean;
  quickLinkDictionary: QuickLinkDictionary;
};
