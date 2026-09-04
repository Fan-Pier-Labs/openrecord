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
import { cookieHeaderFor, storeSetCookies } from './cookies';
import { hostKeyForUrl, withHostLimit } from '../shared/hostConcurrency';

/**
 * Pretend to be Google Chrome on macOS. Sent on every request; a call site that
 * needs a different value for one of these passes it in `init.headers`, which
 * wins.
 */
export const BROWSER_HEADERS: Readonly<Record<string, string>> = {
  'Cache-Control': 'max-age=0',
  // Every version here has to match the one in User-Agent below. A request
  // claiming Chrome 131 in one header and 126 in another is a fingerprint no
  // real browser produces, and CLAUDE.md names request-shape mismatch as the
  // first thing to suspect behind an unexplained 403.
  'Sec-Ch-Ua': '"Not/A)Brand";v="24", "Chromium";v="131", "Google Chrome";v="131"',
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
 * permit.
 */
export type Transport = (url: string, init: RequestInit) => Promise<Response>;

// expo/fetch when running inside an Expo app — its Swift-side
// URLSessionDelegate honors redirect:"manual". Under Node/Bun the require
// throws (the module isn't resolvable outside the app) and this stays
// undefined, which doubles as a runtime signal for where we're running.
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
 * Whether the platform keeps its own cookie store.
 *
 * On React Native that's iOS's `HTTPCookieStorage`, wired into the fetch the
 * runtime provides — so a tough-cookie jar there would be a second, empty
 * store shadowing the real one. Everywhere else nothing manages cookies for
 * us and the jar is the only thing keeping a session alive.
 *
 * Two signals, because getting this wrong on device is a silently broken
 * session rather than a crash: React Native's own `navigator` marker, and the
 * fact that `expo/fetch` resolved at all. Both hold in the app, neither holds
 * under Node or Bun.
 */
export const PLATFORM_OWNS_COOKIES: boolean =
  expoFetch !== undefined ||
  (typeof navigator !== 'undefined' &&
    (navigator as { product?: string }).product === 'ReactNative');

/**
 * Installed by tests to route every scraper request at a scripted server. See
 * {@link setTestTransport} — production code never sets this.
 */
let testTransport: Transport | null = null;

/**
 * Send every subsequent scraper request to `fn`. Tests only; pass null to
 * restore the real network.
 *
 * This exists so `myChartUserPassLogin` and friends don't have to carry a
 * "pass me a fetch" parameter that only tests ever fill in. Set it in
 * `beforeEach` and clear it in `afterEach` — it is process-wide.
 */
export function setTestTransport(fn: Transport | null): void {
  testTransport = fn;
}

/**
 * Pick the network call for this request. Three cases, in order:
 *
 *  1. **Tests** — a scripted transport, either process-wide
 *     ({@link setTestTransport}) or per-session (`MyChartRequest.transport`).
 *  2. **We own the cookies** — a jar was handed over, so we're driving the
 *     redirect chain and the cookies ourselves. Prefer `expo/fetch` when it's
 *     there, because it honors `redirect: 'manual'` where React Native's own
 *     fetch quietly follows redirects and hides the hops from us.
 *  3. **The platform owns the cookies** — use the runtime's own fetch, the one
 *     its cookie store is actually attached to. Substituting a different
 *     networking stack here would send every request out with no session.
 *
 * `globalThis.fetch` is read per call rather than captured at import, so a test
 * that swaps the global still intercepts.
 */
function resolveTransport(override: Transport | undefined, cookieJar: CookieJar | null | undefined): Transport {
  if (testTransport) return testTransport;
  if (override) return override;
  if (cookieJar && expoFetch) return expoFetch;
  return (url, init) => globalThis.fetch(url, init);
}

/**
 * The transport a request gets when nothing overrides it and no jar is in
 * play. Exported for tests and diagnostics.
 */
export const platformFetch: Transport = (url, init) => resolveTransport(undefined, null)(url, init);

/**
 * How long any one request may take before we stop waiting for it.
 *
 * A host that accepts the connection and then never answers would otherwise
 * hang the scrape forever while holding one of that host's ten permits, so a
 * few of them starve every other category on the same instance. Two minutes is
 * past anything MyChart legitimately does and far short of "forever".
 */
const REQUEST_TIMEOUT_MS = 120_000;

/** Shortened by tests so they don't wait two minutes. Production never sets it. */
let testTimeoutMs: number | null = null;

/** See {@link testTimeoutMs}. Tests only; pass null to restore the real deadline. */
export function setTestRequestTimeout(ms: number | null): void {
  testTimeoutMs = ms;
}

/**
 * Give up on a request that never answers.
 *
 * A race against a timer rather than an `AbortSignal`: the transports
 * underneath (`globalThis.fetch`, `expo/fetch`, a scripted test function) don't
 * honor a signal alike. The cost is that only *we* abandon the request — the
 * socket stays open until the runtime gives up on it. What matters is what gets
 * freed: the caller stops waiting, and because the race is what `withHostLimit`
 * is holding, the throw runs its `finally` and hands the permit to the next
 * request in the queue. A hung host costs one category, not the whole scrape.
 */
function withRequestTimeout(pending: Promise<Response>, url: string): Promise<Response> {
  const ms = testTimeoutMs ?? REQUEST_TIMEOUT_MS;

  // Nobody is left holding `pending` once the deadline wins, so a late
  // rejection from it would be an unhandled one. Claim it here.
  pending.catch(() => {});

  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    // The host, never the path — request URLs carry record and patient ids.
    timer = setTimeout(
      () => reject(new Error(`Request to ${hostKeyForUrl(url)} timed out after ${ms}ms`)),
      ms,
    );
  });

  return Promise.race([pending, deadline]).finally(() => clearTimeout(timer));
}

