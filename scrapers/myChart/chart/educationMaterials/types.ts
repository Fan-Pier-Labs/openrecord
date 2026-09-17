/**
 * Raw MyChart responses for the `educationMaterials` scraper.
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
 * Endpoints: /api/education/getpateducationtitles
 *
 * Keep in step with `realShapes.ts` when the captures are refreshed.
 */

/** `/api/education/getpateducationtitles` */
export type GetPatEducationTitles = Array<{
  elementId?: string;
  displayName?: string;
  assignedDate?: string;
  eduKey?: string;
  numTopics?: number;
  numPoints?: number;
  isAdmitted?: boolean;
  encounterContext?: number;
  wasAssignedThisVisit?: boolean;
  canUserTrackUnderstanding?: boolean;
  numPagesReviewed?: number;
  numPagesUnderstood?: number;
  numPagesQuestions?: number;
  thumbnailImage?: string;
  thumbnailImageBlobToken?: string;
  thumbnailIcon?: number;
  tvSupported?: boolean;
  removeThumbnails?: boolean;
}>;
