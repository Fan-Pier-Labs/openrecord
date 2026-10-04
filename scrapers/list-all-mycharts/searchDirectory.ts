/**
 * Searching the MyChart directory by name — the lookup every client needs
 * before it has an account to log into.
 *
 * The directory is ~1,400 instances; a person typing "uchealth" wants five.
 * This module is the ranking, and the list it ranks, in one place, because it used to exist twice: the Claude Desktop
 * extension shipped its own `instances.ts` searching only the bundled seed,
 * and the mobile app has its own picker search over the same list. Neither was
 * reachable from the CLI or the npm library, so "find my health system" was a
 * thing two clients could do and two could not.
 *
 * ## Which list
 *
 * A search reads two lists merged ({@link withManualEntries}): the output of
 * the deterministic refresh that writes `mychart-instances.json` — Epic's
 * directory, every login URL checked — and the hand-kept
 * `mychart-instances-manual.json`. Until a newer run exists, the first is the
 * checked-in file from the last release, and the result says
 * `source: 'bundled'`. A long-running client (the Claude Desktop extension,
 * the iOS app) reruns the refresh about monthly with
 * {@link refreshMyChartDirectory}, in the background — it is minutes of
 * requests, never part of a search — and from then on searches say
 * `source: 'refreshed'`, with when.
 *
 * ## The sandbox entry
 *
 * {@link SANDBOX_INSTANCE} is the deployed fake-mychart, so anyone can walk
 * the whole connect flow against Homer Simpson's fictional record without a
 * real Epic account. It is never a default suggestion — it only appears when
 * the query matches it — and its "(test)" suffix is there so nobody mistakes
 * it for a health system.
 *
 * The sandbox is a single small deployment that gets torn down whenever its
 * bill outweighs its use, so a search that matches it probes it first and
 * carries {@link SANDBOX_UNAVAILABLE_NOTE} on the match when it is down. A
 * client offering a dead sandbox sends someone through the whole connect flow
 * to a login that can never succeed, which is exactly how it was reported.
 */

import { scraperFetch } from '../http';
import { listMyCharts, toSeedEntry, withManualEntries, type MyChartInstanceSeed } from './directory';
import { fetchResolvedMyChartDirectory } from './refreshDirectory';

/**
 * How often a long-running client reruns the refresh. Epic's list changes by a
 * few entries a month, and a run is a few thousand requests.
 */
export const DIRECTORY_REFRESH_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;

/** How many matches a search returns when the caller names no limit. */
export const DEFAULT_DIRECTORY_SEARCH_LIMIT = 10;

/** The most a single search will return. */
export const MAX_DIRECTORY_SEARCH_LIMIT = 50;

// A banner-shaped logo for the sandbox entry, matching the ~640x230 aspect of
// Epic's real ones so it renders consistently in a picker. Inlined as a data
// URI so it needs no network. `encodeURIComponent` rather than base64 because
// this module loads in React Native and in a browser, neither of which has
// `Buffer`.
const SANDBOX_LOGO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 110">' +
  '<rect x="6" y="18" width="74" height="74" rx="14" fill="#0d9488"/>' +
  '<rect x="35" y="33" width="16" height="44" rx="3" fill="#ffffff"/>' +
  '<rect x="21" y="47" width="44" height="16" rx="3" fill="#ffffff"/>' +
  '<text x="94" y="50" font-family="Helvetica,Arial,sans-serif" font-size="30" font-weight="700" fill="#1e3a8a">Springfield</text>' +
  '<text x="94" y="84" font-family="Helvetica,Arial,sans-serif" font-size="22" font-weight="600" fill="#0d9488">General Hospital</text>' +
  '</svg>';

/**
 * The deployed fake-mychart, offered as if it were a health system so the
 * connect flow can be exercised end to end. Credentials are `homer` /
 * `donuts123` (`marge` for the 2FA path).
 */