/**
 * `RequestInit` with headers narrowed to a plain object.
 *
 * `Omit` rather than an intersection with `RequestInit`, and that is
 * load-bearing: intersecting leaves `headers` as `HeadersInit &
 * Record<string, string>`, whose `string[][]` branch survives. A caller
 * passing the tuple form (`[['X-Foo', '1']]`) or a `Headers` instance would
 * type-check, and `{ ...init.headers }` below would spread it by index —
 * producing a header literally named `0`, or nothing at all, instead of the
 * headers asked for. Every outbound request in the product goes through here,
 * so that failure would be silent and total. Narrowing the type makes the
 * merge below the only thing this function has to support.
 */
export type ScraperFetchInit = Omit<RequestInit, 'headers'> & {
  headers?: Record<string, string>;
};

export type ScraperFetchOptions = {
  /**
   * Jar to read `Cookie` from and write `Set-Cookie` back into. Pass null when
   * {@link PLATFORM_OWNS_COOKIES}, where a second jar would only shadow the
   * store the OS is already keeping.
   */
  cookieJar?: CookieJar | null;

  /** Override the network call for this session. See {@link resolveTransport}. */
  transport?: Transport | undefined;
};

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
  init: ScraperFetchInit = {},
  options: ScraperFetchOptions = {},
): Promise<Response> {
  const { cookieJar } = options;
  const transport = resolveTransport(options.transport, cookieJar);

  const headers: Record<string, string> = { ...BROWSER_HEADERS, ...init.headers };

  // MyChart's APIs speak JSON, so a POST body that didn't declare a type is a
  // JSON one. Call sites that send anything else (form-encoded logins, AMF)
  // set Content-Type themselves and that wins.
  if (init.method === 'POST' && init.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  if (cookieJar) {
    const cookie = await cookieHeaderFor(cookieJar, url);
    if (cookie) headers['Cookie'] = cookie;
  }

  // One deadline per network call, so a redirect chain gets a fresh one per
  // hop — the same shape as the permit.
  const response = await withHostLimit(url, () =>
    withRequestTimeout(transport(url, { ...init, headers }), url),
  );

  if (cookieJar) {
    await storeSetCookies(cookieJar, url, response);
  }

  return response;
}
