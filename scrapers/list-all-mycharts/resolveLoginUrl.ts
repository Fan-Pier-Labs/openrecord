/**
 * Where an organization's MyChart login actually is, starting from the URL
 * Epic's directory publishes for it.
 *
 * Usually that URL is the portal. Sometimes it is the health system's own
 * website — UCSF's is `www.ucsfhealth.org/ucsfmychart/`, an information page —
 * and a search that hands back that hostname sends the user to a login that
 * can never succeed. Those pages nearly always link to the real portal, so:
 *
 *   1. follow the directory URL; if it lands on a MyChart login page, it's right;
 *   2. otherwise take the MyChart links on the page it landed on, and keep the
 *      first one that itself serves a MyChart login page;
 *   3. otherwise it's `down`: we couldn't confirm it was up when we checked,
 *      whatever the reason. The caller keeps Epic's URL.
 *
 * Every request is one an unauthenticated browser makes opening the page.
 */

import { extractMountsFromLinks, looksLikeLoginPage } from '../myChart/auth/login';
import { MyChartRequest } from '../myChart/core/myChartRequest';

const MAX_HOPS = 5;

/** Links tried per page, in the ranking's order. */
const MAX_CANDIDATES = 5;

/**
 * A health system's own MyChart page is mostly its site navigation
 * (`/locations`, `/contact-us`), which can fill every slot above before the one
 * portal link on another host is reached (UCHealth). So portal-looking links
 * further down get tried too — after, not instead: promoting them outright
 * picked Evangelical's bill-pay portal over the one its page signs in through.
 */
const READS_AS_PORTAL = /mychart|chart|portal|epic/i;

/**
 * One organization's whole resolution. `scraperFetch` gives each request two
 * minutes, which across 1,400 organizations is a refresh nobody waits out.
 */
const RESOLVE_TIMEOUT_MS = 60_000;

export type LoginUrlResolution =
  | { kind: 'login' }
  | { kind: 'linked'; url: string }
  | { kind: 'down'; reason: string };

async function fetchFollowing(url: string): Promise<{ finalUrl: string; status: number; html: string }> {
  // One request object for the whole chain, so cookies set along the way are
  // sent on the next hop the way a browser would.
  const request = new MyChartRequest(new URL(url).host);
  let current = url;
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const response = await request.makeRequest({ url: current, followRedirects: false });
    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      current = new URL(location, current).href;
      continue;
    }
    return { finalUrl: current, status: response.status, html: await response.text() };
  }
  throw new Error(`more than ${MAX_HOPS} redirects`);
}

async function servesLoginPage(url: string): Promise<boolean> {
  try {
    const page = await fetchFollowing(url);
    return page.status < 400 && looksLikeLoginPage(page.html);
  } catch {
    return false;
  }
}

async function resolve(directoryUrl: string): Promise<LoginUrlResolution> {
  let page: Awaited<ReturnType<typeof fetchFollowing>>;
  try {
    page = await fetchFollowing(directoryUrl);
  } catch (e) {
    return { kind: 'down', reason: String((e as Error)?.message ?? e) };
  }
  if (page.status >= 400) return { kind: 'down', reason: `HTTP ${page.status}` };
  if (looksLikeLoginPage(page.html)) return { kind: 'login' };

  const ranked = extractMountsFromLinks(page.html, new URL(page.finalUrl).host);
  const candidates = [
    ...ranked.slice(0, MAX_CANDIDATES),
    ...ranked
      .slice(MAX_CANDIDATES)
      .filter((m) => READS_AS_PORTAL.test(m.hostname) || READS_AS_PORTAL.test(m.firstPathPart ?? ''))
      .slice(0, MAX_CANDIDATES),
  ];
  for (const { hostname, firstPathPart } of candidates) {
    const mount = `https://${hostname}/${firstPathPart ? `${firstPathPart}/` : ''}`;
    if (await servesLoginPage(`${mount}Authentication/Login`)) return { kind: 'linked', url: mount };
  }
  return { kind: 'down', reason: 'no MyChart login on the page or anything it links to' };
}

export async function resolveLoginUrl(directoryUrl: string): Promise<LoginUrlResolution> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      resolve(directoryUrl),
      new Promise<LoginUrlResolution>((done) => {
        timer = setTimeout(() => done({ kind: 'down', reason: 'timed out' }), RESOLVE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
