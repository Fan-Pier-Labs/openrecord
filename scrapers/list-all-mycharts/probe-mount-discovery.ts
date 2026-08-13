/**
 * Runs mount discovery against every MyChart instance in the directory and
 * reports where it gets the answer wrong.
 *
 * This is the harness that found the discovery bugs fixed in PR #213 — MyChart's
 * deployment shapes vary far more than any fixture set captures (relative
 * `DefaultAsp` hops, vanity hostnames that redirect to a different deployment,
 * affiliate chooser pages, scripted redirects), and the only way to know
 * discovery still handles them is to ask all ~750 hosts.
 *
 * Nothing here submits a credential. Every request is one an unauthenticated
 * browser makes just by opening the portal's front door.
 *
 * Two checks per host:
 *
 *   1. does the discovered mount actually serve a MyChart login page?  ← the real test
 *   2. does it agree with the prefix in Epic's published directory URL?
 *
 * (2) is only a cross-check: a host can serve several tenants, and directory
 * entries go stale, so disagreement is a hint rather than a failure.
 *
 * Usage:
 *   bun scrapers/list-all-mycharts/probe-mount-discovery.ts [--out results.jsonl] [--concurrency 24] [--limit 50]
 *   bun scrapers/list-all-mycharts/probe-mount-discovery.ts --hosts mychart.foo.org,bar.org --verbose
 */

import * as fs from 'fs';
import * as path from 'path';
import { determineFirstPathPart, looksLikeLoginPage } from '../myChart/login';
import { MyChartRequest } from '../myChart/myChartRequest';
import { platformFetch } from '../http';
import { logger, setLogSink, silenceLogger } from '../../shared/logger';

const INSTANCES_FILE = path.join(path.dirname(import.meta.path), 'mychart-instances.json');
const REQUEST_TIMEOUT_MS = 20_000;
const HOST_TIMEOUT_MS = 90_000;
const MYCHART_LOGIN_ROUTE = '/authentication/';

export type ProbeResult = {
  host: string;
  /** Every prefix the directory publishes for this host — one per tenant. */
  expected: (string | null)[];
  found?: string | null;
  /** Where discovery ended up, which is not always where it started. */
  foundHost?: string;
  movedHost?: boolean;
  /** Whether the discovered mount serves a login page. */
  works?: boolean;
  status?: number;
  matchesDirectory?: boolean;
  /** Only filled in when discovery and the directory disagree. */
  directoryWorks?: boolean;
  error?: string;
  ms?: number;
};

/**
 * The prefix a URL implies, by the same rule discovery uses: everything before
 * `/Authentication/`, or the first path segment when the URL doesn't name the
 * route. Applied here to the directory's published URL to get an expectation.
 */
export function prefixFromDirectoryUrl(pathname: string): string | null {
  const routeStart = pathname.toLowerCase().indexOf(MYCHART_LOGIN_ROUTE);
  if (routeStart >= 0) return pathname.slice(1, routeStart) || null;
  return pathname.split('/')[1] || null;
}

export type HostEntry = { host: string; expected: (string | null)[]; names: string[] };

/**
 * Collapse the directory to one entry per host. A single host commonly serves
 * many tenants (mychart.ochin.org serves ~190), and discovery from the root can
 * only ever land on one of them — so every published prefix counts as correct.
 */
export function groupByHost(instances: { name: string; url: string }[]): HostEntry[] {
  const byHost = new Map<string, HostEntry>();
  for (const inst of instances) {
    let url: URL;
    try { url = new URL(inst.url); } catch { continue; }
    const entry = byHost.get(url.host) ?? { host: url.host, expected: [], names: [] };
    const prefix = prefixFromDirectoryUrl(url.pathname);
    if (!entry.expected.some(p => (p ?? '').toLowerCase() === (prefix ?? '').toLowerCase())) {
      entry.expected.push(prefix);
    }
    entry.names.push(inst.name);
    byHost.set(url.host, entry);
  }
  return [...byHost.values()];
}

/** A request whose every fetch gives up rather than hanging the whole sweep. */
export function timeBoundedRequest(host: string): MyChartRequest {
  const req = new MyChartRequest(host);
  req.transport = (url, init) =>
    platformFetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  return req;
}

