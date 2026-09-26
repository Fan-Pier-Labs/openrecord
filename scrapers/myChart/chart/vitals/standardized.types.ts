/**
 * What the `vitals` capabilities return: the standard objects the processors
 * build from MyChart's responses. MyChart's own shapes are in
 * `./mychart.types.ts`.
 */

export interface FlowsheetRowStandard {
  id: string | null;
  name: string | null;
  unitsDisplayName: string | null;
  rowType: string | null;
  valueType: string | null;
  decimalPlaces: number | null;
}

export interface FlowsheetRowGroupStandard {
  id: string | null;
  name: string | null;
  rowIds: string[];
}

export interface VitalReadingStandard {
  rowId: string | null;
  instantTakenIso: string | null;
  timeZone: string | null;
  stringValue: string | null;
  /** As MyChart sent it: Epic's base unit (weight in ounces, height in inches), NOT the row's display unit. */
  numericValue: number | null;
  /** Derived: the reading in the row's `unitsDisplayName` — `stringValue` as is, or `numericValue` converted. */
  value: string;
  isAbnormal: boolean | null;
  entryType: string | null;
  documentationSource: string | null;
}

export interface FlowsheetStandard {
  name: string | null;
  status: string | null;
  startDateIso: string | null;
  endDateIso: string | null;
  instructions: string | null;
  rows: FlowsheetRowStandard[];
  rowGroups: FlowsheetRowGroupStandard[];
  readings: VitalReadingStandard[];
}

export interface VitalsStandard {
  flowsheets: FlowsheetStandard[];
}
