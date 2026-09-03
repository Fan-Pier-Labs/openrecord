import crypto from 'crypto';
import { NextResponse } from 'next/server';
import {
  createSession, sessionCookieHeader, acceptTerms, getSessionUsername,
} from '@/lib/session';
import {
  loginPage, loginPageControllerJs, doLoginSuccess, doLoginNeed2FA, doLoginFailed,
  secondaryValidationPage, termsConditionsPage,
} from '@/lib/html';
import { findUser, findUserByPasskey, state } from '@/lib/state';
import { getRequireTerms } from '@/lib/terms';
import { verifyTotpCode } from '@/lib/totp';
import { html, json, redirectTo } from './respond';
import { acceptAny } from './guards';
import { currentUser } from './records';
import { pattern, prefix, type ExactRoutes, type PatternRoute } from './types';

/**
 * Extract the WebAuthn signature counter from a base64 `authenticatorData`.
 * Layout: rpIdHash (32 bytes) || flags (1 byte) || signCount (4 bytes, BE).
 * Returns null if the data is missing or too short to contain a counter.
 */
function parseSignCount(authenticatorDataB64: string | undefined): number | null {
  if (!authenticatorDataB64) return null;
  try {
    const buf = Buffer.from(authenticatorDataB64, 'base64');
    if (buf.length < 37) return null;
    return buf.readUInt32BE(33);
  } catch {
    return null;
  }
}

// ─── GET ────────────────────────────────────────────────────────────
// The whole login flow is served before the session gate, so these live in the
// route's public group.

export const authGet: ExactRoutes = {
  'authentication/login': () => html(loginPage()),
  'authentication/secondaryvalidation': () => html(secondaryValidationPage()),
  'authentication/termsconditions': () => html(termsConditionsPage()),
};

export const authGetPatterns: readonly PatternRoute[] = [
  pattern('*loginpagecontroller.min.js*', lower => lower.includes('loginpagecontroller.min.js'), () =>
    new NextResponse(loginPageControllerJs(), { headers: { 'Content-Type': 'application/javascript' } })),
  prefix('authentication/secondaryvalidation/getsmsconsentstrings', () => html('OK')),
];

// ─── POST ───────────────────────────────────────────────────────────

export const authPost: ExactRoutes = {
  'authentication/login/dologin': async ({ request }) => {
    const body = await request.text();
    const searchParams = new URLSearchParams(body);
    const loginInfoRaw = searchParams.get('LoginInfo');

    if (!loginInfoRaw) {
      return html(doLoginFailed());
    }

    try {
      const loginInfo = JSON.parse(loginInfoRaw);

      // Handle passkey login (Type: "PasskeyLogin")
      if (loginInfo.Type === 'PasskeyLogin') {
        const creds = loginInfo.Credentials;
        const matchedUser = findUserByPasskey(creds.rawId);
        if (matchedUser || acceptAny()) {
          const pk = matchedUser?.passkeys.find(p => p.rawId === creds.rawId);
          if (pk) {
            // Enforce the WebAuthn signature-counter rule like real MyChart.
            // Per WebAuthn §6.1.1: when the counter is in use (presented or
            // stored value is non-zero) each assertion must present a counter
            // strictly greater than the last one accepted — otherwise the
            // credential is replayed/stale/cloned and we reject it. When both
            // are 0 the authenticator doesn't implement a counter (e.g. some
            // platform authenticators), so we accept without enforcing. The
            // counter lives at byte offset 33 (after the 32-byte rpIdHash + 1
            // flags byte) of authenticatorData, big-endian.
            const presented = parseSignCount(creds.authenticatorAssertion?.authenticatorData);
            const usesCounter = (presented ?? 0) !== 0 || pk.signCount !== 0;
            if (usesCounter && (presented === null || presented <= pk.signCount)) {
              return html(doLoginFailed());
            }
            pk.signCount = Math.max(pk.signCount, presented ?? 0);
            pk.lastUsedInstant = new Date().toISOString();
          }
          const sessionId = createSession(matchedUser?.username ?? null);
          const response = getRequireTerms()
            ? html(termsConditionsPage())
            : html(doLoginSuccess());
          response.headers.set('Set-Cookie', sessionCookieHeader(sessionId));
          return response;
        }
        return html(doLoginFailed());
      }

      const creds = loginInfo.Credentials;
      // Support both Username and LoginIdentifier
      const userB64 = creds.Username || creds.LoginIdentifier || '';
      const passB64 = creds.Password || '';

      let user: string, pass: string;
      try {
        user = atob(userB64);
        pass = atob(passB64);
      } catch {
        return html(doLoginFailed());
      }

      const matchedUser = findUser(user);
      const validCreds = acceptAny()
        ? matchedUser ?? state.users.homer
        : (matchedUser && matchedUser.password === pass ? matchedUser : null);

      if (!validCreds) {
        return html(doLoginFailed());
      }

      // 2FA is required when the user is seeded to require it (e.g. marge)
      // or when the env-var override is set. Toggling totpEnabled at runtime
      // does NOT change login behavior — the CLI's --set-up-totp /
      // --disable-totp round-trip keeps working with username+password.
      const envRequire2fa = process.env.FAKE_MYCHART_REQUIRE_2FA === 'true';
      const require2fa = validCreds.requires2faAtLogin || envRequire2fa;
      if (require2fa) {
        // Create a session bound to the user so the subsequent /Validate call
        // knows whose TOTP profile to consult, but the front-end treats it
        // as un-authenticated until 2FA succeeds.
        const sessionId = createSession(validCreds.username);
        const response = html(doLoginNeed2FA());
        response.headers.set('Set-Cookie', sessionCookieHeader(sessionId));
        return response;
      }

      // Successful login without 2FA — create session and set cookie
      const sessionId = createSession(validCreds.username);
      // If terms are required, return the T&C page instead of the home page
      const response = getRequireTerms()
        ? html(termsConditionsPage())
        : html(doLoginSuccess());
      response.headers.set('Set-Cookie', sessionCookieHeader(sessionId));
      return response;

    } catch {
      return html(doLoginFailed());
    }
  },

  // ── Terms & Conditions acceptance ──────────────────────────────
  'authentication/termsconditions': ({ request }) => {
    acceptTerms(request.headers.get('cookie'));
    // Redirect to home after accepting
    return redirectTo(request, '/Home');
  },
};

