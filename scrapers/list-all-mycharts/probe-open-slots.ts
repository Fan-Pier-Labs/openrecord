/**
 * Runs the open-slot scraper against every instance that serves the anonymous
 * scheduling directory, and reports where it works.
 *
 * `probe-open-scheduling.ts` answers "who exposes the workflow". This answers
 * the harder question: does `fetchOpenSlots` actually get slots back, or does
 * the instance refuse the search? The first implementation was verified on a
 * single host and turned out not to be portable — two of the next three
 * instances tried refused the same payload — so the portability number needs
 * measuring rather than assuming.
 *
 * It calls the real `fetchOpenSlots`, so whatever this reports is what a
 * caller of the library gets. One specialty per host and one page of results:
 * the question is whether the search is accepted at all.
 *
 * Usage:
 *   bun scrapers/list-all-mycharts/probe-open-slots.ts [--hosts a,b] [--limit 50] [--concurrency 12] [--out r.jsonl]
 */

import * as fs from 'fs';
import * as path from 'path';
import { determineFirstPathPart } from '../myChart/auth/login';
import { fetchOpenSlots } from '../myChart/prelogin/openSlots';
import { PreloginEndpointError } from '../myChart/prelogin/preloginSession';
import { groupByHost, timeBoundedRequest, type HostEntry } from './probe-mount-discovery';
import { setLogSink, silenceLogger } from '../../shared/logger';

const INSTANCES_FILE = path.join(path.dirname(import.meta.path), 'mychart-instances.json');
const HOST_TIMEOUT_MS = 120_000;

export type SlotProbeOutcome =
  | 'slots' // the search ran and returned at least one slot
  | 'no-slots' // the search ran, the instance simply has nothing open
  | 'error-code' // the search ran and the instance answered with its own code
  | 'refused' // GetSlots rejected the payload (the portability failure)
  | 'no-workflow' // the host does not serve open scheduling at all
  | 'unreachable';

export type SlotProbeResult = {
  host: string;
  outcome: SlotProbeOutcome;
  specialty?: string;
  slotCount?: number;
  /** The instance's own `ErrorCode`, passed through uninterpreted. */
  errorCode?: number | string | null;
  /** HTTP status behind a `refused` — 500 and 302 are the two release surfaces. */
  status?: number;
  error?: string;
  ms?: number;
};

export function classify(e: unknown): { outcome: SlotProbeOutcome; status?: number; error: string } {
  const error = String((e as Error)?.message ?? e).slice(0, 200);
  if (e instanceof PreloginEndpointError) {
    // A refusal on GetSlots is the portability failure; anything earlier in the
    // walk means the host never had the workflow to begin with.
    const outcome = e.path.endsWith('GetSlots') ? 'refused' : 'no-workflow';
    return { outcome, status: e.status, error };
  }
  if (/no specialty|lists no open-scheduling/i.test(error)) return { outcome: 'no-workflow', error };
  return { outcome: 'unreachable', error };
}

export async function probeHost(entry: HostEntry): Promise<SlotProbeResult> {
  const started = Date.now();
  const result: SlotProbeResult = { host: entry.host, outcome: 'unreachable' };
  try {
    const req = timeBoundedRequest(entry.host);
    await Promise.race([
      determineFirstPathPart(req),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('host timed out')), HOST_TIMEOUT_MS);
      }),
    ]);
    const search = await fetchOpenSlots(req, { maxPages: 1, maxPairs: 30 });
    result.errorCode = search.errorCode;
    result.outcome = search.slots.length > 0 ? 'slots' : search.errorCode !== null ? 'error-code' : 'no-slots';
    result.specialty = search.specialty.name;
    result.slotCount = search.slots.length;
  } catch (e) {
    Object.assign(result, classify(e));
  }
  result.ms = Date.now() - started;
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (n: string) => {
    const i = args.indexOf(n);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const outFile = flag('--out');
  const concurrency = Number(flag('--concurrency') ?? 12);
  const limit = Number(flag('--limit') ?? 0);
  const onlyHosts = flag('--hosts')?.split(',').map((h) => h.trim()).filter(Boolean);

  if (args.includes('--verbose')) setLogSink((l, a) => console.error(`[${l}]`, ...a));
  else silenceLogger();

  const instances: { name: string; url: string }[] = JSON.parse(fs.readFileSync(INSTANCES_FILE, 'utf-8'));
  let entries = groupByHost(instances);
  if (onlyHosts) entries = entries.filter((e) => onlyHosts.includes(e.host));
  if (limit) entries = entries.slice(0, limit);

  console.error(`Probing GetSlots on ${entries.length} hosts (concurrency ${concurrency})…`);
  const out = outFile ? fs.createWriteStream(outFile, { flags: 'a' }) : null;
  const results: SlotProbeResult[] = [];
  const queue = [...entries];
  let done = 0;

  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (queue.length) {
        const entry = queue.shift();
        if (!entry) break;
        const r = await probeHost(entry);
        results.push(r);
        out?.write(JSON.stringify(r) + '\n');
        if (++done % 25 === 0) console.error(`  ${done}/${entries.length}`);
      }
    }),
  );
  out?.end();

  const by = (o: SlotProbeOutcome) => results.filter((r) => r.outcome === o);
  const ran = by('slots').length + by('no-slots').length + by('error-code').length;
  const refused = by('refused');
  console.error(`\nGetSlots accepted on ${ran}/${results.length} hosts (${by('slots').length} returned slots)`);
  console.error(`  ${by('error-code').length} answered with an ErrorCode`);
  console.error(`  ${refused.length} refused the search`);
  const codes = new Map<string, number>();
  for (const r of by('error-code')) { const c = String(r.errorCode); codes.set(c, (codes.get(c) ?? 0) + 1); }
  if (codes.size) console.error(`  codes: ${[...codes].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}×${n}`).join(', ')}`);
  console.error(`  ${by('no-workflow').length} do not serve open scheduling`);
  console.error(`  ${by('unreachable').length} unreachable`);
  const statuses = new Map<number, number>();
  for (const r of refused) statuses.set(r.status ?? 0, (statuses.get(r.status ?? 0) ?? 0) + 1);
  if (statuses.size) console.error(`  refusal statuses: ${[...statuses].map(([s, n]) => `${s}×${n}`).join(', ')}`);
  if (outFile) console.error(`\nFull results: ${outFile}`);
}

if (import.meta.main) await main();
