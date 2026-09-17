/**
 * What `get_allergies` returns: the standard object the processor builds from
 * MyChart's response. MyChart's own shape is in `./mychart.types.ts`.
 */

export interface AllergiesStandard {
  /** One allergy per element, as MyChart sent it (shape uncaptured). */
  dataList: unknown[];
  /** Status code of the allergy list: reviewed vs unreviewed. */
  allergiesStatus: number | null;
  dateOfBirth: string | null;
}
