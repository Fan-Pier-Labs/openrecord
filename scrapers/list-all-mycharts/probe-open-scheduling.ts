/**
 * Asks every MyChart instance in the directory whether it exposes the
 * anonymous "Find a Doctor" workflow, and how big a directory it publishes.
 *
 * The provider-directory scraper (`scrapers/myChart/prelogin/providerDirectory.ts`)
 * was built against five instances. Five is enough to learn the protocol and
 * nowhere near enough to know how many orgs actually turn the feature on, or
 * which of the "off" answers are the same thing wearing different clothes.
 * This harness asks all ~750.
 *
 * Nothing here submits a credential, and nothing here crawls a specialty. Each
 * host gets mount discovery, one GET of `/OpenScheduling`, and one
 * `GetSchedulingWorkflowData` POST — the cheap call that returns the specialty
 * list and the feature flags. The 0.6–2 MB `GetSpecialtyData` payloads are
 * deliberately not fetched: the question is who offers the workflow, not what
 * is in it, and 750 hosts × 20 specialties would be tens of gigabytes.
 *
 * Usage:
 *   bun scrapers/list-all-mycharts/probe-open-scheduling.ts [--out results.jsonl] [--concurrency 24] [--limit 50]
 *   bun scrapers/list-all-mycharts/probe-open-scheduling.ts --hosts mychart.foo.org --verbose
 */

import { determineFirstPathPart } from '../myChart/auth/login';
import { fetchSchedulingWorkflow, parseFeatures, parseSpecialties } from '../myChart/prelogin/providerDirectory';
import { PreloginEndpointError } from '../myChart/prelogin/preloginSession';
import { timeBoundedRequest, type HostEntry } from './probe-mount-discovery';
import { parseProbeArgs, runProbe } from './probeRunner';
import { logger } from '../../shared/logger';

const HOST_TIMEOUT_MS = 90_000;

/**
 * Why a host did not answer with a specialty list.
 *
 * `refused` and `no-token` are both "the org has open scheduling switched off",
 * arrived at from opposite ends: `no-token` means `/OpenScheduling` bounced to
 * a page that issues no antiforgery token at all, `refused` means the page
 * rendered but the endpoint behind it said no. Kept apart because they are the
 * two distinguishable shapes of "off", and collapsing them would hide a change
 * in either one.
 */
export type OpenSchedulingOutcome =
  | 'workflow' // returned a specialty list
  | 'empty' // returned JSON, zero specialties
  | 'refused' // the POST was rejected — feature off, or shape changed
  | 'no-token' // the page issued no antiforgery token
  | 'unreachable'; // discovery or the page GET failed

export type SchedulingProbeResult = {
  host: string;
  names: string[];
  outcome: OpenSchedulingOutcome;
  /** Where discovery ended up; a host can redirect to a different deployment. */
  foundHost?: string;
  mount?: string | null;
  specialtyCount?: number;
  specialties?: string[];
  organizationName?: string | null;
  features?: ReturnType<typeof parseFeatures>;
  /** HTTP status behind a `refused`, when there was one. */
  status?: number;
  error?: string;
  ms?: number;
};

/**
 * Sort one host's answer into an outcome.
 *
 * Split out from the network call so the classification is testable: every
 * branch here is a shape a real instance returned during the sweep.
 */
export function classifyError(e: unknown): { outcome: OpenSchedulingOutcome; status?: number; error: string } {
  const message = String((e as Error)?.message ?? e).slice(0, 300);
  if (e instanceof PreloginEndpointError) {
    // status 0 is `postForm`'s "there was no token to send".
    return { outcome: e.status === 0 ? 'no-token' : 'refused', status: e.status, error: message };
  }
  return { outcome: 'unreachable', error: message };
}

export async function probeHost(entry: HostEntry): Promise<SchedulingProbeResult> {
  const started = Date.now();
  const result: SchedulingProbeResult = { host: entry.host, names: entry.names, outcome: 'unreachable' };
  try {
    const req = timeBoundedRequest(entry.host);
    await Promise.race([
      determineFirstPathPart(req),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('host timed out')), HOST_TIMEOUT_MS);
      }),
    ]);
    result.foundHost = req.hostname;
    result.mount = req.firstPathPart;

    const { data } = await fetchSchedulingWorkflow(req);
    const specialties = parseSpecialties(data);
    result.outcome = specialties.length > 0 ? 'workflow' : 'empty';
    result.specialtyCount = specialties.length;
    result.specialties = specialties.map((s) => s.name);
    result.organizationName = data.HomeOrganizationName?.trim() || null;
    result.features = parseFeatures(data);
  } catch (e) {
    Object.assign(result, classifyError(e));
  }
  result.ms = Date.now() - started;
  return result;
}

function summarize(results: SchedulingProbeResult[]): string[] {
  const by = (o: OpenSchedulingOutcome) => results.filter((r) => r.outcome === o);
  const live = by('workflow');
  const counts = live.map((r) => r.specialtyCount ?? 0).sort((a, b) => a - b);
  const median = counts.length ? counts[Math.floor(counts.length / 2)] : 0;
  const total = counts.reduce((a, b) => a + b, 0);

  const lines = [
    '',
    `${live.length}/${results.length} hosts serve the anonymous scheduling directory ` +
      `(${((live.length / results.length) * 100).toFixed(1)}%)`,
    `  ${by('empty').length} answered the endpoint but list zero specialties`,
    `  ${by('refused').length} refused the call (feature off)`,
    `  ${by('no-token').length} served no antiforgery token (workflow not mounted)`,
    `  ${by('unreachable').length} unreachable or not standard MyChart`,
    '',
    `Specialties on the ${live.length} live hosts: ${total} total, median ${median}, max ${counts.at(-1) ?? 0}`,
  ];

  const flag = (name: string, pick: (r: SchedulingProbeResult) => boolean | undefined) =>
    `  ${name.padEnd(22)} ${live.filter(pick).length}/${live.length}`;
  lines.push('', 'Feature flags across the live hosts:');
  lines.push(flag('self signup', (r) => r.features?.selfSignup));
  lines.push(flag('schedule as guest', (r) => r.features?.scheduleAsGuest));
  lines.push(flag('on my way', (r) => r.features?.onMyWay));
  lines.push(flag('on-demand video', (r) => r.features?.onDemandVideoVisits));

  lines.push('', 'Largest directories:');
  for (const r of [...live].sort((a, b) => (b.specialtyCount ?? 0) - (a.specialtyCount ?? 0)).slice(0, 15)) {
    lines.push(`  ${String(r.specialtyCount).padStart(3)} specialties  ${r.host}`);
  }
  return lines;
}

async function main() {
  const args = parseProbeArgs(process.argv.slice(2));
  const results = await runProbe(args, probeHost, 'hosts for anonymous scheduling');
  console.error(summarize(results).join('\n'));
  logger.debug('scheduling probe complete');
}

if (import.meta.main) {
  await main();
}
