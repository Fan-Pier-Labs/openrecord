/**
 * Wiring a tough-cookie jar to a fetch `Response`.
 *
 * **Why tough-cookie doesn't do this for us:** it is a cookie *store*, not an
 * HTTP client. It parses and serializes cookie strings and decides which ones
 * match a URL, but it never sees a request or a response — that's deliberate,
 * so it can back node-fetch, axios, a browser shim or us. Pulling the strings
 * out of a `Response` and handing them over is the caller's half of the
 * contract, and this file is that half.
 *
 * Only `scrapers/http.ts` should call these.
 */

import type { CookieJar } from 'tough-cookie';

/**
 * The `Cookie` header to send with a request, or null when the jar has nothing
 * for this URL. Domain, path, secure and expiry matching are the jar's job.
 */
export async function cookieHeaderFor(jar: CookieJar, url: string): Promise<string | null> {
  const cookieString = await jar.getCookieString(url);
  return cookieString || null;
}

/**
 * Read every `Set-Cookie` off a response into the jar.
 *
 * Two paths because the runtimes disagree. Node/undici and Bun expose
 * `Headers.getSetCookie()`, which keeps the headers as separate strings.
 * React Native's `Headers` (RN 0.86 still ships the whatwg-fetch shim) has no
 * such method and folds them into one comma-joined string — so they have to be
 * split back apart on the commas that separate cookies rather than the ones
 * inside an `Expires=Wed, 09 Jun 2027 …` date. Looking ahead for a `name=` is
 * what tells those apart.
 *
 * The React Native path is live code, not defensive plumbing: the eUnity
 * imaging scraper runs on device and carries its own jar.
 */
export async function storeSetCookies(jar: CookieJar, url: string, response: Response): Promise<void> {
  const headers = response.headers as unknown as { getSetCookie?: () => string[] };

  let setCookies: string[];
  if (typeof headers.getSetCookie === 'function') {
    setCookies = headers.getSetCookie();
  } else {
    const raw = response.headers.get('set-cookie');
    setCookies = raw ? raw.split(/,\s*(?=[A-Z0-9_-]+=)/i) : [];
  }

  for (const cookieStr of setCookies) {
    try {
      await jar.setCookie(cookieStr.trim(), url);
    } catch {
      // A cookie we can't parse is one we can't send back. Dropping it beats
      // failing a request that would otherwise have worked.
    }
  }
}
