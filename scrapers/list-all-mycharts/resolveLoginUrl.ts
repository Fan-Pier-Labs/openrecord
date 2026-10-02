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
 *   3. otherwise say which of two things it is. `down` is broken for anyone,
 *      anywhere: the hostname is gone, the connection is refused, TLS fails,
 *      a 5xx. `unconfirmed` is everything we can't vouch for either way — a
 *      custom sign-in page, a bot wall, a dead link, and a connection that
 *      just hangs, which is what a portal blocking traffic from outside its
 *      own country looks like (six Dutch hospitals and an NHS trust, from
 *      the US). Either way the caller keeps what it had.
 *
 * Every request is one an unauthenticated browser makes opening the page.
 */

import { extractMountsFromLinks, looksLikeLoginPage } from '../myChart/auth/login';
import { MyChartRequest } from '../myChart/core/myChartRequest';

const MAX_HOPS = 10;

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
  | { kind: 'down'; reason: string }
  | { kind: 'unconfirmed'; reason: string };

/**
 * Failures that don't prove a portal is down: a hang or a reset may only be a
 * block on where the refresh ran from, and a server missing an intermediate
 * certificate still loads in a browser, which fetches the missing link itself.
 */
const NOT_PROOF_OF_DOWN =
  /timed out|closed unexpectedly|reset|unable to verify the first certificate|unable to get local issuer certificate/i;

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
    const reason = String((e as Error)?.message ?? e);
    return { kind: NOT_PROOF_OF_DOWN.test(reason) ? 'unconfirmed' : 'down', reason };
  }
  if (page.status >= 500) return { kind: 'down', reason: `HTTP ${page.status}` };
  if (page.status >= 400) return { kind: 'unconfirmed', reason: `HTTP ${page.status}` };
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
  return { kind: 'unconfirmed', reason: 'no MyChart login on the page or anything it links to' };
}

export async function resolveLoginUrl(directoryUrl: string): Promise<LoginUrlResolution> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      resolve(directoryUrl),
      new Promise<LoginUrlResolution>((done) => {
        timer = setTimeout(() => done({ kind: 'unconfirmed', reason: 'timed out' }), RESOLVE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