export const authPostPatterns: readonly PatternRoute[] = [
  // ── 2FA ────────────────────────────────────────────────────────
  prefix('authentication/secondaryvalidation/sendcode', async ({ request }) => {
    const body = await request.text();
    const isEmail = body.includes('deliveryMethodEmail=true');
    const maskedEmail = 'ho***@springfield.net';
    const maskedPhone = '***-***-7890';
    const contact = isEmail ? maskedEmail : maskedPhone;
    return html(`Code sent to ${contact}`);
  }),

  prefix('authentication/secondaryvalidation/validate', async ({ request }) => {
    const body = await request.text();
    const submittedCode = new URLSearchParams(body).get('TwoFactorCode') ?? '';
    // Real MyChart validates a real TOTP code against the account's enrolled
    // secret, so a live code for the user's stored secret (marge seeds
    // JBSWY3DPEHPK3PXP) is accepted alongside the fixed test code — that's
    // what lets a client's silent re-login (stored TOTP secret → generated
    // code) be exercised end to end.
    const userSecret = currentUser(request)?.totpSecret ?? null;
    const totpValid = !!userSecret && verifyTotpCode(userSecret, submittedCode);
    if (submittedCode === '123456' || acceptAny() || totpValid) {
      // Preserve the username from the pending session so the post-2FA
      // session continues to know who's logged in (matters for per-user
      // TOTP/passkey state).
      const username = getSessionUsername(request.headers.get('cookie'));
      const sessionId = createSession(username);
      const response = json({ Success: true });
      response.headers.set('Set-Cookie', sessionCookieHeader(sessionId));
      return response;
    }
    return json({ Success: false, TwoFactorCodeFailReason: 'codewrong' });
  }),

  // ── Passkey Login Challenge ───────────────────────────────────
  // Returns the union of all registered passkeys across users so the client
  // can present any one of them; we identify the user during DoLogin by
  // looking up the chosen credential's rawId.
  prefix('authentication/login/getpasskeygetparams', () => {
    const challenge = crypto.randomBytes(32).toString('base64');
    const allPasskeys = Object.values(state.users).flatMap(u => u.passkeys);
    return json({
      Success: true,
      PasskeyGetParams: {
        Attestation: 'none',
        Challenge: challenge,
        RpId: '',
        Timeout: 60000,
        UserVerification: 'preferred',
        ExpirationInstantIso: `/Date(${Date.now() + 60000})/`,
        AllowCredentials: allPasskeys.map(pk => ({ id: pk.rawId, type: 'public-key' })),
      },
    });
  }),
];
