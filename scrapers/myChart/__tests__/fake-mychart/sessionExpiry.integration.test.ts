/**
 * Session-expiry behavior against fake-mychart.
 *
 * Covers both halves of the expired-session story:
 *  - Fidelity: fake-mychart enforces sessions on its whole post-login surface
 *    the way real MyChart does (302 → login page, keepalive answers "0"), so
 *    an expiry regression is actually observable in CI.
 *  - Scraper behavior: makeAuthenticatedRequest renews expired sessions
 *    through the reauthenticate hook (once, no matter how many requests are in
 *    flight), restores the active proxy patient after the re-login resets it,
 *    and surfaces SessionExpiredError — never a fake-empty result — when no
 *    silent path exists.
 *
 * Requires fake-mychart running on localhost:4000 (see fake-mychart.test.ts).
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import type { MyChartRequest } from '../../core/myChartRequest';
import { myChartUserPassLogin } from '../../auth/login';
import { makeAuthenticatedRequest, SessionExpiredError } from '../../core/makeAuthenticatedRequest';
import { wireSilentReauthentication } from '../../auth/silentLogin';
import { sessionStore } from '../../core/sessionStore';
import { getAllergies } from '../../chart/allergies';
import { getMedications } from '../../chart/medications';
import { getImmunizations } from '../../chart/immunizations';
import { switchProxyTarget, verifyActiveProxyTarget } from '../../proxy/proxyContext';
import { setMountMode } from './mountMode';

const HOST = process.env.FAKE_MYCHART_HOST ?? 'localhost:4000';

async function invalidateAllSessions(): Promise<void> {
  const res = await fetch(`http://${HOST}/api/invalidate-sessions`, { method: 'POST' });
  expect(res.ok).toBe(true);
}

async function loginHomer(): Promise<MyChartRequest> {
  const result = await myChartUserPassLogin({ hostname: HOST, user: 'homer', pass: 'donuts123', protocol: 'http' });
  expect(result.state).toBe('logged_in');
  return result.mychartRequest;
}

/** Wire a hook that re-logs-in as homer and counts how often it ran. */
function wireCountingHook(session: MyChartRequest): { calls: () => number } {
  let calls = 0;
  session.reauthenticate = async () => {
    calls++;
    const fresh = await loginHomer();
    session.adoptStateFrom(fresh);
    return true;
  };
  return { calls: () => calls };
}

