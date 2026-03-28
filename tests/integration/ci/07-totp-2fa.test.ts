/**
 * Tests BetterAuth app-level TOTP 2FA (not MyChart portal 2FA).
 *
 * Flow: enable TOTP → extract secret → verify setup → sign out →
 * sign in (gets twoFactorRedirect) → submit TOTP code → disable 2FA.
 */

import { describe, it, expect } from 'bun:test';
import { BASE_URL } from './helpers';
import { generateTotpCode, parseTotpUri } from '../../../scrapers/myChart/totp';

const TEST_EMAIL = `ci-test-${Date.now()}@example.com`;
const TEST_PASSWORD = 'TestPassword123!';
const TEST_NAME = 'CI 2FA Test User';

// This test creates its own user to avoid interfering with other tests
describe('App-level TOTP 2FA', () => {
  let totpSecret = '';
  let userCookies = '';

  it('creates a dedicated user for 2FA testing', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD, name: TEST_NAME }),
      redirect: 'manual',
    });
    expect(res.status).toBe(200);

    // Extract cookies
    const setCookies = res.headers.getSetCookie?.() ?? [];
    userCookies = setCookies.map((h: string) => h.split(';')[0]).join('; ');
    expect(userCookies).toContain('better-auth.session_token');
  });

  it('enables TOTP 2FA', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/two-factor/enable`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: userCookies,
        Origin: BASE_URL,
      },
      body: JSON.stringify({ password: TEST_PASSWORD }),
      redirect: 'manual',
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.totpURI).toBeDefined();
    expect(body.totpURI).toContain('otpauth://totp/');
    expect(body.backupCodes).toBeDefined();
    expect(Array.isArray(body.backupCodes)).toBe(true);
    expect(body.backupCodes.length).toBeGreaterThan(0);

    // Extract secret from URI
    const parsed = parseTotpUri(body.totpURI);
    totpSecret = parsed.secret;
    expect(totpSecret).toBeTruthy();

    // Update cookies if new ones were set
    const setCookies = res.headers.getSetCookie?.() ?? [];
    if (setCookies.length > 0) {
      userCookies = setCookies.map((h: string) => h.split(';')[0]).join('; ');
    }
  });

  it('verifies TOTP setup with a generated code', async () => {
    const code = await generateTotpCode(totpSecret);

    const res = await fetch(`${BASE_URL}/api/auth/two-factor/verify-totp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: userCookies,
        Origin: BASE_URL,
      },
      body: JSON.stringify({ code }),
      redirect: 'manual',
    });
    expect(res.status).toBe(200);

    // Update cookies
    const setCookies = res.headers.getSetCookie?.() ?? [];
    if (setCookies.length > 0) {
      userCookies = setCookies.map((h: string) => h.split(';')[0]).join('; ');
    }
  });

  it('sign-in requires 2FA after enabling', async () => {
    // Sign out first
    await fetch(`${BASE_URL}/api/auth/sign-out`, {
      method: 'POST',
      headers: { Cookie: userCookies, Origin: BASE_URL },
      redirect: 'manual',
    });

    // Sign in — should get twoFactorRedirect
    const res = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
      redirect: 'manual',
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.twoFactorRedirect).toBe(true);

    // Save cookies from partial sign-in
    const setCookies = res.headers.getSetCookie?.() ?? [];
    if (setCookies.length > 0) {
      userCookies = setCookies.map((h: string) => h.split(';')[0]).join('; ');
    }
  });

  it('completes sign-in with TOTP code', async () => {
    const code = await generateTotpCode(totpSecret);

    const res = await fetch(`${BASE_URL}/api/auth/two-factor/verify-totp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: userCookies,
        Origin: BASE_URL,
      },
      body: JSON.stringify({ code }),
      redirect: 'manual',
    });
    expect(res.status).toBe(200);

    // Update cookies
    const setCookies = res.headers.getSetCookie?.() ?? [];
    if (setCookies.length > 0) {
      userCookies = setCookies.map((h: string) => h.split(';')[0]).join('; ');
    }

    // Verify we're now authenticated
    const sessionRes = await fetch(`${BASE_URL}/api/mcp-key`, {
      headers: { Cookie: userCookies, Origin: BASE_URL },
      redirect: 'manual',
    });
    expect(sessionRes.status).toBe(200);
  });

  it('disables TOTP 2FA', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/two-factor/disable`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: userCookies,
        Origin: BASE_URL,
      },
      body: JSON.stringify({ password: TEST_PASSWORD }),
      redirect: 'manual',
    });
    expect(res.status).toBe(200);
  });

  it('sign-in no longer requires 2FA after disabling', async () => {
    // Sign out
    await fetch(`${BASE_URL}/api/auth/sign-out`, {
      method: 'POST',
      headers: { Cookie: userCookies, Origin: BASE_URL },
      redirect: 'manual',
    });

    // Sign in — should succeed directly without twoFactorRedirect
    const res = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
      redirect: 'manual',
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.twoFactorRedirect).toBeFalsy();
    expect(body.user).toBeDefined();
  });
});
