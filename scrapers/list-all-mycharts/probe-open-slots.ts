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

import { determineFirstPathPart } from '../myChart/auth/login';
import { fetchOpenSlots } from '../myChart/prelogin/openSlots';
import { PreloginEndpointError } from '../myChart/prelogin/preloginSession';
import { NoSchedulingSelectionError } from '../myChart/prelogin/schedulingContext';
import { timeBoundedRequest, type HostEntry } from './probe-mount-discovery';
import { parseProbeArgs, runProbe } from './probeRunner';

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
    // walk means the host never had the workflow to begin with. Keyed on the
    // path rather than the message, which is prose and gets reworded.
    const outcome = e.path.endsWith('GetSlots') ? 'refused' : 'no-workflow';
    return { outcome, status: e.status, error };
  }
  if (e instanceof NoSchedulingSelectionError) return { outcome: 'no-workflow', error };
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
  const args = parseProbeArgs(process.argv.slice(2));
  const results = await runProbe(args, probeHost, 'hosts for GetSlots');

  const by = (o: SlotProbeOutcome) => results.filter((r) => r.outcome === o);
  const ran = by('slots').length + by('no-slots').length + by('error-code').length;
  const refused = by('refused');
  console.error(`\nGetSlots accepted on ${ran}/${results.length} hosts (${by('slots').length} returned slots)`);
  console.error(`  ${by('error-code').length} answered with an ErrorCode`);
  console.error(`  ${refused.length} refused the search`);
  console.error(`  ${by('no-workflow').length} do not serve open scheduling`);
  console.error(`  ${by('unreachable').length} unreachable`);

  const codes = new Map<string, number>();
  for (const r of by('error-code')) {
    const code = String(r.errorCode);
    codes.set(code, (codes.get(code) ?? 0) + 1);
  }
  if (codes.size) {
    console.error(`  codes: ${[...codes].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}×${n}`).join(', ')}`);
  }
  const statuses = new Map<number, number>();
  for (const r of refused) statuses.set(r.status ?? 0, (statuses.get(r.status ?? 0) ?? 0) + 1);
  if (statuses.size) console.error(`  refusal statuses: ${[...statuses].map(([s, n]) => `${s}×${n}`).join(', ')}`);
}

if (import.meta.main) await main();
