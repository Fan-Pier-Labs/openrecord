/**
 * Asks every MyChart instance in the directory which Epic release it is running.
 *
 * `fake-mychart` models two releases — November 2025 and August 2025 — because
 * those are what the three captured organizations were on. Two is what we
 * captured, not what exists, and a behaviour we treat as "the current shape"
 * because both captures agree may be neither the majority nor the newest thing
 * a patient is actually pointed at. This sweep answers that with the whole
 * directory instead of three hosts.
 *
 * Nothing here submits a credential. Both halves are requests an anonymous
 * browser makes: Epic's own published endpoint list, and each portal's login
 * page.
 *
 * Two sources, because neither alone covers the directory:
 *
 *   1. **Epic's FHIR endpoint list** names the release outright — every Epic
 *      FHIR server answers an unauthenticated `metadata` with
 *      `software: { name: "Epic", version: "November 2025" }`. It is the
 *      ground truth, and it covers only the ~480 organizations that publish an
 *      endpoint, under a name that has to be matched back to the portal.
 *   2. **The login page's `core-4-header` bundle hash** covers every host but
 *      names nothing: `?v=` is a content hash of an Epic-shipped bundle, so
 *      hosts on one release share one hash, and which release that is has to
 *      be learned.
 *
 * So the sweep learns (2) from (1) — the hash table is built from the hosts
 * where both agree on an organization, then applied to the rest. Nothing is
 * checked in: a table of build hashes goes stale the week Epic ships, and a
 * stale table would answer confidently and wrongly.
 *
 * Usage:
 *   bun scrapers/list-all-mycharts/probes/probe-epic-version.ts [--out results.jsonl] [--concurrency 24] [--limit 50]
 *   bun scrapers/list-all-mycharts/probes/probe-epic-version.ts --hosts mychart.foo.org --verbose
 *
 * `--out` receives each host's raw row as it arrives, so a long sweep is
 * resumable; the release columns are derived once the sweep has finished and
 * appear in the printed summary.
 */

import { determineFirstPathPart } from '../../myChart/auth/login';
import { platformFetch } from '../../http';
import { timeBoundedRequest, type HostEntry } from './probe-mount-discovery';
import { parseProbeArgs, runProbe } from './probeRunner';
import { logger } from '../../../shared/logger';

const HOST_TIMEOUT_MS = 90_000;
const FHIR_TIMEOUT_MS = 25_000;
const FHIR_CONCURRENCY = 24;

/** Epic's own list of the FHIR endpoints its customers have published. */
const EPIC_ENDPOINT_DIRECTORY_URL = 'https://open.epic.com/Endpoints/R4';

/**
 * A CapabilityStatement is megabytes of resource declarations and `software`
 * is in the first few hundred bytes, so the sweep reads a prefix and stops.
 */
const CAPABILITY_STATEMENT_PREFIX_BYTES = 3000;

export type VersionProbeResult = {
  host: string;
  names: string[];
  /** Where discovery ended up; a host can redirect to a different deployment. */
  foundHost?: string;
  mount?: string | null;
  /** The `core-4-header` bundle hash — one value per Epic build. */
  buildHash?: string;
  /** The release that hash was learned to mean, when it could be learned. */
  release?: string;
  /** Set when this host's own organization publishes a FHIR endpoint. */
  namedRelease?: string;
  error?: string;
  ms?: number;
};

export type NamedRelease = { organization: string; endpoint: string; release: string };

/**
 * The release out of a CapabilityStatement prefix.
 *
 * Matched inside `software` rather than on a bare `"version"`, which also
 * appears in `fhirVersion`, in `instantiates` profile URLs and in most
 * `SearchParameter` declarations further down the document.
 */
export function parseSoftwareVersion(capabilityStatementPrefix: string): string | null {
  const software = /"software"\s*:\s*\{([^}]*)\}/.exec(capabilityStatementPrefix)?.[1];
  if (!software) return null;
  return /"version"\s*:\s*"([^"]+)"/.exec(software)?.[1] ?? null;
}

/**
 * The build fingerprint on a MyChart page.
 *
 * `core-4-header` is the bundle whose hash tracks the release most cleanly of
 * the ones every page carries: the per-file `?v=` hashes (`common.css`,
 * `override.css`) are near-unique per host because they compile in the org's
 * own theme, and the locale bundles (`core-2-en-us`) split the same release
 * across locales. This one is org-independent and locale-independent.
 */
export function parseBuildHash(html: string): string | null {
  return /\/bundles\/core-4-header\?v=([^"'&]+)/i.exec(html)?.[1] ?? null;
}

/**
 * Fold an organization name to something two directories can match on.
 *
 * Epic's endpoint list and Epic's portal directory name the same health system
 * differently often enough ("Foo Health System" vs "Foo Health"), and the
 * words they differ on are the generic ones, so those come out.
 */
export function normalizeOrganizationName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(health|healthcare|health care|system|systems|medical|center|centre|clinic|hospital|inc|the|of|and|llc|group)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '');
}

async function fetchCapabilityStatementPrefix(endpoint: string): Promise<string> {
  const url = endpoint.replace(/\/+$/, '') + '/metadata';
  const response = await platformFetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FHIR_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const reader = response.body?.getReader();
  if (!reader) return (await response.text()).slice(0, CAPABILITY_STATEMENT_PREFIX_BYTES);
  const { value } = await reader.read();
  await reader.cancel();
  return new TextDecoder().decode(value).slice(0, CAPABILITY_STATEMENT_PREFIX_BYTES);
}

