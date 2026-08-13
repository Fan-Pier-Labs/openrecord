/**
 * makeAuthenticatedRequest — MyChartRequest.makeRequest for post-login calls.
 *
 * MyChart answers an expired session by bouncing the request to the login
 * page: a 302 to /Authentication/Login that a redirect-following client turns
 * into a 200 HTML login page. A scraper that doesn't check lands in one of two
 * failure modes: `.json()` throws on the HTML, or — far worse for a health
 * app — a token-extraction guard quietly returns an empty result and an
 * expired session renders as "this patient has no allergies".
 *
 * This wrapper is the one place that failure is handled. It detects the login
 * bounce, silently re-logs-in through the `reauthenticate` hook the client
 * wired onto the request (single-flight — a 30-category scrape whose session
 * dies mid-run triggers ONE re-login, not thirty), restores the active proxy
 * patient if the session had been switched to one, retries the original
 * request exactly once, and keeps the session registered for the 30-second
 * keepalive heartbeat so expiry stays rare in the first place. Only when all
 * of that fails does the caller see a typed `SessionExpiredError` — never a
 * fake-empty result.
 *
 * Division of labor with `makeRequest`: the raw method stays the transport for
 * everything pre-login — mount discovery, DoLogin, 2FA, terms, the keepalive
 * pings themselves — which is also what makes this wrapper safe: the re-login
 * path is built entirely from raw calls (plus `autoRenew: false` wrapped
 * calls), so a renewal can never end up awaiting its own single-flight
 * promise.
 */

import { type MyChartRequest } from './myChartRequest';
import { type RequestConfig } from './types';
import { looksLikeSignedOutPage } from './login';
import { sessionStore } from './sessionStore';
import { renewMyChartSession } from './sessionRenewal';

// Re-exported for callers that treat this module as the session-expiry
// surface (the npm package's index, tests). The implementation lives in
// sessionRenewal.ts — a leaf module — so this file, sessionStore and
// proxyContext form an acyclic graph.
export { renewMyChartSession } from './sessionRenewal';

/**
 * An expired MyChart session that could not be renewed automatically — either
 * no `reauthenticate` hook is wired, the hook failed (password changed,
 * interactive 2FA required), or the renewed session was bounced again.
 * Clients catch this at their boundary and tell the user to sign in again.
 */
export class SessionExpiredError extends Error {
  constructor(message?: string) {
    super(message ?? 'The MyChart session has expired and could not be renewed automatically. Sign in again to continue.');
    this.name = 'SessionExpiredError';
  }
}

export type AuthenticatedRequestOptions = {
  /**
   * When false, a login bounce throws SessionExpiredError immediately instead
   * of attempting a re-login. This is how the renewal path calls back into
   * wrapped code (proxy-context restore) without any chance of waiting on its
   * own in-flight renewal. Defaults to true.
   */
  autoRenew?: boolean;
};

const LOGIN_URL_RE = /\/authentication\/login/i;

const REDIRECT_STATUSES = [301, 302, 303, 307, 308];

/**
 * Rebuild a Response whose body has been read, so callers can still call
 * `.text()` / `.json()` as if nothing happened. `Response.url` is read-only
 * and empty on constructed responses, so it's carried over explicitly.
 */
function rebuildResponse(original: Response, bodyText: string): Response {
  const rebuilt = new Response(bodyText, {
    status: original.status,
    statusText: original.statusText,
    headers: original.headers,
  });
  Object.defineProperty(rebuilt, 'url', { value: original.url });
  return rebuilt;
}

/**
 * Make the request and decide whether the response is actually the login page.
 *
 * Three signals, cheapest first:
 *  1. The final URL is /Authentication/Login — covers both the Node path
 *     (makeRequest recursed through the 302 chain) and iOS (the platform fetch
 *     auto-follows, so only the final URL survives).
 *  2. An unfollowed redirect whose Location is the login page, for callers
 *     that pass `followRedirects: false`.
 *  3. A 200 HTML body bearing markers that only ever appear on the login page
 *     (see looksLikeSignedOutPage) — the fallback for platforms where the URL
 *     isn't reported. Reading the body is fine (MyChart bodies are small); the
 *     response is rebuilt so the caller can still consume it. Non-HTML
 *     responses (JSON, PDFs, images) are never touched.
 */
async function requestDetectingSignOut(
  mychartRequest: MyChartRequest,
  config: RequestConfig,
): Promise<{ response: Response; signedOut: boolean }> {
  const response = await mychartRequest.makeRequest(config);

  if (LOGIN_URL_RE.test(response.url ?? '')) {
    return { response, signedOut: true };
  }

  if (REDIRECT_STATUSES.includes(response.status)) {
    const location = response.headers.get('Location') ?? '';
    if (LOGIN_URL_RE.test(location)) {
      return { response, signedOut: true };
    }
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (response.status === 200 && contentType.includes('text/html')) {
    const text = await response.text();
    return { response: rebuildResponse(response, text), signedOut: looksLikeSignedOutPage(text) };
  }

  return { response, signedOut: false };
}

/**
 * Keep the session alive between requests: register it with the shared
 * keepalive (30s /Home/KeepAlive pings, matching MyChart's own JS) after any
 * successful authenticated request. Registration is idempotent, and the
 * interval never holds a process open (see sessionStore).
 */
function registerKeepalive(mychartRequest: MyChartRequest) {
  if (mychartRequest.disableAutoKeepalive) return;
  sessionStore.registerForKeepalive(mychartRequest);
}

/**
 * Drop-in replacement for `mychartRequest.makeRequest(config)` for every
 * post-login call. Same config, same Response back; the login-bounce handling
 * documented at the top of this file happens in between.
 */
export async function makeAuthenticatedRequest(
  mychartRequest: MyChartRequest,
  config: RequestConfig,
  options?: AuthenticatedRequestOptions,
): Promise<Response> {
  const first = await requestDetectingSignOut(mychartRequest, config);
  if (!first.signedOut) {
    registerKeepalive(mychartRequest);
    return first.response;
  }

  if (options?.autoRenew === false) {
    throw new SessionExpiredError();
  }

  const renewed = await renewMyChartSession(mychartRequest);
  if (!renewed) {
    throw new SessionExpiredError();
  }

  const second = await requestDetectingSignOut(mychartRequest, config);
  if (second.signedOut) {
    throw new SessionExpiredError(
      'The MyChart session expired, and the request was signed out again immediately after a successful re-login.',
    );
  }
  registerKeepalive(mychartRequest);
  return second.response;
}
