// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { describe, it, expect, beforeAll, afterEach } from 'bun:test';
import { machineLogin, humanLogin, wireSilentReauthentication } from '../loginModes';
import { MyChartRequest } from '../../core/myChartRequest';
import { createCredential, type PasskeyCredential } from '../softwareAuthenticator';
import { setTestTransport } from '../../../http';

// Drives the login ladder end to end against a scripted fake MyChart
// (setTestTransport), the same pattern as loginFlow.unit.test.ts. The ladder's
// job is ordering and classification — passkey first, then password, then a
// TOTP-secret 2FA — and each rung only shows up in which requests actually go
// out and which callback fires. The two modes differ in one request:
// SendCode, which makes MyChart text or email the user. Machine mode must
// never send it.

const HOST = 'mychart.example.com';
const TOKEN_INPUT = '<input name="__RequestVerificationToken" value="tok123" />';
const HOME_PAGE = '<html><body>MD_HOME_INDEX</body></html>';
const LOGIN_FAILED_PAGE = '<html><body>Login failed</body></html>';
const NEED_2FA_PAGE = `<html><body>secondaryvalidationcontroller${TOKEN_INPUT}</body></html>`;

type FakeServer = {
  /** How the server answers a passkey DoLogin. `throw` is a network failure. */
  passkeyLogin?: 'success' | 'invalid' | 'throw';
  /** How it answers a password DoLogin. */
  passwordLogin?: 'success' | 'need_2fa' | 'invalid';
  /** Whether SecondaryValidation/Validate accepts the submitted code. */
  totpAccepted?: boolean;
};

function fakeMyChart(server: FakeServer) {
  const calls: string[] = [];
  setTestTransport(async (url: string, init: RequestInit): Promise<Response> => {
    calls.push(url);
    const body = typeof init.body === 'string' ? init.body : '';

    if (url === `https://${HOST}` || url === `https://${HOST}/`) {
      return new Response('', { status: 302, headers: { Location: '/MyChart/' } });
    }
    if (url.includes('loginpagecontroller')) {
      return new Response('', { status: 200 });
    }
    if (url.endsWith('/Authentication/Login')) {
      return new Response(TOKEN_INPUT, { status: 200 });
    }
    if (url.includes('/Authentication/Login/GetPasskeyGetParams')) {
      return Response.json({
        Success: true,
        PasskeyGetParams: {
          Challenge: Buffer.from('challenge-bytes').toString('base64'),
          Attestation: 'none',
          Timeout: 60000,
          UserVerification: 'preferred',
          RpId: '',
        },
      });
    }
    if (url.includes('/Authentication/Login/DoLogin')) {
      const isPasskey = decodeURIComponent(body).includes('PasskeyLogin');
      if (isPasskey) {
        if (server.passkeyLogin === 'throw') throw new Error('network down');
        return new Response(server.passkeyLogin === 'success' ? HOME_PAGE : LOGIN_FAILED_PAGE, { status: 200 });
      }
      if (server.passwordLogin === 'need_2fa') return new Response(NEED_2FA_PAGE, { status: 200 });
      if (server.passwordLogin === 'invalid') return new Response(LOGIN_FAILED_PAGE, { status: 200 });
      return new Response(HOME_PAGE, { status: 200 });
    }
    if (url.includes('/SecondaryValidation/GetSMSConsentStrings')) {
      return new Response('{}', { status: 200 });
    }
    if (url.includes('/SecondaryValidation/SendCode')) {
      return Response.json({ Success: true });
    }
    if (url.includes('/SecondaryValidation/Validate')) {
      return Response.json(
        server.totpAccepted
          ? { Success: true }
          : { Success: false, TwoFactorCodeFailReason: 'codewrong' },
      );
    }
    if (url.endsWith('/Authentication/SecondaryValidation')) {
      return new Response(TOKEN_INPUT, { status: 200 });
    }
    if (url.includes('inside.asp')) {
      return new Response('<html><body>home</body></html>', { status: 200 });
    }
    return new Response('', { status: 404 });
  });
  return { calls };
}

