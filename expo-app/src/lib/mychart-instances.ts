/**
 * The list of MyChart instances the picker offers, and their logos.
 *
 * The list is `listMyCharts()` — the two checked-in files under
 * `scrapers/list-all-mycharts/`, refreshed from Epic's directory on each
 * release and corrected by hand — plus the demo entry. Nothing is fetched at
 * runtime: Epic's live directory carries the very URLs those files fix.
 *
 * Logos are fetched one at a time as rows scroll into view and cached in
 * SQLite as data URIs. Every logo in the directory is served by one host, so
 * `scraperFetch`'s per-host permit paces them — prefetching all ~1400 up front
 * would be 1400 gated requests at Epic for a list the user scrolls past three
 * of.
 */

import { fetchMyChartIcon, listMyCharts } from "../../../scrapers/list-all-mycharts/directory";
import type { MyChartInstanceSeed } from "../../../scrapers/list-all-mycharts/directory";
import {
  SANDBOX_UNAVAILABLE_NOTE,
  isSandboxAvailable,
} from "../../../scrapers/list-all-mycharts/searchDirectory";
import { getCachedLogo, setCachedLogo } from "@/lib/storage/database";

export type MyChartInstance = MyChartInstanceSeed;

// Demo/test entry pointing at the deployed fake-mychart sandbox. Lets
// users (and developers) try the full flow with Homer Simpson fake data
// without needing real Epic credentials. It is one small deployment that gets
// torn down when it isn't worth its bill, so the picker probes it
// (`isSandboxAvailable`) and greys the row out rather than sending someone to
// a login that can't succeed.
export const FAKE_MYCHART_DEMO: MyChartInstance = {
  name: "Springfield Medical Center (Demo)",
  url: "https://fake-mychart.fanpierlabs.com/MyChart/",
  logoUrl: "",
  slgId: "fake-mychart",
  aliases: [],
};

const instances: MyChartInstance[] = [FAKE_MYCHART_DEMO, ...listMyCharts()];

/** The list the picker offers: the demo entry first, then every MyChart. */
export function getInstances(): MyChartInstance[] {
  return instances;
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
 * Case-insensitive substring match against name, hostname (and any extra
 * hostname) and the aliases Epic publishes — an organization is often searched
 * for by a name it no longer trades under, or by one of the practices it
 * absorbed.
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
    if (i.extraHosts?.some((host) => host.includes(q))) return true;
    try {
      return new URL(i.url).host.toLowerCase().includes(q);
    } catch {
      return false;
    }
  });
}

// Re-exported so a screen showing the demo row gets the entry and its
// reachability from the same module, rather than reaching into `scrapers/`.
export { SANDBOX_UNAVAILABLE_NOTE, isSandboxAvailable };
