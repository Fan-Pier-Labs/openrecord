/**
 * Vitals processor. Field decisions: docs/processor-layer-proposal.md, `get_vitals`.
 *
 * MyChart splits Track My Health across two endpoints: `GetFlowsheets` (the
 * episodes and their row metadata, no values) and `GetFlowsheetReadings`
 * (the readings, paged backwards). The scraper records every page; this joins
 * them back into one flowsheet per episode, de-duplicating the boundary
 * instant that consecutive pages both carry.
 */

import { findRequest, findRequests, type RawResponse } from '../../core/rawResponse';
import type { Processor } from '../../processors/processor';
import { boolOrNull, list, num, rec, strings, text, textOrNull } from '../../processors/read';

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

/** At most one decimal, no trailing zero: 155.6 stays, 150.0 becomes 150. */
function oneDecimal(n: number): string {
  return String(Number(n.toFixed(1)));
}

/**
 * `numericValue` is in Epic's base unit — weight in OUNCES, height in INCHES,
 * temperature in °F — while `unitsDisplayName` names the unit the MyChart UI
 * shows. Verified on a real instance: a 150 lb weight arrives as 2400 beside
 * `lbs`, a 5' 10" height as 70 beside `ft` (README). Convert into the display
 * unit. Any other unit — including `kg` / `cm`, which no captured instance has
 * sent — passes the number through untouched rather than modelling a guess.
 */
export function displayValue(n: number, unitsDisplayName: string | null | undefined): string {
  switch ((unitsDisplayName ?? '').trim().toLowerCase()) {
    case 'lbs':
    case 'lb':
      return oneDecimal(n / 16);
    case 'ft': {
      // Round the total first so 71.96 in is 6' 0", not 5' 12".
      const total = Number(n.toFixed(1));
      const feet = Math.floor(total / 12);
      return `${feet}' ${oneDecimal(total - feet * 12)}"`;
    }
    default:
      return String(n);
  }
}

/**
 * MyChart sends BOTH value fields on every reading: string rows (Blood
 * Pressure, "145/95") carry `stringValue`, while numeric rows (Pulse, Weight)
 * carry the number in `numericValue` and still include `stringValue` as an
 * EMPTY string. Take the first field that actually holds something, and put a
 * number into the row's display unit.
 */
export function readingValue(reading: Record<string, unknown>, unitsDisplayName?: string | null): string {
  const s = text(reading.stringValue).trim();
  if (s) return s;
  const n = num(reading.numericValue);
  return n === null ? '' : displayValue(n, unitsDisplayName);
}

function row(value: unknown): FlowsheetRowStandard {
  const r = rec(value);
  return {
    id: textOrNull(r.id),
    name: textOrNull(r.name),
    unitsDisplayName: textOrNull(r.unitsDisplayName),
    rowType: textOrNull(r.rowType),
    valueType: textOrNull(r.valueType),
    decimalPlaces: num(r.decimalPlaces),
  };
}

function readingStandard(value: unknown, unitsDisplayName: string | null | undefined): VitalReadingStandard {
  const r = rec(value);
  return {
    rowId: textOrNull(r.rowId),
    instantTakenIso: textOrNull(r.instantTakenIso),
    timeZone: textOrNull(r.timeZone),
    stringValue: textOrNull(r.stringValue),
    numericValue: num(r.numericValue),
    value: readingValue(r, unitsDisplayName),
    isAbnormal: boolOrNull(r.isAbnormal),
    entryType: textOrNull(r.entryType),
    documentationSource: textOrNull(r.documentationSource),
  };
}

export const vitalsProcessor: Processor<VitalsStandard> = {
  standard(raw: RawResponse): VitalsStandard {
    const listBody = rec(findRequest(raw, 'GetFlowsheets')?.body);
    const pages = findRequests(raw, 'GetFlowsheetReadings');
    const flowsheets: FlowsheetStandard[] = [];

    for (const fs of list(listBody.flowsheets)) {
      const definition = rec(fs);
      const episodeId = text(definition.episodeId);
      const ownPages = pages.filter((p) => text(rec(p.requestBody).episodeId) === episodeId);

      // Row metadata from the definition, backfilled from the readings pages
      // when GetFlowsheets omitted it.
      const rows = new Map<string, FlowsheetRowStandard>();
      const addRows = (source: unknown) => {
        for (const r of list(source)) {
          const parsed = row(r);
          if (parsed.id && !rows.has(parsed.id)) rows.set(parsed.id, parsed);
        }
      };
      addRows(definition.rows);
      for (const page of ownPages) addRows(rec(rec(page.body).flowsheet).rows);

      const seen = new Set<string>();
      const readings: VitalReadingStandard[] = [];
      for (const page of ownPages) {
        for (const r of list(rec(rec(page.body).flowsheet).readings)) {
          const parsed = readingStandard(r, rows.get(text(rec(r).rowId))?.unitsDisplayName);
          const key = `${parsed.rowId ?? ''}\u0000${parsed.instantTakenIso ?? ''}`;
          if (seen.has(key)) continue;
          seen.add(key);
          readings.push(parsed);
        }
      }

      flowsheets.push({
        name: textOrNull(definition.name),
        status: textOrNull(definition.status),
        startDateIso: textOrNull(definition.startDateIso),
        endDateIso: textOrNull(definition.endDateIso),
        instructions: textOrNull(definition.instructions),
        rows: [...rows.values()],
        rowGroups: list(definition.rowGroups).map((g) => ({
          id: textOrNull(rec(g).id),
          name: textOrNull(rec(g).name),
          rowIds: strings(rec(g).rowIds),
        })),
        readings,
      });
    }
    return { flowsheets };
  },

  /** Per vital type: name, units, the latest reading, the count, and every abnormal reading. */
  concise(standard) {
    return {
      flowsheets: standard.flowsheets.map((fs) => ({
        name: fs.name,
        rows: fs.rows.map((r) => {
          const own = fs.readings
            .filter((reading) => reading.rowId === r.id)
            .sort((a, b) => (a.instantTakenIso ?? '').localeCompare(b.instantTakenIso ?? ''));
          const latest = own[own.length - 1];
          return {
            name: r.name,
            unitsDisplayName: r.unitsDisplayName,
            readingCount: own.length,
            latestReading: latest ? { instantTakenIso: latest.instantTakenIso, value: latest.value, isAbnormal: latest.isAbnormal } : null,
            abnormalReadings: own
              .filter((reading) => reading.isAbnormal === true)
              .map((reading) => ({ instantTakenIso: reading.instantTakenIso, value: reading.value })),
          };
        }),
      })),
    };
  },
};
