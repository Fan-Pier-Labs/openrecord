// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * Vitals processor. Field decisions: docs/processor-layer-proposal.md, `get_vitals`.
 *
 * MyChart splits Track My Health across two endpoints: `GetFlowsheets` (the
 * episodes and their row metadata, no values) and `GetFlowsheetReadings`
 * (the readings, paged backwards). The scraper records every page; this joins
 * them back into one flowsheet per episode, de-duplicating the boundary
 * instant that consecutive pages both carry.
 *
 * A flowsheet whose readings never loaded is not reported as one with no
 * readings: it goes to `unloadedFlowsheets`. One whose older pages failed is
 * kept and named in `truncatedFlowsheets`. `notice` says both. Each is read off
 * the flowsheet's own page chain, because a thrown transport error is never
 * recorded — only the missing next page shows it.
 */

import { answered, findRequest, findRequests, type RawRequestRecord, type RawResponse } from '../../core/rawResponse';
import type { Processor } from '../../processors/processor';
import { boolOrNull, list, num, rec, strings, text, textOrNull } from '../../processors/read';
import type { GetFlowsheetReadings, GetFlowsheets } from './mychart.types';
import type { FlowsheetRowStandard, FlowsheetStandard, TruncatedFlowsheetStandard, UnloadedFlowsheetStandard, VitalReadingStandard, VitalsStandard } from './standardized.types';

export type { FlowsheetRowGroupStandard, FlowsheetRowStandard, FlowsheetStandard, TruncatedFlowsheetStandard, UnloadedFlowsheetStandard, VitalReadingStandard, VitalsStandard } from './standardized.types';

/** The scraper's safety bound on pages per flowsheet; a chain that reaches it is cut short too. */
export const MAX_READING_PAGES = 100;

/**
 * How a flowsheet's page chain ended. The scraper stops on an empty page or
 * one that reaches no further back; a last page that would have continued
 * means the next request failed before anything was recorded.
 */
function pagingState(pages: RawRequestRecord[]): 'unloaded' | 'truncated' | 'complete' {
  if (!pages.some((p) => answered(p))) return 'unloaded';
  const last = pages[pages.length - 1]!;
  if (!answered(last)) return 'truncated';
  const data = rec(rec<GetFlowsheetReadings>(last.body).flowsheet);
  if (Object.keys(data).length === 0) return 'complete';
  const instants = list(data.readings).map((r) => text(rec(r).instantTakenIso)).filter(Boolean).sort();
  const oldest = instants[0];
  if (!oldest || oldest >= text(rec(last.requestBody).endInstantIso)) return 'complete';
  return 'truncated';
}

function vitalsNotice(unloaded: UnloadedFlowsheetStandard[], truncated: TruncatedFlowsheetStandard[], total: number): string | null {
  const sentences: string[] = [];
  if (unloaded.length > 0) {
    sentences.push(
      `MyChart failed to return the readings for ${unloaded.length} of ${total} flowsheets: ${unloaded.map((f) => f.name ?? 'unnamed').join(', ')}. ` +
        'They are listed under unloadedFlowsheets and left out of flowsheets — their readings are unknown, not absent. They may load on a retry.',
    );
  }
  for (const f of truncated) {
    sentences.push(
      `The history for ${f.name ?? 'a flowsheet'} stops at ${f.oldestLoadedIso ?? 'an unknown date'} because an older page failed to load; ` +
        'earlier readings may exist (truncatedFlowsheets).',
    );
  }
  return sentences.length > 0 ? sentences.join(' ') : null;
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
    const listBody = rec<GetFlowsheets>(findRequest(raw, 'GetFlowsheets')?.body);
    const pages = findRequests(raw, 'GetFlowsheetReadings');
    const flowsheets: FlowsheetStandard[] = [];
    const unloadedFlowsheets: UnloadedFlowsheetStandard[] = [];
    const truncatedFlowsheets: TruncatedFlowsheetStandard[] = [];
    const definitions = list(listBody.flowsheets);

    for (const fs of definitions) {
      const definition = rec(fs);
      const episodeId = text(definition.episodeId);
      const chain = pages.filter((p) => text(rec(p.requestBody).episodeId) === episodeId);
      const state = episodeId && chain.length < MAX_READING_PAGES ? pagingState(chain) : episodeId ? 'truncated' : 'complete';
      if (state === 'unloaded') {
        unloadedFlowsheets.push({ name: textOrNull(definition.name) });
        continue;
      }
      const ownPages = chain.filter((p) => answered(p));

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
      for (const page of ownPages) addRows(rec(rec<GetFlowsheetReadings>(page.body).flowsheet).rows);

      const seen = new Set<string>();
      const readings: VitalReadingStandard[] = [];
      for (const page of ownPages) {
        for (const r of list(rec(rec<GetFlowsheetReadings>(page.body).flowsheet).readings)) {
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
      if (state === 'truncated') {
        const oldest = readings.map((r) => r.instantTakenIso ?? '').filter(Boolean).sort()[0];
        truncatedFlowsheets.push({ name: textOrNull(definition.name), oldestLoadedIso: oldest ?? null });
      }
    }
    return {
      notice: vitalsNotice(unloadedFlowsheets, truncatedFlowsheets, definitions.length),
      flowsheets,
      unloadedFlowsheets,
      truncatedFlowsheets,
    };
  },

  /** Per vital type: name, units, the latest reading, the count, and every abnormal reading. */
  concise(standard) {
    return {
      notice: standard.notice,
      unloadedFlowsheets: standard.unloadedFlowsheets,
      truncatedFlowsheets: standard.truncatedFlowsheets,
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