function testCredential(): PasskeyCredential {
  const registration = createCredential(
    {
      rp: { id: '', name: 'Test MyChart' },
      attestation: 'none',
      authenticatorSelection: { requireResidentKey: true, residentKey: 'required', userVerification: 'preferred' },
      challenge: Buffer.from('registration-challenge').toString('base64'),
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      timeout: 60000,
      user: { id: Buffer.from('user-id').toString('base64'), name: 'homer', displayName: 'Homer' },
      excludeCredentials: [],
    },
    `https://${HOST}`,
  );
  return registration.credential;
}

const sentCode = (calls: string[]) => calls.some((url) => url.includes('/SecondaryValidation/SendCode'));

beforeAll(() => {
  process.env.MYCHART_CLI_TELEMETRY_DISABLED = '1';
});

afterEach(() => {
  setTestTransport(null);
});

describe('machineLogin', () => {
  it('logs in with a passkey and reports the used credential for persistence', async () => {
    fakeMyChart({ passkeyLogin: 'success' });
    const credential = testCredential();
    let persisted: PasskeyCredential | null = null;

    const outcome = await machineLogin({
      hostname: HOST,
      passkey: credential,
      onPasskeyUsed: (cred) => { persisted = cred; },
    });

    expect(outcome.state).toBe('logged_in');
    // The assertion cast defeats TS narrowing `persisted` to its initializer:
    // the assignment happens inside the onPasskeyUsed callback.
    expect(persisted as PasskeyCredential | null).toBe(credential);
  });

  it('falls back to the password when the passkey is rejected, and reports it invalid', async () => {
    fakeMyChart({ passkeyLogin: 'invalid', passwordLogin: 'success' });
    let invalidated = false;

    const outcome = await machineLogin({
      hostname: HOST,
      username: 'homer',
      password: 'donuts123',
      passkey: testCredential(),
      onPasskeyInvalid: () => { invalidated = true; },
    });

    expect(outcome.state).toBe('logged_in');
    // The counter retry ran its course first, so this is a genuine rejection,
    // not a signature-counter desync.
    expect(invalidated).toBe(true);
  });

  it('fails honestly when there are no stored credentials', async () => {
    fakeMyChart({});
    const outcome = await machineLogin({ hostname: HOST });
    expect(outcome).toEqual({ state: 'failed', reason: 'no stored credentials' });
  });

  it('reports needs_human, without sending a code, when 2FA is required and no TOTP secret is stored', async () => {
    const { calls } = fakeMyChart({ passwordLogin: 'need_2fa' });
    const outcome = await machineLogin({ hostname: HOST, username: 'homer', password: 'donuts123' });
    expect(outcome.state).toBe('needs_human');
    expect(sentCode(calls)).toBe(false);
  });

  it('never sends a code when a passkey login fails on the network and the password hits 2FA', async () => {
    const { calls } = fakeMyChart({ passkeyLogin: 'throw', passwordLogin: 'need_2fa' });
    const outcome = await machineLogin({
      hostname: HOST,
      username: 'homer',
      password: 'donuts123',
      passkey: testCredential(),
    });
    expect(outcome.state).toBe('needs_human');
    expect(sentCode(calls)).toBe(false);
  });

  it('completes 2FA with a generated TOTP code', async () => {
    const { calls } = fakeMyChart({ passwordLogin: 'need_2fa', totpAccepted: true });
    const outcome = await machineLogin({
      hostname: HOST,
      username: 'homer',
      password: 'donuts123',
      totpSecret: 'JBSWY3DPEHPK3PXP',
    });
    expect(outcome.state).toBe('logged_in');
    expect(calls.some((url) => url.includes('/SecondaryValidation/Validate'))).toBe(true);
    expect(sentCode(calls)).toBe(false);
  });

  it('fails when the TOTP code is rejected', async () => {
    fakeMyChart({ passwordLogin: 'need_2fa', totpAccepted: false });
    const outcome = await machineLogin({
      hostname: HOST,
      username: 'homer',
      password: 'donuts123',
      totpSecret: 'JBSWY3DPEHPK3PXP',
    });
    expect(outcome.state).toBe('failed');
    expect(outcome.state === 'failed' && outcome.reason).toContain('TOTP code rejected');
  });

  it('logs in with username and password when no passkey is stored', async () => {
    fakeMyChart({ passwordLogin: 'success' });
    const outcome = await machineLogin({ hostname: HOST, username: 'homer', password: 'donuts123' });
    expect(outcome.state).toBe('logged_in');
  });

  it('surfaces a rejected password as a login failure, not as a missing credential', async () => {
    // The two read very differently to a client deciding what to do next:
    // "no stored credentials" means ask for them, a rejection means the ones
    // already stored are wrong.
    fakeMyChart({ passwordLogin: 'invalid' });
    const outcome = await machineLogin({ hostname: HOST, username: 'homer', password: 'wrong' });
    expect(outcome.state).toBe('failed');
    expect((outcome as { reason: string }).reason).toContain('login failed');
  });
});

