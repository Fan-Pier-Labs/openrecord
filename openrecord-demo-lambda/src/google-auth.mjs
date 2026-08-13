// Google ID-token verification with zero dependencies (node:crypto only).
//
// The mobile app signs users in with the native Google SDK and sends the
// resulting ID token as `Authorization: Bearer <jwt>`. This module verifies
// that token server-side — signature against Google's published JWKS, issuer,
// audience, expiry — so the Lambda never has to trust the client about who is
// signed in.
//
// Google rotates its signing keys; the JWKS is cached per-container and
// re-fetched when the Cache-Control max-age lapses or an unknown `kid` shows
// up (a rotation can land before our cache expires).

import { createPublicKey, verify as cryptoVerify } from 'node:crypto';

const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ALLOWED_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);

let certsCache = { keys: null, expiresAt: 0 };

/** Test hook: replace the cached JWKS (pass null to clear). */
export function _setCertsForTest(keys, expiresAt = Number.MAX_SAFE_INTEGER) {
  certsCache = { keys, expiresAt };
}

function b64urlToBuffer(value) {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function decodeSegment(segment) {
  try {
    return JSON.parse(b64urlToBuffer(segment).toString('utf8'));
  } catch {
    return null;
  }
}

async function fetchCerts() {
  const res = await fetch(CERTS_URL, { signal: AbortSignal.timeout(5_000) });
  if (!res.ok) throw new Error(`Google JWKS fetch failed (${res.status})`);
  const body = await res.json();
  const cacheControl = res.headers.get('cache-control') ?? '';
  const maxAge = Number(/max-age=(\d+)/.exec(cacheControl)?.[1] ?? 3600);
  certsCache = { keys: body.keys ?? [], expiresAt: Date.now() + maxAge * 1000 };
  return certsCache.keys;
}

async function getKey(kid) {
  if (!certsCache.keys || Date.now() >= certsCache.expiresAt) await fetchCerts();
  let jwk = certsCache.keys.find((k) => k.kid === kid);
  if (!jwk) {
    // Unknown kid — likely a key rotation ahead of our cache expiry.
    await fetchCerts();
    jwk = certsCache.keys.find((k) => k.kid === kid);
  }
  if (!jwk) throw new Error('No matching Google signing key');
  return jwk;
}

/**
 * Verify a Google ID token. Returns `{ sub, email, aud }` on success and
 * throws on any failure (malformed token, bad signature, wrong issuer or
 * audience, expired). `clientIds` is the set of OAuth client ids we accept
 * as the token's audience.
 */
export async function verifyGoogleIdToken(token, clientIds, now = Date.now()) {
  const parts = String(token).split('.');
  if (parts.length !== 3) throw new Error('Malformed token');

  const header = decodeSegment(parts[0]);
  const payload = decodeSegment(parts[1]);
  if (!header?.kid || header.alg !== 'RS256' || !payload) throw new Error('Malformed token');

  const jwk = await getKey(header.kid);
  const key = createPublicKey({ key: jwk, format: 'jwk' });
  const signed = Buffer.from(`${parts[0]}.${parts[1]}`);
  const ok = cryptoVerify('RSA-SHA256', signed, key, b64urlToBuffer(parts[2]));
  if (!ok) throw new Error('Bad signature');

  if (!ALLOWED_ISSUERS.has(payload.iss)) throw new Error('Wrong issuer');
  if (!clientIds.has(payload.aud)) throw new Error('Wrong audience');
  if (typeof payload.exp !== 'number' || payload.exp * 1000 <= now) throw new Error('Token expired');
  if (!payload.sub) throw new Error('Missing subject');

  return { sub: payload.sub, email: payload.email, aud: payload.aud };
}