/** Every organization in Epic's endpoint list, with the release it answers. */
export async function fetchNamedReleases(): Promise<NamedRelease[]> {
  const bundle = (await (
    await platformFetch(EPIC_ENDPOINT_DIRECTORY_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(FHIR_TIMEOUT_MS),
    })
  ).json()) as { entry?: { resource?: { name?: string; address?: string } }[] };

  const endpoints = (bundle.entry ?? [])
    .map((e) => e.resource)
    .filter((r): r is { name: string; address: string } => Boolean(r?.name && r?.address));
  console.error(`Reading ${endpoints.length} published Epic FHIR endpoints…`);

  const found: NamedRelease[] = [];
  const queue = [...endpoints];
  await Promise.all(
    Array.from({ length: FHIR_CONCURRENCY }, async () => {
      while (queue.length) {
        const endpoint = queue.shift();
        if (!endpoint) break;
        try {
          const release = parseSoftwareVersion(await fetchCapabilityStatementPrefix(endpoint.address));
          if (release) found.push({ organization: endpoint.name, endpoint: endpoint.address, release });
        } catch {
          // An org that has moved, retired or firewalled its endpoint tells us
          // nothing about its portal. The portal sweep still covers it.
        }
      }
    }),
  );
  console.error(`  ${found.length}/${endpoints.length} named a release`);
  return found;
}

export async function probeHost(entry: HostEntry): Promise<VersionProbeResult> {
  const started = Date.now();
  const result: VersionProbeResult = { host: entry.host, names: entry.names };
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

    const mount = req.firstPathPart ? `/${req.firstPathPart}` : '';
    const response = await req.makeRequest({ url: `https://${req.hostname}${mount}/Authentication/Login` });
    const hash = parseBuildHash(await response.text());
    if (hash) result.buildHash = hash;
    else result.error = `no build hash (HTTP ${response.status})`;
  } catch (e) {
    result.error = String((e as Error)?.message ?? e).slice(0, 300);
  }
  result.ms = Date.now() - started;
  return result;
}

/**
 * What each build hash turned out to mean, learned from the hosts whose
 * organization publishes a FHIR endpoint.
 *
 * A hash maps to the release the most of its hosts reported. The vote matters:
 * a handful of organizations share a name with an unrelated one, and a
 * Community Connect portal is hosted on its host system's Epic instance while
 * its FHIR endpoint points at its own — either way a single host would
 * mislabel a whole build.
 */
export function learnBuildHashes(results: VersionProbeResult[]): Map<string, string> {
  const votes = new Map<string, Map<string, number>>();
  for (const r of results) {
    if (!r.buildHash || !r.namedRelease) continue;
    const byRelease = votes.get(r.buildHash) ?? new Map<string, number>();
    byRelease.set(r.namedRelease, (byRelease.get(r.namedRelease) ?? 0) + 1);
    votes.set(r.buildHash, byRelease);
  }
  const table = new Map<string, string>();
  for (const [hash, byRelease] of votes) {
    const winner = [...byRelease].sort((a, b) => b[1] - a[1])[0];
    if (winner) table.set(hash, winner[0]);
  }
  return table;
}

/** Newest release first — "November 2025" sorts before "August 2025". */
export function compareReleases(a: string, b: string): number {
  const parse = (s: string) => {
    const m = /^(\w+)\s+(\d{4})$/.exec(s);
    const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    return m?.[1] && m[2] ? Number(m[2]) * 100 + months.indexOf(m[1].toLowerCase()) : -1;
  };
  return parse(b) - parse(a);
}

function summarize(results: VersionProbeResult[], named: NamedRelease[], table: Map<string, string>): string[] {
  const lines: string[] = [''];

  const byRelease = new Map<string, number>();
  for (const n of named) byRelease.set(n.release, (byRelease.get(n.release) ?? 0) + 1);
  lines.push(`Epic releases named outright by ${named.length} published FHIR endpoints:`);
  for (const [release, count] of [...byRelease].sort((a, b) => compareReleases(a[0], b[0]))) {
    lines.push(`  ${String(count).padStart(4)}  ${release}`);
  }

  const classified = results.filter((r) => r.release);
  const unknown = results.filter((r) => r.buildHash && !r.release);
  lines.push(
    '',
    `Portal directory: ${classified.length}/${results.length} hosts classified ` +
      `from ${table.size} distinct build hashes`,
  );
  const portal = new Map<string, number>();
  for (const r of classified) portal.set(r.release ?? '', (portal.get(r.release ?? '') ?? 0) + 1);
  for (const [release, count] of [...portal].sort((a, b) => compareReleases(a[0], b[0]))) {
    lines.push(`  ${String(count).padStart(4)}  ${release}  (${((count / classified.length) * 100).toFixed(1)}%)`);
  }
  lines.push(
    `  ${String(unknown.length).padStart(4)}  build hash seen on no FHIR-anchored host`,
    `  ${String(results.filter((r) => !r.buildHash && !r.release).length).padStart(4)}  unreachable or not standard MyChart`,
  );
  return lines;
}

async function main() {
  const args = parseProbeArgs(process.argv.slice(2));
  const named = await fetchNamedReleases();
  const byOrganization = new Map(named.map((n) => [normalizeOrganizationName(n.organization), n.release]));

  const results = await runProbe(args, probeHost, 'hosts for their Epic release');
  for (const r of results) {
    for (const name of r.names) {
      const release = byOrganization.get(normalizeOrganizationName(name));
      if (release) {
        r.namedRelease = release;
        break;
      }
    }
  }

  const table = learnBuildHashes(results);
  for (const r of results) {
    const release = r.namedRelease ?? (r.buildHash ? table.get(r.buildHash) : undefined);
    if (release) r.release = release;
  }

  console.error(summarize(results, named, table).join('\n'));
  logger.debug('version probe complete');
}

if (import.meta.main) {
  await main();
}