describe('humanLogin', () => {
  it('sends a code and hands back the pending login when 2FA is required and no TOTP secret is stored', async () => {
    const { calls } = fakeMyChart({ passwordLogin: 'need_2fa' });
    const outcome = await humanLogin({ hostname: HOST, username: 'homer', password: 'donuts123' });
    expect(outcome.state).toBe('need_2fa');
    expect(sentCode(calls)).toBe(true);
    // The caller finishes this login with complete2faFlow, so it needs the
    // half-finished request, not a fresh one.
    expect(outcome.state === 'need_2fa' && outcome.mychartRequest).toBeInstanceOf(MyChartRequest);
  });

  it('uses a stored TOTP secret instead of sending a code', async () => {
    const { calls } = fakeMyChart({ passwordLogin: 'need_2fa', totpAccepted: true });
    const outcome = await humanLogin({
      hostname: HOST,
      username: 'homer',
      password: 'donuts123',
      totpSecret: 'JBSWY3DPEHPK3PXP',
    });
    expect(outcome.state).toBe('logged_in');
    expect(sentCode(calls)).toBe(false);
  });

  it('logs in with a passkey without touching the password', async () => {
    const { calls } = fakeMyChart({ passkeyLogin: 'success', passwordLogin: 'need_2fa' });
    const outcome = await humanLogin({
      hostname: HOST,
      username: 'homer',
      password: 'donuts123',
      passkey: testCredential(),
    });
    expect(outcome.state).toBe('logged_in');
    expect(sentCode(calls)).toBe(false);
  });

  it('reports a rejected password as invalid_login', async () => {
    fakeMyChart({ passwordLogin: 'invalid' });
    const outcome = await humanLogin({ hostname: HOST, username: 'homer', password: 'wrong' });
    expect(outcome.state).toBe('invalid_login');
  });
});

describe('wireSilentReauthentication', () => {
  it('adopts the fresh session onto the same request object and re-persists', async () => {
    fakeMyChart({ passwordLogin: 'success' });
    const request = new MyChartRequest('stale.example.org');
    let renewedWith: MyChartRequest | null = null;

    wireSilentReauthentication(
      request,
      () => ({ hostname: HOST, username: 'homer', password: 'donuts123' }),
      (renewed) => { renewedWith = renewed; },
    );

    expect(await request.reauthenticate!()).toBe(true);
    // The login discovered the real host + mount and the hook adopted them in
    // place — the object identity everyone holds references to is unchanged.
    expect(renewedWith as MyChartRequest | null).toBe(request);
    expect(request.hostname).toBe(HOST);
    expect(request.firstPathPart).toBe('MyChart');
  });

  it('reports false, without sending a code, when no silent path exists', async () => {
    const { calls } = fakeMyChart({ passwordLogin: 'need_2fa' });
    const request = new MyChartRequest(HOST);
    wireSilentReauthentication(request, () => ({ hostname: HOST, username: 'homer', password: 'donuts123' }));
    expect(await request.reauthenticate!()).toBe(false);
    expect(sentCode(calls)).toBe(false);
  });

  it('re-reads the credentials at renewal time, not at wiring time', async () => {
    // A passkey registered mid-session, or a password the user just changed,
    // has to be picked up by the next renewal — which is why getParams is a
    // callback rather than a value captured when the hook was wired.
    fakeMyChart({ passwordLogin: 'success' });
    const request = new MyChartRequest(HOST);
    let stored: { username?: string; password?: string } = {};
    wireSilentReauthentication(request, () => ({ hostname: HOST, ...stored }));

    expect(await request.reauthenticate!()).toBe(false);
    stored = { username: 'homer', password: 'donuts123' };
    expect(await request.reauthenticate!()).toBe(true);
  });
});
