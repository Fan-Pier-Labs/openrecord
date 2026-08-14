/**
 * The list of MyChart instances the picker offers, and their logos.
 *
 * Three layers, in the order they're consulted:
 *
 *  1. **The bundled seed** (`mychart-instances.json`), so a first launch with
 *     no network still shows every provider. It ships with the app and is
 *     refreshed in the repo by `scrapers/list-all-mycharts/fetch-mychart-instances.ts`.
 *  2. **The SQLite cache**, written by the last successful refresh. Read on
 *     boot before any network call, so the list a returning user sees is the
 *     current one immediately rather than after a round trip.
 *  3. **Epic's live directory** (`fetchMyChartDirectory`), fetched in the
 *     background at most once a week. New health systems come online between
 *     app releases; without this the picker is as stale as the last TestFlight
 *     build, and a patient whose provider is missing has no way to connect.
 *
 * Logos are fetched one at a time as rows scroll into view and cached in
 * SQLite as data URIs. Every logo in the directory is served by one host, so
 * `scraperFetch`'s per-host permit paces them — prefetching all ~1400 up front
 * would be 1400 gated requests at Epic for a list the user scrolls past three
 * of.
 */

import { fetchMyChartDirectory, fetchMyChartIcon } from "../../../scrapers/list-all-mycharts/directory";
import type { MyChartInstanceSeed } from "../../../scrapers/list-all-mycharts/directory";
import bundledInstances from "../../../scrapers/list-all-mycharts/mychart-instances.json";
import {
  getCachedDirectory,
  getCachedLogo,
  setCachedDirectory,
  setCachedLogo,
} from "@/lib/storage/database";

export type MyChartInstance = MyChartInstanceSeed;

/** How long a cached list is used before a background refresh is attempted. */
const REFRESH_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

// Demo/test entry pointing at the deployed fake-mychart sandbox. Lets
// users (and developers) try the full flow with Homer Simpson fake data
// without needing real Epic credentials.
const FAKE_MYCHART_DEMO: MyChartInstance = {
  name: "Springfield Medical Center (Demo)",
  url: "https://fake-mychart.fanpierlabs.com/MyChart/",
  logoUrl: "",
  slgId: "fake-mychart",
  aliases: [],
};

const seeded: MyChartInstance[] = [
  FAKE_MYCHART_DEMO,
  ...(bundledInstances as MyChartInstance[]),
];

let instances: MyChartInstance[] = seeded;
/** Bumped whenever `instances` is replaced, so React can re-render on it. */
let revision = 0;
const listeners = new Set<() => void>();

function publish(next: MyChartInstance[]): void {
  instances = [FAKE_MYCHART_DEMO, ...next.filter((i) => i.slgId !== FAKE_MYCHART_DEMO.slgId)];
  revision += 1;
  for (const listener of listeners) listener();
}

/** The current list. Synchronous, and never empty — the seed is always there. */
export function getInstances(): MyChartInstance[] {
  return instances;
}

/** Subscribe to list replacements (see `useInstances`). */
export function subscribeToInstances(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getInstancesRevision(): number {
  return revision;
}

/**
 * Load the cached list and, if it's stale or absent, refresh from Epic.
 *
 * Never throws and never blocks a screen: whatever happens, `getInstances()`
 * keeps returning a usable list. Call once per launch, after the database is
 * open.
 */
export async function initInstances(): Promise<void> {
  let refreshedAt = 0;
  try {
    const cached = await getCachedDirectory();
    if (cached) {
      const parsed = JSON.parse(cached.json) as MyChartInstance[];
      if (Array.isArray(parsed) && parsed.length > 0) publish(parsed);
      refreshedAt = Date.parse(cached.refreshedAt) || 0;
    }
  } catch (err) {
    console.warn("[instances] cached list unusable:", (err as Error).message);
  }

  if (Date.now() - refreshedAt < REFRESH_AFTER_MS) return;
  await refreshInstances();
}

/**
 * Fetch the live directory and cache it. Failure is not surfaced — an offline
 * launch keeps the list it already had.
 */
export async function refreshInstances(): Promise<void> {
  try {
    const fetched = await fetchMyChartDirectory();
    if (fetched.length === 0) return;
    const list: MyChartInstance[] = fetched.map((i) => ({
      name: i.name,
      url: i.url,
      logoUrl: i.logoUrl,
      slgId: i.slgId,
      aliases: i.aliases,
    }));
    publish(list);
    await setCachedDirectory(JSON.stringify(list));
  } catch (err) {
    console.warn("[instances] refresh failed:", (err as Error).message);
  }
}

// In-memory layer over the SQLite logo cache: a picker row re-renders far more
// often than it changes, and a SQLite round trip per render would show every
// logo as a flash of blank square. Keyed by URL, so a logo that moves refetches.
const logoCache = new Map<string, string | null>();
const logoInFlight = new Map<string, Promise<string | null>>();

/** A cached logo for immediate render, or null/undefined if one isn't loaded. */
export function peekInstanceLogo(logoUrl: string): string | null | undefined {
  return logoCache.get(logoUrl);
}

/**
 * Resolve one instance's logo to a data URI, fetching and caching it if needed.
 * Returns null when the instance has no logo or Epic doesn't serve it — the
 * caller renders its placeholder and moves on.
 */
export async function loadInstanceLogo(logoUrl: string): Promise<string | null> {
  if (!logoUrl) return null;

  const memo = logoCache.get(logoUrl);
  if (memo !== undefined) return memo;

  const existing = logoInFlight.get(logoUrl);
  if (existing) return existing;

  const work = (async () => {
    try {
      const stored = await getCachedLogo(logoUrl);
      if (stored) return stored;

      const icon = await fetchMyChartIcon(logoUrl);
      if (!icon) return null;
      await setCachedLogo(logoUrl, icon.dataUri);
      return icon.dataUri;
    } catch (err) {
      console.warn("[instances] logo fetch failed:", (err as Error).message);
      return null;
    } finally {
      logoInFlight.delete(logoUrl);
    }
  })();

  logoInFlight.set(logoUrl, work);
  const resolved = await work;
  logoCache.set(logoUrl, resolved);
  return resolved;
}

/**
 * Extract the host (incl. port if non-default) from a MyChart instance URL
 * so the scraper can use it. Using `.host` instead of `.hostname` preserves
 * non-standard ports like the dev fake-mychart at localhost:4000.
 * The scraper auto-discovers `firstPathPart` via redirects.
 */
export function hostnameFromInstance(instance: MyChartInstance): string {
  try {
    return new URL(instance.url).host;
  } catch {
    // split() always yields at least one element; ?? "" only satisfies the type checker.
    return instance.url.replace(/^https?:\/\//, "").split("/")[0] ?? "";
  }
}

/**
 * Case-insensitive substring match against name, hostname and the aliases Epic
 * publishes — an organization is often searched for by a name it no longer
 * trades under, or by one of the practices it absorbed.
 */
export function searchInstances(
  query: string,
  list: MyChartInstance[] = getInstances(),
): MyChartInstance[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter((i) => {
    if (i.name.toLowerCase().includes(q)) return true;
    if (i.aliases.some((alias) => alias.toLowerCase().includes(q))) return true;
    try {
      return new URL(i.url).host.toLowerCase().includes(q);
    } catch {
      return false;
    }
  });
}
