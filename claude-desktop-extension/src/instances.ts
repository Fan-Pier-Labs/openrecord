/**
 * MyChart instance catalog — sourced from scrapers/list-all-mycharts/mychart-instances.json.
 *
 * Inlined into the bundle at build time by tsup (via `resolveJsonModule`).
 * Provides search + hostname extraction so the setup wizard can offer an
 * autocomplete-style picker without dumping 1300+ entries into a flat dropdown.
 */

import type { MyChartInstanceSeed } from '../../scrapers/list-all-mycharts/directory';
import rawInstances from '../../scrapers/list-all-mycharts/mychart-instances.json';

export interface Instance {
  /** Display name, e.g. "UCHealth" */
  name: string;
  /** MyChart login URL */
  url: string;
  /** Epic-hosted logo URL, always set (Epic's generic logo when unbranded) */
  logoUrl: string;
  /** Cached hostname extracted from the URL */
  hostname: string;
}

// Banner-style logo for the test entry, matching the wide aspect ratio of the
// real Epic logos (~640x230) so it renders consistently in the picker. Inlined
// as a data URI so it needs no network or AWS creds. Teal cross emblem +
// "Springfield General Hospital" wordmark.
const SPRINGFIELD_LOGO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 110">' +
  '<rect x="6" y="18" width="74" height="74" rx="14" fill="#0d9488"/>' +
  '<rect x="35" y="33" width="16" height="44" rx="3" fill="#ffffff"/>' +
  '<rect x="21" y="47" width="44" height="16" rx="3" fill="#ffffff"/>' +
  '<text x="94" y="50" font-family="Helvetica,Arial,sans-serif" font-size="30" font-weight="700" fill="#1e3a8a">Springfield</text>' +
  '<text x="94" y="84" font-family="Helvetica,Arial,sans-serif" font-size="22" font-weight="600" fill="#0d9488">General Hospital</text>' +
  '</svg>';
const SPRINGFIELD_LOGO = 'data:image/svg+xml;base64,' + Buffer.from(SPRINGFIELD_LOGO_SVG).toString('base64');

/**
 * Test/demo entry pointing at the deployed fake-mychart sandbox. Lets users
 * (and developers) exercise the full connect flow with Homer Simpson fake data
 * without needing real Epic credentials. The "(test)" suffix makes it obvious
 * in the picker that this is not a real health system. Credentials:
 * `homer` / `donuts123`. Only surfaces when searched (e.g. "test", "springfield",
 * "fake-mychart"); it is not shown as a default suggestion.
 */
const FAKE_MYCHART_TEST: Instance = {
  name: 'Springfield General Hospital (test)',
  url: 'https://fake-mychart.fanpierlabs.com/MyChart/',
  logoUrl: SPRINGFIELD_LOGO,
  hostname: 'fake-mychart.fanpierlabs.com',
};

const realInstances: Instance[] = (rawInstances as MyChartInstanceSeed[]).map(raw => {
  let hostname = '';
  try { hostname = new URL(raw.url).hostname.toLowerCase(); } catch { /* keep empty */ }
  return {
    name: raw.name,
    url: raw.url,
    logoUrl: raw.logoUrl,
    hostname,
  };
}).filter(i => i.hostname);

// The test entry is listed first so it ranks ahead of any real "Springfield…"
// match when searched, but it is NOT shown as a default suggestion.
const all: Instance[] = [FAKE_MYCHART_TEST, ...realInstances];

export function allInstances(): Instance[] {
  return all;
}

/**
 * Case-insensitive substring search across the display name. Returns up
 * to `limit` matches sorted by:
 *   1. Exact (case-insensitive) name match first
 *   2. Name startsWith match
 *   3. Substring match in name
 *   4. Substring match in hostname
 */
export function searchInstances(query: string, limit = 25): Instance[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const exact: Instance[] = [];
  const startsWith: Instance[] = [];
  const nameIncludes: Instance[] = [];
  const hostnameIncludes: Instance[] = [];

  for (const inst of all) {
    const name = inst.name.toLowerCase();
    if (name === q) exact.push(inst);
    else if (name.startsWith(q)) startsWith.push(inst);
    else if (name.includes(q)) nameIncludes.push(inst);
    else if (inst.hostname.includes(q)) hostnameIncludes.push(inst);
  }

  return [...exact, ...startsWith, ...nameIncludes, ...hostnameIncludes].slice(0, limit);
}

/** Look up by exact hostname (case-insensitive). Returns undefined if not in catalog. */
export function findByHostname(hostname: string): Instance | undefined {
  const h = hostname.trim().toLowerCase();
  return all.find(i => i.hostname === h);
}
