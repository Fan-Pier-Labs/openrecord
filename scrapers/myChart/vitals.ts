import { makeAuthenticatedRequest } from './makeAuthenticatedRequest';
import type { MyChartRequest } from "./myChartRequest";
import { getRequestVerificationTokenFromBody } from "./util";
import { logger } from '../../shared/logger';

export type VitalReading = {
  /** ISO instant the reading was taken (e.g. "2025-08-11T06:29:00"). */
  date: string;
  /** The value. Blood pressure comes back as "123/81"; numeric vitals as their number. */
  value: string;
  /** Display units (e.g. "mmHg", "lbs", "°F"). */
  units: string;
  /** Whether the value was flagged abnormal. */
  isAbnormal: boolean;
  /** How the reading was recorded (e.g. "clinical"). */
  entryType: string;
};

export type Flowsheet = {
  /** Vital-type name, e.g. "Blood Pressure", "Weight", "Pulse". */
  name: string;
  /** Stable row identifier for this vital type within MyChart. */
  flowsheetId: string;
  readings: VitalReading[];
};

// ── Raw MyChart API shapes ──
type RawRow = { id?: string; name?: string; unitsDisplayName?: string };
type RawReading = {
  rowId?: string;
  instantTakenIso?: string;
  numericValue?: number;
  stringValue?: string;
  isAbnormal?: boolean;
  entryType?: string;
};
type RawFlowsheet = {
  episodeId?: string;
  name?: string;
  rows?: RawRow[];
  readings?: RawReading[];
  hasMoreData?: boolean;
  nextReadingDateIso?: string;
};
type GetFlowsheetsResponse = { flowsheets?: RawFlowsheet[] };
type GetFlowsheetReadingsResponse = { flowsheet?: RawFlowsheet };

/** End-of-day tomorrow, formatted as MyChart expects (no timezone suffix). */
function defaultEndInstantIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T23:59:59`;
}

// NOTE: numReadings caps distinct reading INSTANTS (flowsheet columns), not
// individual readings. At 200 this silently truncated history to the most recent
// 200 instants — ~693 readings across 7 vital types, which looked like plenty and
// hid the cap for months.
const PAGE_SIZE = 1000;
const MAX_PAGES = 100; // safety bound for accounts with long histories

/**
 * Fetches Track My Health vitals (Blood Pressure, Weight, Pulse, etc.).
 *
 * MyChart splits this across TWO endpoints:
 *   1. GetFlowsheets        → flowsheet definitions (episodeId + row metadata; NO values)
 *   2. GetFlowsheetReadings → the actual readings for an episode, paginated
 *
 * The readings are returned as a flat list keyed by rowId; we group them back
 * into one Flowsheet per vital type.
 */
export async function getVitals(mychartRequest: MyChartRequest): Promise<Flowsheet[]> {
  const pageResp = await makeAuthenticatedRequest(mychartRequest, { path: '/app/track-my-health' });
  const html = await pageResp.text();
  const token = getRequestVerificationTokenFromBody(html);

  if (!token) {
    logger.debug('Could not find request verification token for vitals');
    return [];
  }

  const headers = { 'Content-Type': 'application/json', '__RequestVerificationToken': token };

  const listResp = await makeAuthenticatedRequest(mychartRequest, {
    path: '/api/track-my-health/GetFlowsheets',
    method: 'POST',
    headers,
    body: JSON.stringify({ organizationId: "" }),
  });
  const list: GetFlowsheetsResponse = await listResp.json();

  const flowsheets: Flowsheet[] = [];

  for (const fs of list.flowsheets || []) {
    if (!fs.episodeId) continue;

    // Row metadata: id → { name, units }
    const rowMeta = new Map<string, { name: string; units: string }>();
    for (const row of fs.rows || []) {
      if (row.id) rowMeta.set(row.id, { name: row.name || '', units: row.unitsDisplayName || '' });
    }

    // Group readings by rowId, paging backwards through history.
    const byRow = new Map<string, VitalReading[]>();
    // Consecutive pages overlap on the boundary instant, so readings must be deduped.
    const seen = new Set<string>();
    let endInstantIso = defaultEndInstantIso();

    for (let page = 0; page < MAX_PAGES; page++) {
      const rResp = await makeAuthenticatedRequest(mychartRequest, {
        path: '/api/track-my-health/GetFlowsheetReadings',
        method: 'POST',
        headers,
        body: JSON.stringify({ episodeId: fs.episodeId, endInstantIso, numReadings: PAGE_SIZE }),
      });
      const rJson: GetFlowsheetReadingsResponse = await rResp.json();
      const data = rJson.flowsheet;
      if (!data) break;

      // Backfill row metadata from the readings response if GetFlowsheets omitted it.
      for (const row of data.rows || []) {
        if (row.id && !rowMeta.has(row.id)) rowMeta.set(row.id, { name: row.name || '', units: row.unitsDisplayName || '' });
      }

      let oldestInstant: string | undefined;

      for (const r of data.readings || []) {
        if (!r.rowId) continue;
        const instant = r.instantTakenIso || '';
        if (instant && (oldestInstant === undefined || instant < oldestInstant)) oldestInstant = instant;

        const dedupeKey = `${r.rowId}\u0000${instant}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        const meta = rowMeta.get(r.rowId);
        const value = r.stringValue ?? (r.numericValue !== undefined && r.numericValue !== null ? String(r.numericValue) : '');
        const readings = byRow.get(r.rowId) || [];
        readings.push({
          date: instant,
          value,
          units: meta?.units || '',
          isAbnormal: !!r.isAbnormal,
          entryType: r.entryType || '',
        });
        byRow.set(r.rowId, readings);
      }

      // Deliberately NOT keyed off hasMoreData: MyChart reports it false while
      // older readings still exist, which is what capped history at one page.
      // Walk back from the oldest instant this page returned and stop only when
      // a request fails to reach any further back.
      if (!oldestInstant || oldestInstant >= endInstantIso) break;
      endInstantIso = oldestInstant;
    }

    // Emit one Flowsheet per vital type that has readings.
    for (const [rowId, readings] of byRow) {
      const meta = rowMeta.get(rowId);
      flowsheets.push({ name: meta?.name || '', flowsheetId: rowId, readings });
    }
  }

  return flowsheets;
}