export const SANDBOX_INSTANCE: MyChartInstanceSeed = {
  name: 'Springfield General Hospital (test)',
  url: 'https://fake-mychart.fanpierlabs.com/MyChart/',
  logoUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(SANDBOX_LOGO_SVG)}`,
  slgId: 'fake-mychart',
  aliases: ['test', 'demo', 'sandbox', 'fake-mychart'],
};

/** What a client shows in place of the sandbox entry when it isn't serving. */
export const SANDBOX_UNAVAILABLE_NOTE =
  'The test sandbox is currently down, so it cannot be used to connect an account. Email ryan@fanpierlabs.com to ask for it to be brought back up.';

/** How long one reachability answer is reused before the next probe. */
const SANDBOX_PROBE_TTL_MS = 60_000;

/** A probe that hasn't answered in this long counts as down. */
const SANDBOX_PROBE_TIMEOUT_MS = 4_000;

let sandboxProbe: { at: number; up: Promise<boolean> } | null = null;

/** Drop the cached reachability answer. For tests. */
export function clearSandboxAvailabilityCache(): void {
  sandboxProbe = null;
}

function isMyChartRedirect(response: Response): boolean {
  if (response.status < 300 || response.status >= 400) return false;
  const location = response.headers.get('Location');
  if (!location) return false;
  try {
    return new URL(location, SANDBOX_INSTANCE.url).pathname.toLowerCase().startsWith('/mychart');
  } catch {
    return false;
  }
}

async function probeSandbox(): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // `scraperFetch` owns its own two-minute deadline and won't take a shorter
    // one, so race it instead: nobody typing into a picker waits two minutes
    // to be told the sandbox is gone. The losing fetch keeps running and holds
    // one of this host's permits until it settles — harmless for a host nothing
    // else talks to, so don't copy this for a real one.
    const answered = await Promise.race([
      scraperFetch(SANDBOX_INSTANCE.url, { redirect: 'manual' }, { cookieJar: null }),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), SANDBOX_PROBE_TIMEOUT_MS);
      }),
    ]);
    // Serving means answering the way MyChart does: a redirect that stays under
    // the mount (`/MyChart/` → `/MyChart` → the login page). A parked domain
    // answering 200, a redirect elsewhere, a 5xx, a DNS failure (what a
    // torn-down deployment gives) or no answer at all is down.
    return answered !== null && isMyChartRedirect(answered);
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Whether the fake-mychart sandbox is serving right now.
 *
 * Cached for {@link SANDBOX_PROBE_TTL_MS} and shared between concurrent
 * callers, so a picker firing a search per keystroke probes it about once.
 */
export function isSandboxAvailable(): Promise<boolean> {
  if (sandboxProbe && Date.now() - sandboxProbe.at < SANDBOX_PROBE_TTL_MS) return sandboxProbe.up;
  const probe = { at: Date.now(), up: probeSandbox() };
  sandboxProbe = probe;
  return probe.up;
}

/** One search hit, in the shape a picker or a model consumes. */
export interface MyChartDirectoryMatch {
  /** The portal's hostname — what every client keys an account on. */
  hostname: string;
  /** Display name, e.g. "UCHealth". */
  name: string;
  /** Absolute logo URL (or a data URI, for the sandbox entry). */
  logoUrl: string;
  /** The portal's login URL. */
  loginUrl: string;
  /** Epic's directory id. Survives a rename; the name doesn't. */
  slgId: string;
  /** Other names the same organization is searched by. */
  aliases: string[];
  /**
   * Why this entry can't be connected right now, when it can't. Only the
   * sandbox entry ever carries it; a client shows the entry disabled with this
   * text rather than dropping it, so "where did the test hospital go?" has an
   * answer.
   */
  unavailable?: string;
}

/** Which list answered a search. */
export type MyChartDirectorySource = 'refreshed' | 'bundled';

export interface MyChartDirectorySearchResult {
  /** The query as the caller wrote it. */
  query: string;
  source: MyChartDirectorySource;
  /** When the refresh that answered ran (ISO 8601), for `source: 'refreshed'`. */
  refreshedAt?: string;
  count: number;
  matches: MyChartDirectoryMatch[];
}

export interface MyChartDirectorySearchOptions {
  /** 1–{@link MAX_DIRECTORY_SEARCH_LIMIT}; defaults to 10. */
  limit?: number | undefined;
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function toMatch(instance: MyChartInstanceSeed): MyChartDirectoryMatch {
  return {
    hostname: hostnameOf(instance.url),
    name: instance.name,
    logoUrl: instance.logoUrl,
    loginUrl: instance.url,
    slgId: instance.slgId,
    aliases: instance.aliases,
  };
}

// ── The refreshed list ─────────────────────────────────────────────────────

/** The last refresh's list merged with the hand-kept entries, and when it ran; null until one. */
let refreshed: { entries: MyChartInstanceSeed[]; at: string } | null = null;

/** Search the checked-in list again, as before any refresh. For tests. */
export function clearDirectoryCache(): void {
  refreshed = null;
}

/**
 * Search a list a refresh produced — this process's, or one a client saved
 * from an earlier run — instead of the checked-in one. `refreshedAt` is when
 * that refresh ran; searches report it.
 */
export function useRefreshedMyCharts(entries: readonly MyChartInstanceSeed[], refreshedAt: string): void {
  refreshed = { entries: withManualEntries(entries), at: refreshedAt };
}

/**
 * Rerun the refresh that writes `mychart-instances.json` — fetch Epic's
 * directory, check every login URL — and search its result from now on.
 * Returns that result (before the hand-kept entries are merged in) for the
 * caller to save. Minutes of requests: run it in the background.
 */
export async function refreshMyChartDirectory(
  directory: { directoryUrl?: string; mediaBase?: string } = {},
): Promise<MyChartInstanceSeed[]> {
  const { instances } = await fetchResolvedMyChartDirectory(undefined, directory);
  const entries = instances.map(toSeedEntry);
  useRefreshedMyCharts(entries, new Date().toISOString());
  return entries;
}

// ── Ranking ────────────────────────────────────────────────────────────────

/**
 * Rank the instances matching `query`, best first.
 *
 * Exact name, then a name that starts with the query, then a name containing
 * it, then an alias, then the hostname or one of its extra hostnames. The order is what makes "mercy" put
 * "Mercy" itself above the thirty organizations with "Mercy" in the middle of
 * their name; a plain `filter` returned them in directory order, which is
 * alphabetical and therefore arbitrary.
 *
 * Exported for the clients that already hold the list (the mobile picker
 * renders from its own cache) and to keep the ranking testable without a
 * transport.
 */
export function rankDirectoryMatches(
  instances: readonly MyChartInstanceSeed[],
  query: string,
  limit: number = DEFAULT_DIRECTORY_SEARCH_LIMIT,
): MyChartDirectoryMatch[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const exact: MyChartDirectoryMatch[] = [];
  const startsWith: MyChartDirectoryMatch[] = [];
  const nameIncludes: MyChartDirectoryMatch[] = [];
  const aliasIncludes: MyChartDirectoryMatch[] = [];
  const hostnameIncludes: MyChartDirectoryMatch[] = [];

  for (const instance of instances) {
    const match = toMatch(instance);
    const name = match.name.toLowerCase();
    if (name === q) exact.push(match);
    else if (name.startsWith(q)) startsWith.push(match);
    else if (name.includes(q)) nameIncludes.push(match);
    else if (match.aliases.some((alias) => alias.toLowerCase().includes(q))) aliasIncludes.push(match);
    else if ([match.hostname, ...(instance.extraHosts ?? [])].some((host) => host.includes(q))) {
      hostnameIncludes.push(match);
    }
  }

  return [...exact, ...startsWith, ...nameIncludes, ...aliasIncludes, ...hostnameIncludes].slice(
    0,
    Math.max(1, limit),
  );
}

/**
 * Find the MyChart instances whose name, alias or hostname matches `query`.
 *
 * Reads the last refresh's list, or the checked-in one until there is one; the
 * result says which. Makes no request, except to check the sandbox entry when
 * the query turns it up. The result
 * says which one answered, because "your health system isn't listed" means
 * something different depending on whether the list was six months old.
 *
 * The {@link SANDBOX_INSTANCE} is searched alongside the real ones, and is
 * listed first so a query naming it outranks any real "Springfield…" match.
 * When a search turns it up, its reachability is probed and a match that
 * isn't serving comes back carrying {@link SANDBOX_UNAVAILABLE_NOTE}.
 */
export async function searchMyChartDirectory(
  query: string,
  options: MyChartDirectorySearchOptions = {},
): Promise<MyChartDirectorySearchResult> {
  const text = query.trim();
  if (!text) {
    throw new Error('Pass a query — a few letters of the health system name.');
  }
  const limit = Math.min(
    MAX_DIRECTORY_SEARCH_LIMIT,
    Math.max(1, Math.floor(options.limit ?? DEFAULT_DIRECTORY_SEARCH_LIMIT)),
  );

  const instances = refreshed?.entries ?? listMyCharts();

  const matches = rankDirectoryMatches([SANDBOX_INSTANCE, ...instances], text, limit);

  // Only pay for the probe when the query actually turned up the sandbox,
  // which almost no real search does.
  const sandbox = matches.find((match) => match.slgId === SANDBOX_INSTANCE.slgId);
  if (sandbox && !(await isSandboxAvailable())) sandbox.unavailable = SANDBOX_UNAVAILABLE_NOTE;

  return refreshed
    ? { query: text, source: 'refreshed', refreshedAt: refreshed.at, count: matches.length, matches }
    : { query: text, source: 'bundled', count: matches.length, matches };
}
