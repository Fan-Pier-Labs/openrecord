/**
 * What the `allergies` capabilities return: the standard objects the processors
 * build from MyChart's responses. MyChart's own shapes are in
 * `./mychart.types.ts`.
 */

export interface AllergiesStandard {
  /** One allergy per element, as MyChart sent it (shape uncaptured). */
  dataList: unknown[];
  /** Status code of the allergy list: reviewed vs unreviewed. */
  allergiesStatus: number | null;
  dateOfBirth: string | null;
}