describe('fake-mychart session enforcement (fidelity)', () => {
  beforeAll(async () => {
    await setMountMode(HOST, 'prefixed');
  });

  it('bounces an unauthenticated API POST to the login page like real MyChart', async () => {
    // The request carries a CSRF token header, like every scraper request
    // whose session dies mid-scrape: CSRF passes, authentication fails, and
    // THAT is the login bounce makeAuthenticatedRequest detects.
    const res = await fetch(`http://${HOST}/MyChart/api/allergies/LoadAllergies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', '__RequestVerificationToken': 'tok-test' },
      body: '{}',
      redirect: 'manual',
    });
    expect(res.status).toBe(302);
    expect(res.headers.get('location') ?? '').toContain('/Authentication/Login');

    // Followed (what a scraper's redirect-following actually sees): a 200 HTML
    // login page, which is precisely why .json() used to throw on real MyChart.
    const followed = await fetch(`http://${HOST}/MyChart/api/allergies/LoadAllergies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', '__RequestVerificationToken': 'tok-test' },
      body: '{}',
    });
    expect(followed.status).toBe(200);
    expect(followed.headers.get('content-type') ?? '').toContain('text/html');
  });

  it('rejects an API POST with no CSRF token via the FiveHundred dance, before auth', async () => {
    // Observed on the two November 2025 instances: a token-less API POST — even a
    // fully unauthenticated one — is bounced to /Home/FiveHundred, NOT to the
    // login page. Only token-carrying requests reach the auth check.
    const res = await fetch(`http://${HOST}/MyChart/api/allergies/LoadAllergies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      redirect: 'manual',
    });
    expect(res.status).toBe(302);
    expect(res.headers.get('location') ?? '').toContain('/Home/FiveHundred');

    // The FiveHundred page 302s on to /Home/Error?code=14, a 200 error page.
    const followed = await fetch(`http://${HOST}/MyChart/api/allergies/LoadAllergies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(followed.status).toBe(200);
    expect(followed.url).toContain('/Home/Error');
  });

  it('answers an unknown /api/* path with the FourOhFour dance', async () => {
    const session = await loginHomer();
    const res = await session.makeRequest({
      path: '/api/this-endpoint-does-not-exist',
      followRedirects: false,
    });
    expect(res.status).toBe(302);
    expect(res.headers.get('location') ?? '').toContain('/Home/FourOhFour');
  });

  it('bounces unauthenticated page GETs to the login page', async () => {
    const res = await fetch(`http://${HOST}/MyChart/Clinical/Allergies`, { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location') ?? '').toContain('/Authentication/Login');
  });

  it('answers keepalive pings with "1" for a live session and "0" without one', async () => {
    const dead = await fetch(`http://${HOST}/MyChart/Home/KeepAlive`);
    expect((await dead.text()).trim()).toBe('0');

    const session = await loginHomer();
    const alive = await session.makeRequest({ path: '/Home/KeepAlive', followRedirects: false });
    expect((await alive.text()).trim()).toBe('1');
  });
});

describe('expired-session handling in the scrapers', () => {
  beforeAll(async () => {
    await setMountMode(HOST, 'prefixed');
  });

  afterAll(() => {
    sessionStore.stopKeepalive();
  });

  it('throws SessionExpiredError — not an empty result — when no reauthenticate hook is wired', async () => {
    const session = await loginHomer();
    await invalidateAllSessions();
    // Before the wrapper, this exact call returned { allergies: [], allergiesStatus: -1 }:
    // the login page carries its own __RequestVerificationToken, so the token
    // guard never fired and an expired session rendered as "no allergies".
    await expect(getAllergies(session)).rejects.toBeInstanceOf(SessionExpiredError);
    sessionStore.unregister(session);
  });

  it('renews transparently through the hook and returns real data', async () => {
    const session = await loginHomer();
    const hook = wireCountingHook(session);
    await invalidateAllSessions();

    const result = await getAllergies(session);
    expect(result.allergies.map((a) => a.name)).toContain('Vegetables');
    expect(hook.calls()).toBe(1);
    sessionStore.unregister(session);
  });

  it('renews exactly once when several scrapers hit the expired session concurrently', async () => {
    const session = await loginHomer();
    const hook = wireCountingHook(session);
    await invalidateAllSessions();

    const [allergies, medications, immunizations] = await Promise.all([
      getAllergies(session),
      getMedications(session),
      getImmunizations(session),
    ]);
    expect(allergies.allergies.length).toBeGreaterThan(0);
    expect(medications.medications.length).toBeGreaterThan(0);
    expect(immunizations.length).toBeGreaterThan(0);
    expect(hook.calls()).toBe(1);
    sessionStore.unregister(session);
  });

  it('renews via wireSilentReauthentication end to end (password path)', async () => {
    const session = await loginHomer();
    let renewed = 0;
    wireSilentReauthentication(
      session,
      () => ({ hostname: HOST, username: 'homer', password: 'donuts123', protocol: 'http' }),
      () => { renewed++; },
    );
    await invalidateAllSessions();

    const result = await getAllergies(session);
    expect(result.allergies.length).toBeGreaterThan(0);
    expect(renewed).toBe(1);
    sessionStore.unregister(session);
  });

  it('renews via wireSilentReauthentication with a TOTP secret (2FA account)', async () => {
    const login = await myChartUserPassLogin({ hostname: HOST, user: 'marge', pass: 'donuts123', protocol: 'http', skipSendCode: true });
    expect(login.state).toBe('need_2fa');
    const { complete2faFlow } = await import('../../auth/login');
    const twoFa = await complete2faFlow({ mychartRequest: login.mychartRequest, code: '123456', isTOTP: true });
    expect(twoFa.state).toBe('logged_in');
    const session = twoFa.mychartRequest;

    wireSilentReauthentication(session, () => ({
      hostname: HOST,
      username: 'marge',
      password: 'donuts123',
      // The fake accepts any 6-digit TOTP code, so any valid base32 secret works.
      totpSecret: 'JBSWY3DPEHPK3PXP',
      protocol: 'http',
    }));
    await invalidateAllSessions();

    const result = await getMedications(session);
    expect(Array.isArray(result.medications)).toBe(true);
    sessionStore.unregister(session);
  });

  it('restores the active proxy patient after renewal — never the account holder\'s chart', async () => {
    const session = await loginHomer();
    const hook = wireCountingHook(session);

    await switchProxyTarget(session, { displayName: 'Bart Simpson' });
    expect(session.activeProxyTarget?.displayName).toBe('Bart Simpson');

    await invalidateAllSessions();

    // Re-login resets fake-mychart's (and real MyChart's) active record to the
    // account holder. If renewal didn't restore the switch, this would return
    // Homer's 'Vegetables' allergy — the exact wrong-patient failure the
    // restore exists to prevent.
    const result = await getAllergies(session);
    expect(result.allergies.map((a) => a.name)).toEqual(['Penicillin']);
    expect(hook.calls()).toBe(1);

    const verified = await verifyActiveProxyTarget(session);
    expect(verified.selectedTarget?.displayName).toBe('Bart Simpson');

    await switchProxyTarget(session, { self: true });
    sessionStore.unregister(session);
  });

  it('proactively renews from the keepalive when a heartbeat reports the session dead', async () => {
    const session = await loginHomer();
    const hook = wireCountingHook(session);
    sessionStore.registerForKeepalive(session);
    await invalidateAllSessions();

    await sessionStore.runKeepalive();

    const entry = [...sessionStore.all().values()].find((e) => e.request === session);
    expect(entry?.status).toBe('logged_in');
    expect(hook.calls()).toBe(1);

    // And the renewed session actually works without another renewal.
    const result = await getAllergies(session);
    expect(result.allergies.length).toBeGreaterThan(0);
    expect(hook.calls()).toBe(1);
    sessionStore.unregister(session);
  });

  it('autoRenew: false surfaces the expiry instead of renewing', async () => {
    const session = await loginHomer();
    wireCountingHook(session);
    await invalidateAllSessions();

    await expect(
      makeAuthenticatedRequest(session, { path: '/Clinical/Allergies' }, { autoRenew: false }),
    ).rejects.toBeInstanceOf(SessionExpiredError);
    sessionStore.unregister(session);
  });
});