async function servesLoginPage(host: string, prefix: string | null): Promise<{ ok: boolean; status?: number }> {
  const url = `https://${host}${prefix ? '/' + prefix : ''}/Authentication/Login`;
  try {
    const resp = await timeBoundedRequest(host).makeRequest({ url });
    const html = await resp.text();
    return { ok: resp.status < 400 && looksLikeLoginPage(html), status: resp.status };
  } catch {
    return { ok: false };
  }
}

export async function probeHost(entry: HostEntry): Promise<ProbeResult> {
  const started = Date.now();
  const result: ProbeResult = { host: entry.host, expected: entry.expected };
  try {
    const req = timeBoundedRequest(entry.host);
    await Promise.race([
      determineFirstPathPart(req),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('host timed out')), HOST_TIMEOUT_MS)
      }),
    ]);

    result.found = req.firstPathPart;
    result.foundHost = req.hostname;
    result.movedHost = req.hostname !== entry.host;

    const check = await servesLoginPage(req.hostname, req.firstPathPart);
    result.works = check.ok;
    result.status = check.status;

    result.matchesDirectory = entry.expected.some(
      p => (p ?? '').toLowerCase() === (req.firstPathPart ?? '').toLowerCase()
    );
    if (!result.matchesDirectory) {
      result.directoryWorks = (await servesLoginPage(entry.host, entry.expected[0] ?? null)).ok;
    }
  } catch (e) {
    result.error = String((e as Error)?.message ?? e).slice(0, 300);
  }
  result.ms = Date.now() - started;
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };

  const outFile = flag('--out');
  const concurrency = Number(flag('--concurrency') ?? 24);
  const limit = Number(flag('--limit') ?? 0);
  const onlyHosts = flag('--hosts')?.split(',').map(h => h.trim()).filter(Boolean);

  // Discovery is chatty by design; its trace is the useful part of --verbose.
  if (args.includes('--verbose')) setLogSink((level, a) => console.error(`[${level}]`, ...a));
  else silenceLogger();

  const instances: { name: string; url: string }[] = JSON.parse(fs.readFileSync(INSTANCES_FILE, 'utf-8'));
  let entries = groupByHost(instances);
  if (onlyHosts) entries = entries.filter(e => onlyHosts.includes(e.host));
  if (limit) entries = entries.slice(0, limit);

  console.error(`Probing ${entries.length} hosts (concurrency ${concurrency})…`);

  const out = outFile ? fs.createWriteStream(outFile, { flags: 'a' }) : null;
  const results: ProbeResult[] = [];
  const queue = [...entries];
  let done = 0;

  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      const entry = queue.shift();
      if (!entry) break;
      const result = await probeHost(entry);
      results.push(result);
      out?.write(JSON.stringify(result) + '\n');
      if (++done % 25 === 0) console.error(`  ${done}/${entries.length}`);
    }
  }));
  out?.end();

  const working = results.filter(r => r.works);
  const wrong = results.filter(r => !r.works && r.directoryWorks);
  const unreachable = results.filter(r => !r.works && !r.directoryWorks);

  console.error(`\n${working.length}/${results.length} hosts: discovery found a mount that serves a login page`);
  console.error(`${results.filter(r => r.movedHost).length} hosts moved to a different hostname`);
  console.error(`${unreachable.length} hosts unreachable or not standard MyChart (down, bot-blocked, SSO-fronted)`);

  if (wrong.length) {
    console.error(`\n${wrong.length} hosts where the directory's prefix works and ours does not:`);
    for (const r of wrong.sort((a, b) => a.host.localeCompare(b.host))) {
      console.error(`  ${r.host.padEnd(42)} found=${JSON.stringify(r.found)} expected=${JSON.stringify(r.expected[0])}`);
    }
  } else {
    console.error('\nNo host discovery got wrong that the directory gets right.');
  }

  logger.debug('probe complete');
  if (outFile) console.error(`\nFull results: ${outFile}`);
}

if (import.meta.main) {
  await main();
}
