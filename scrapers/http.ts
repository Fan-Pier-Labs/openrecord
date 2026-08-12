/**
 * The single outbound HTTP path for the scrapers.
 *
 * Every request this repo aims at a health system goes through `scraperFetch`,
 * because three things have to be true of all of them and none of the three
 * survives being reimplemented at a call site:
 *
 *  - **The browser header block.** MyChart and the eUnity image servers behind
 *    it answer a request that looks like Chrome; a bare `fetch` gets a login
 *    wall or a 403.
 *  - **The cookie jar.** Session, load-balancer and bot-check cookies are set
 *    mid-redirect-chain and expected back on the very next hop, so injecting
 *    `Cookie` and harvesting `Set-Cookie` can't be optional.
 *  - **The per-host permit.** A full 30-category scrape otherwise arrives at
 *    one hospital as ~60 simultaneous requests, which is how an instance ends
 *    up in `blockedInstances.ts`.
 *
 * A second raw-fetch path is exactly how the cap silently stops applying — it
 * keeps working, so nobody notices it isn't limited. So there isn't one. If you
 * need "just a quick request", call this.
 */

import type { CookieJar } from 'tough-cookie';
import { withHostLimit } from '../shared/hostConcurrency';

/**
 * Pretend to be Google Chrome on macOS. Sent on every request; a call site that
 * needs a different value for one of these passes it in `init.headers`, which
 * wins.
 */
export const BROWSER_HEADERS: Readonly<Record<string, string>> = {
  'Cache-Control': 'max-age=0',
  'Sec-Ch-Ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': 'macOS',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'same-origin',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
  'Dnt': '1',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};

/**
 * The network call itself — everything below the headers, the jar and the
 * permit. Swapped out on iOS (which handles cookies natively) and by tests.
 */
export type Transport = (url: string, init: RequestInit) => Promise<Response>;

// expo/fetch when running inside an Expo app — its Swift-side
// URLSessionDelegate honors redirect:"manual". Under Node/Bun the require
// throws and we fall back to the global fetch.
const expoFetch: Transport | undefined = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = require('expo/fetch') as { fetch?: Transport };
    return m?.fetch;
  } catch {
    return undefined;
  }
})();

/**
 * The default transport. Reads `globalThis.fetch` per call rather than
 * capturing it at import time, so a test that swaps the global still
 * intercepts.
 */
export const platformFetch: Transport = (url, init) =>
  expoFetch ? expoFetch(url, init) : globalThis.fetch(url, init);

/** `AbortSignal.timeout` polyfill for React Native / Hermes. */
export function abortAfter(ms: number): AbortSignal {
  if (typeof AbortSignal !== 'undefined' && typeof (AbortSignal as unknown as { timeout?: unknown }).timeout === 'function') {
    return (AbortSignal as unknown as { timeout: (ms: number) => AbortSignal }).timeout(ms);
  }
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

export type ScraperFetchOptions = {
  /**
   * Jar to read `Cookie` from and write `Set-Cookie` back into. Pass null on
   * platforms that keep their own cookie store (iOS), where a second jar would
   * only duplicate what the OS already did.
   */
  cookieJar?: CookieJar | null;

  /** Override the network call. Defaults to {@link platformFetch}. */
  transport?: Transport;
};

/**
 * Extract `Set-Cookie` from a response into the jar.
 *
 * Node's undici exposes `getSetCookie()`; other runtimes fold the headers into
 * one comma-joined string, which has to be split back apart on the commas that
 * actually separate cookies rather than the ones inside `Expires` dates.
 */
async function storeSetCookies(jar: CookieJar, url: string, response: Response): Promise<void> {
  let setCookies: string[] = [];
  const headers = response.headers as unknown as { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === 'function') {
    setCookies = headers.getSetCookie();
  } else {
    const raw = response.headers.get('set-cookie');
    if (raw) {
      // Split on ", " only when a cookie name (token=) follows.
      setCookies = raw.split(/,\s*(?=[A-Za-z0-9_-]+=)/);
    }
  }

  for (const cookieStr of setCookies) {
    try {
      await jar.setCookie(cookieStr.trim(), url);
    } catch {
      // Skip invalid cookies
    }
  }
}

/**
 * Make one outbound scraper request.
 *
 * Does not follow redirects — callers that need to (`MyChartRequest.makeRequest`,
 * the eUnity SAML chain) pass `redirect: 'manual'` and come back round for a
 * fresh permit on each hop. That is deliberate: only the individual network
 * call sits inside the permit, because holding one across a whole redirect
 * chain would let a single chain hold several at once and deadlock against its
 * own callers.
 */
export async function scraperFetch(
  url: string,
  init: RequestInit & { headers?: Record<string, string> } = {},
  options: ScraperFetchOptions = {},
): Promise<Response> {
  const { cookieJar, transport = platformFetch } = options;

  const headers: Record<string, string> = { ...BROWSER_HEADERS, ...init.headers };

  // MyChart's APIs speak JSON, so a POST body that didn't declare a type is a
  // JSON one. Call sites that send anything else (form-encoded logins, AMF)
  // set Content-Type themselves and that wins.
  if (init.method === 'POST' && init.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  if (cookieJar) {
    const cookieString = await cookieJar.getCookieString(url);
    if (cookieString) {
      headers['Cookie'] = cookieString;
    }
  }

  const response = await withHostLimit(url, () => transport(url, { ...init, headers }));

  if (cookieJar) {
    await storeSetCookies(cookieJar, url, response);
  }

  return response;
}
