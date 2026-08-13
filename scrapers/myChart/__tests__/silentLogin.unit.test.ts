import { describe, it, expect, beforeAll, afterEach } from 'bun:test';
import { silentLogin, wireSilentReauthentication } from '../silentLogin';
import { MyChartRequest } from '../myChartRequest';
import { createCredential, type PasskeyCredential } from '../softwareAuthenticator';
import { setTestTransport } from '../../http';

// Drives the silent login ladder end to end against a scripted fake MyChart
// (setTestTransport), the same pattern as loginFlow.unit.test.ts. The ladder's
// job is ordering and classification — passkey first, then password, then a
// TOTP-secret 2FA — and each rung only shows up in which requests actually go
// out and which callback fires.

const HOST = 'mychart.example.com';
const TOKEN_INPUT = '<input name="__RequestVerificationToken" value="tok123" />';
const HOME_PAGE = '<html><body>MD_HOME_INDEX</body></html>';
const LOGIN_FAILED_PAGE = '<html><body>Login failed</body></html>';
const NEED_2FA_PAGE = `<html><body>secondaryvalidationcontroller${TOKEN_INPUT}</body></html>`;

type FakeServer = {
  /** How the server answers a passkey DoLogin. */
  passkeyLogin?: 'success' | 'invalid';
  /** How it answers a password DoLogin. */
  passwordLogin?: 'success' | 'need_2fa';
  /** Whether SecondaryValidation/Validate accepts the submitted code. */
  totpAccepted?: boolean;
};

function fakeMyChart(server: FakeServer) {
  const calls: string[] = [];
  setTestTransport(async (url: string, init: RequestInit): Promise<Response> => {
    calls.push(url);
    const body = init.body ? String(init.body) : '';

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
        return new Response(server.passkeyLogin === 'success' ? HOME_PAGE : LOGIN_FAILED_PAGE, { status: 200 });
      }
      return new Response(server.passwordLogin === 'need_2fa' ? NEED_2FA_PAGE : HOME_PAGE, { status: 200 });
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

beforeAll(() => {
  process.env.MYCHART_CLI_TELEMETRY_DISABLED = '1';
});

afterEach(() => {
  setTestTransport(null);
});

describe('silentLogin', () => {
  it('logs in with a passkey and reports the used credential for persistence', async () => {
    fakeMyChart({ passkeyLogin: 'success' });
    const credential = testCredential();
    let persisted: PasskeyCredential | null = null;

    const outcome = await silentLogin({
      hostname: HOST,
      passkey: credential,
      onPasskeyUsed: (cred) => { persisted = cred; },
    });

    expect(outcome.state).toBe('logged_in');
    expect(persisted).toBe(credential);
  });

  it('falls back to the password when the passkey is rejected, and reports it invalid', async () => {
    fakeMyChart({ passkeyLogin: 'invalid', passwordLogin: 'success' });
    let invalidated = false;

    const outcome = await silentLogin({
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
    const outcome = await silentLogin({ hostname: HOST });
    expect(outcome).toEqual({ state: 'failed', reason: 'no stored credentials' });
  });

  it('fails when 2FA is required and no TOTP secret is stored', async () => {
    fakeMyChart({ passwordLogin: 'need_2fa' });
    const outcome = await silentLogin({ hostname: HOST, username: 'homer', password: 'donuts123' });
    expect(outcome.state).toBe('failed');
    expect(outcome.state === 'failed' && outcome.reason).toContain('2FA required');
  });

  it('completes 2FA with a generated TOTP code', async () => {
    const { calls } = fakeMyChart({ passwordLogin: 'need_2fa', totpAccepted: true });
    const outcome = await silentLogin({
      hostname: HOST,
      username: 'homer',
      password: 'donuts123',
      totpSecret: 'JBSWY3DPEHPK3PXP',
    });
    expect(outcome.state).toBe('logged_in');
    expect(calls.some((url) => url.includes('/SecondaryValidation/Validate'))).toBe(true);
  });

  it('fails when the TOTP code is rejected', async () => {
    fakeMyChart({ passwordLogin: 'need_2fa', totpAccepted: false });
    const outcome = await silentLogin({
      hostname: HOST,
      username: 'homer',
      password: 'donuts123',
      totpSecret: 'JBSWY3DPEHPK3PXP',
    });
    expect(outcome.state).toBe('failed');
    expect(outcome.state === 'failed' && outcome.reason).toContain('TOTP code rejected');
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
    expect(renewedWith).toBe(request);
    expect(request.hostname).toBe(HOST);
    expect(request.firstPathPart).toBe('MyChart');
  });

  it('reports false when no silent path exists', async () => {
    fakeMyChart({ passwordLogin: 'need_2fa' });
    const request = new MyChartRequest(HOST);
    wireSilentReauthentication(request, () => ({ hostname: HOST, username: 'homer', password: 'donuts123' }));
    expect(await request.reauthenticate!()).toBe(false);
  });
});
