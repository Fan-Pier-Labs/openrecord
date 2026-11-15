// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

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

/** A flowsheet whose readings never loaded; left out of `flowsheets`. */
export interface UnloadedFlowsheetStandard {
  name: string | null;
}

/** A flowsheet in `flowsheets` whose history stops early because an older page failed. */
export interface TruncatedFlowsheetStandard {
  name: string | null;
  /** The oldest reading that did load. */
  oldestLoadedIso: string | null;
}

export interface VitalsStandard {
  /** Derived: sentences for the reader when any flowsheet did not fully load; null otherwise. */
  notice: string | null;
  flowsheets: FlowsheetStandard[];
  /** Derived. */
  unloadedFlowsheets: UnloadedFlowsheetStandard[];
  /** Derived. */
  truncatedFlowsheets: TruncatedFlowsheetStandard[];
}
