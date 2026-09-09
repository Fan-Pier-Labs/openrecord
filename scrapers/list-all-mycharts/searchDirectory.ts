/**
 * Searching the MyChart directory by name — the lookup every client needs
 * before it has an account to log into.
 *
 * {@link fetchMyChartDirectory} returns all ~1400 instances; a person typing
 * "uchealth" wants five. This module is the ranking and the caching around
 * that fetch, in one place, because it used to exist twice: the Claude Desktop
 * extension shipped its own `instances.ts` searching only the bundled seed,
 * and the mobile app has its own picker search over the same list. Neither was
 * reachable from the CLI or the npm library, so "find my health system" was a
 * thing two clients could do and two could not.
 *
 * ## Live first, seed second
 *
 * The live directory is authoritative: new health systems come online between
 * releases, and a patient whose provider is missing from a months-old snapshot
 * has no way to connect. So a search fetches Epic's directory, caches it for
 * {@link DIRECTORY_CACHE_TTL_MS}, and searches that.
 *
 * When the fetch fails — offline, blocked by a corporate proxy, Epic down —
 * the checked-in `mychart-instances.json` answers instead, and the result says
 * `source: 'bundled'` rather than pretending the live list was consulted. That
 * is what the extension's setup wizard relied on before this existed, and
 * losing it would break the picker exactly when someone is troubleshooting a
 * connection.
 *
 * ## The sandbox entry
 *
 * {@link SANDBOX_INSTANCE} is the deployed fake-mychart, so anyone can walk
 * the whole connect flow against Homer Simpson's fictional record without a
 * real Epic account. It is never a default suggestion — it only appears when
 * the query matches it — and its "(test)" suffix is there so nobody mistakes
 * it for a health system.
 */

import {
  fetchMyChartDirectory,
  type MyChartInstance,
  type MyChartInstanceSeed,
} from './directory';
import bundledInstances from './mychart-instances.json';

/** How long a fetched directory is reused before the next search refetches it. */
export const DIRECTORY_CACHE_TTL_MS = 60 * 60 * 1000;

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
}

/** Which list answered a search. */
export type MyChartDirectorySource = 'live' | 'bundled';

export interface MyChartDirectorySearchResult {
  /** The query as the caller wrote it. */
  query: string;
  source: MyChartDirectorySource;
  count: number;
  matches: MyChartDirectoryMatch[];
}

export interface MyChartDirectorySearchOptions {
  /** 1–{@link MAX_DIRECTORY_SEARCH_LIMIT}; defaults to 10. */
  limit?: number | undefined;
  /** Where the directory lives. Defaults to Epic's; fake-mychart serves it too. */
  directoryUrl?: string | undefined;
  /** Where the directory's images live. Moves with `directoryUrl`. */
  mediaBase?: string | undefined;
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

// ── The cached live directory ──────────────────────────────────────────────

let cached: { at: number; instances: MyChartInstance[] } | null = null;
/** The fetch currently in flight, so N searches in a row make one request. */
let inFlight: Promise<MyChartInstance[]> | null = null;

/**
 * Drop the cached directory. For tests, and for a client that knows the list
 * has changed under it.
 */
export function clearDirectoryCache(): void {
  cached = null;
  inFlight = null;
}

async function liveDirectory(
  options: MyChartDirectorySearchOptions,
): Promise<MyChartInstance[]> {
  if (cached && Date.now() - cached.at < DIRECTORY_CACHE_TTL_MS) return cached.instances;
  if (inFlight) return inFlight;

  const fetchOptions: { directoryUrl?: string; mediaBase?: string } = {};
  if (options.directoryUrl !== undefined) fetchOptions.directoryUrl = options.directoryUrl;
  if (options.mediaBase !== undefined) fetchOptions.mediaBase = options.mediaBase;

  inFlight = fetchMyChartDirectory(fetchOptions)
    .then((instances) => {
      cached = { at: Date.now(), instances };
      return instances;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

// ── Ranking ────────────────────────────────────────────────────────────────

/**
 * Rank the instances matching `query`, best first.
 *
 * Exact name, then a name that starts with the query, then a name containing
 * it, then an alias, then the hostname. The order is what makes "mercy" put
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
    else if (match.hostname.includes(q)) hostnameIncludes.push(match);
  }

  return [...exact, ...startsWith, ...nameIncludes, ...aliasIncludes, ...hostnameIncludes].slice(
    0,
    Math.max(1, limit),
  );
}

/**
 * Find the MyChart instances whose name, alias or hostname matches `query`.
 *
 * Live directory first, the bundled seed when that fetch fails. The result
 * says which one answered, because "your health system isn't listed" means
 * something different depending on whether the list was six months old.
 *
 * The {@link SANDBOX_INSTANCE} is searched alongside the real ones, and is
 * listed first so a query naming it outranks any real "Springfield…" match.
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

  let source: MyChartDirectorySource = 'live';
  let instances: MyChartInstanceSeed[];
  try {
    instances = await liveDirectory(options);
  } catch {
    // Offline, blocked, or Epic is down. The seed is a real answer, just an
    // older one — and the caller is told which it got.
    source = 'bundled';
    instances = bundledInstances;
  }

  const matches = rankDirectoryMatches([SANDBOX_INSTANCE, ...instances], text, limit);
  return { query: text, source, count: matches.length, matches };
}
