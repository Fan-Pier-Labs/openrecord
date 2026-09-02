/**
 * Dumps the STRUCTURE of Track My Health's two flowsheet endpoints from a real
 * MyChart account, to settle two questions the captured skeletons in
 * `fake-mychart/src/data/realShapes.ts` cannot answer:
 *
 *   1. Do flowsheet ROWS carry a units field at all? The skeletons show rows as
 *      { id, name, rowType, valueType, decimalPlaces } — no `unitsDisplayName`,
 *      which `getVitals` is the only source of `VitalReading.units`. If real
 *      rows really have no units field, every vital we return is unitless and
 *      the fake's hand-written 'mmHg'/'lbs' are hiding it.
 *   2. How does a NUMERIC row (Pulse, Weight) carry its value — `numericValue`
 *      beside an empty `stringValue`, or a populated `stringValue`? The captured
 *      readings show `stringValue` and no `numericValue`, which is consistent
 *      with a capture whose flowsheet held only Blood Pressure.
 *
 * Prints field names, field presence, and units strings — never a reading's
 * value, and never a date. Nothing is written to disk.
 *
 * Usage:
 *   bun dev-scripts/probe-flowsheet-shape.ts <hostname>
 *
 * Reads the session the CLI already cached for that host, so run
 * `bun run cli mychart --host <hostname>` once first.
 */

import { makeAuthenticatedRequest } from '../scrapers/myChart/core/makeAuthenticatedRequest';
import { getRequestVerificationTokenFromBody } from '../scrapers/myChart/core/util';
import { tryLoadCachedSession } from '../npm-package/cli/sessionCache';

/** Field names present on an object, so we report shape without reporting data. */
function keysOf(o: unknown): string[] {
  return o && typeof o === 'object' ? Object.keys(o).sort() : [];
}

/** Render a field for the report without assuming it is a scalar. */
function str(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
}

async function main() {
  const [hostname] = process.argv.slice(2);
  if (!hostname) {
    console.error('usage: probe-flowsheet-shape.ts <hostname>');
    process.exit(1);
  }

  const req = await tryLoadCachedSession(hostname);
  if (!req) {
    throw new Error(`No usable cached session for ${hostname}. Run: bun run cli mychart --host ${hostname}`);
  }

  const page = await makeAuthenticatedRequest(req, { path: '/app/track-my-health' });
  const token = getRequestVerificationTokenFromBody(await page.text());
  if (!token) throw new Error('No __RequestVerificationToken on /app/track-my-health');
  const headers = { 'Content-Type': 'application/json', '__RequestVerificationToken': token };

  const listResp = await makeAuthenticatedRequest(req, {
    path: '/api/track-my-health/GetFlowsheets',
    method: 'POST',
    headers,
    body: JSON.stringify({ organizationId: '' }),
  });
  const list = await listResp.json() as { flowsheets?: Array<Record<string, unknown>> };

  for (const fsheet of list.flowsheets ?? []) {
    const rows = (fsheet.rows ?? []) as Array<Record<string, unknown>>;
    console.log(`\n── flowsheet ──`);
    console.log(`  GetFlowsheets flowsheet keys: ${keysOf(fsheet).join(', ')}`);
    console.log(`  rows: ${rows.length}`);

    // Question 1: units. Row NAMES are vital-type labels ("Pulse"), not patient
    // data, and units are units — both are safe to print.
    for (const row of rows) {
      const unitFields = keysOf(row).filter((k) => /unit/i.test(k));
      console.log(
        `    row "${str(row.name)}" valueType=${str(row.valueType)} ` +
        `keys=[${keysOf(row).join(', ')}] ` +
        `unitFields=${unitFields.length ? unitFields.map((k) => `${k}="${str(row[k])}"`).join(' ') : 'NONE'}`
      );
    }

    if (!fsheet.episodeId) continue;

    const rResp = await makeAuthenticatedRequest(req, {
      path: '/api/track-my-health/GetFlowsheetReadings',
      method: 'POST',
      headers,
      body: JSON.stringify({ episodeId: fsheet.episodeId, endInstantIso: '2099-12-31T23:59:59', numReadings: 25 }),
    });
    const rJson = await rResp.json() as { flowsheet?: { rows?: Array<Record<string, unknown>>; readings?: Array<Record<string, unknown>> } };
    const readings = rJson.flowsheet?.readings ?? [];
    const rowName = new Map((rJson.flowsheet?.rows ?? []).map((r) => [str(r.id), str(r.name)]));

    console.log(`  GetFlowsheetReadings: ${readings.length} readings`);
    console.log(`    union of reading keys: ${[...new Set(readings.flatMap(keysOf))].sort().join(', ') || 'NONE'}`);

    // Question 2: which value field each row type actually populates. Report
    // PRESENCE and emptiness only — never the value itself.
    const perRow = new Map<string, { n: number; numeric: number; strNonEmpty: number; strEmpty: number; strMissing: number; unitFields: Set<string> }>();
    for (const r of readings) {
      const key = rowName.get(str(r.rowId)) || str(r.rowId);
      const acc = perRow.get(key) ?? { n: 0, numeric: 0, strNonEmpty: 0, strEmpty: 0, strMissing: 0, unitFields: new Set<string>() };
      acc.n++;
      if (r.numericValue !== undefined && r.numericValue !== null) acc.numeric++;
      if (!('stringValue' in r)) acc.strMissing++;
      else if (str(r.stringValue).trim() === '') acc.strEmpty++;
      else acc.strNonEmpty++;
      for (const k of keysOf(r)) if (/unit/i.test(k)) acc.unitFields.add(k);
      perRow.set(key, acc);
    }
    for (const [name, a] of perRow) {
      console.log(
        `    "${name}": n=${a.n} numericValue=${a.numeric} ` +
        `stringValue[nonEmpty=${a.strNonEmpty} empty=${a.strEmpty} absent=${a.strMissing}] ` +
        `unitFields=${a.unitFields.size ? [...a.unitFields].join(',') : 'NONE'}`
      );
    }
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
