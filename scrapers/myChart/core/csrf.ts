/**
 * Session-scoped CSRF tokens (`__RequestVerificationToken`).
 *
 * MyChart's `/api/*` endpoints reject a POST that arrives without an
 * antiforgery token. Chart scrapers harvest one from the hidden input on their
 * own category page, but the flows that have no category page — TOTP and
 * passkey enrollment, the eUnity imaging handoff — ask `/Home/CSRFToken` for a
 * token directly, and that endpoint is one of the least consistent surfaces
 * across Epic instances. It answers with any of:
 *
 *   - JSON: `{"Token": "..."}`, or the same key camel-cased, or
 *     `RequestVerificationToken` in either casing
 *   - the bare token as the entire response body
 *   - a full HTML page with the usual hidden input
 *   - an empty 200 (seen on at least one live instance), which is why the
 *     `/Home` page fallback exists
 *
 * Getting this wrong doesn't fail loudly — it produces a token-less POST that
 * the instance answers with ASP.NET's redirect dance, which reads downstream as
 * "this account has no imaging" rather than as an error. Three copies of the
 * parsing had drifted apart before this module existed; keep it as the one.
 */

import { makeAuthenticatedRequest } from './makeAuthenticatedRequest';
import type { MyChartRequest } from './myChartRequest';
import { getRequestVerificationTokenFromBody } from './util';
import { logger } from '../../../shared/logger';

/** JSON keys instances use for the token, in the order we try them. */
const JSON_TOKEN_KEYS = [
  'Token',
  'token',
  'RequestVerificationToken',
  'requestVerificationToken',
] as const;

/**
 * A bare-string body has to clear this length to be believed. It rules out
 * short error strings ("0", "null") without excluding any real token — Epic's
 * are base64-ish and dozens of characters long.
 */
const MIN_BARE_TOKEN_LENGTH = 10;

/**
 * The token out of a JSON envelope, or undefined when the body is a JSON
 * object that carries none. Returns null when the body isn't a JSON object at
 * all, which is the signal to go on and try the other shapes.
 */
function tokenFromJsonEnvelope(trimmed: string): string | undefined | null {
  if (!trimmed.startsWith('{')) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null; // Starts with '{' but isn't JSON — treat it as an opaque body.
  }
  if (parsed === null || typeof parsed !== 'object') return null;

  const record = parsed as Record<string, unknown>;
  for (const key of JSON_TOKEN_KEYS) {
    const value = record[key];
    if (typeof value === 'string' && value) {
      logger.debug('Got CSRF token from JSON response');
      return value;
    }
  }
  return undefined;
}

/** Pull the token out of a `/Home/CSRFToken` body, whatever shape it arrived in. */
function parseTokenFromCsrfEndpoint(body: string): string | undefined {
  const trimmed = body.trim();

  // A JSON envelope either carries the token under a known key or carries none.
  // It must never fall through to the bare-string branch below: `{"error":"x"}`
  // has no angle brackets and clears the length bar, so the whole envelope
  // would be sent as the token and every /api/* POST would be rejected.
  const fromJson = tokenFromJsonEnvelope(trimmed);
  if (fromJson !== null) return fromJson;

  // The entire body is the token.
  if (trimmed && !trimmed.includes('<') && trimmed.length > MIN_BARE_TOKEN_LENGTH) {
    logger.debug('Got CSRF token as plain string');
    return trimmed;
  }

  return getRequestVerificationTokenFromBody(body);
}

/**
 * Fetch a CSRF token good for this session's `/api/*` POSTs, without going
 * through any particular category page.
 *
 * Returns null when no token can be had — including when the session has been
 * bounced to Terms & Conditions, where `/Home` would only bounce again, so the
 * fallback is deliberately skipped. Callers must treat null as a hard failure:
 * a POST sent without the header is rejected in a way that is easy to misread
 * as an empty chart.
 */
export async function fetchSessionCsrfToken(mychartRequest: MyChartRequest): Promise<string | null> {
  const res = await makeAuthenticatedRequest(mychartRequest, {
    // Cache-busted so no proxy between us and the instance can serve a stale token.
    path: '/Home/CSRFToken?noCache=' + Math.random(),
  });
  logger.debug('CSRFToken response status:', res.status);

  const body = await res.text();

  const lowered = body.toLowerCase();
  if (lowered.includes('termsconditions') || lowered.includes('terms and conditions')) {
    logger.debug('CSRF token request landed on Terms & Conditions page');
    return null;
  }

  const token = parseTokenFromCsrfEndpoint(body);
  if (token) return token;

  logger.debug('CSRFToken endpoint returned no token (length:', body.length, '), trying /Home page fallback');
  try {
    const homeRes = await makeAuthenticatedRequest(mychartRequest, { path: '/Home' });
    const homeToken = getRequestVerificationTokenFromBody(await homeRes.text());
    if (homeToken) {
      logger.debug('Got CSRF token from /Home page fallback');
      return homeToken;
    }
    logger.debug('Could not extract CSRF token from /Home page either');
  } catch (err) {
    logger.debug('/Home page fallback failed:', err);
  }

  return null;
}
