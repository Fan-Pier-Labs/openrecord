// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * machineLogin / humanLogin against the fake-mychart server. marge is seeded to
 * hit 2FA on every password login, which is the one place the modes differ:
 * machine mode must stop there without posting SendCode, human mode must post
 * it and hand back a login that a code can finish.
 *
 * Every request goes through to the real server; the transport only records
 * the URL on the way. On Bun the cookie jar lives in scraperFetch, not the
 * transport, so this is the same network path the client takes.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'bun:test';
import { machineLogin, humanLogin } from '../loginModes';
import { complete2faFlow } from '../login';
import { setTestTransport } from '../../../http';
import { resetFakeMyChart } from '../../__tests__/fake-mychart/mountMode';

const HOST = process.env.FAKE_MYCHART_HOST ?? 'localhost:4000';
const MARGE_TOTP_SECRET = 'JBSWY3DPEHPK3PXP';

let urls: string[] = [];
const sentCode = () => urls.some((u) => u.includes('/SecondaryValidation/SendCode'));

beforeAll(async () => {
  process.env.MYCHART_CLI_TELEMETRY_DISABLED = '1';
  await resetFakeMyChart(HOST);
});

beforeEach(() => {
  urls = [];
  setTestTransport((url, init) => {
    urls.push(url);
    return globalThis.fetch(url, init);
  });
});

afterEach(() => {
  setTestTransport(null);
});

describe('machineLogin', () => {
  it('stops at the 2FA page with needs_human and never posts SendCode', async () => {
    const outcome = await machineLogin({ hostname: HOST, username: 'marge', password: 'donuts123', protocol: 'http' });
    expect(outcome.state).toBe('needs_human');
    expect(urls.some((u) => u.includes('/Authentication/Login/DoLogin'))).toBe(true);
    expect(sentCode()).toBe(false);
  });

  it('gets past 2FA with a stored TOTP secret, still without SendCode', async () => {
    const outcome = await machineLogin({
      hostname: HOST,
      username: 'marge',
      password: 'donuts123',
      totpSecret: MARGE_TOTP_SECRET,
      protocol: 'http',
    });
    expect(outcome.state).toBe('logged_in');
    expect(sentCode()).toBe(false);
  });

  it('signs in an account with no 2FA', async () => {
    const outcome = await machineLogin({ hostname: HOST, username: 'homer', password: 'donuts123', protocol: 'http' });
    expect(outcome.state).toBe('logged_in');
  });

  it('reports a wrong password as failed, not needs_human', async () => {
    const outcome = await machineLogin({ hostname: HOST, username: 'marge', password: 'wrong', protocol: 'http' });
    expect(outcome.state).toBe('failed');
  });
});

describe('humanLogin', () => {
  it('posts SendCode at the 2FA page and returns a login a code can finish', async () => {
    const outcome = await humanLogin({ hostname: HOST, username: 'marge', password: 'donuts123', protocol: 'http' });
    expect(outcome.state).toBe('need_2fa');
    expect(sentCode()).toBe(true);
    if (outcome.state !== 'need_2fa') return;

    // fake-mychart accepts 123456 as the code it "sent".
    const finished = await complete2faFlow({ mychartRequest: outcome.mychartRequest, code: '123456' });
    expect(finished.state).toBe('logged_in');
  });

  it('uses a stored TOTP secret instead of sending a code', async () => {
    const outcome = await humanLogin({
      hostname: HOST,
      username: 'marge',
      password: 'donuts123',
      totpSecret: MARGE_TOTP_SECRET,
      protocol: 'http',
    });
    expect(outcome.state).toBe('logged_in');
    expect(sentCode()).toBe(false);
  });

  it('reports a wrong password as invalid_login', async () => {
    const outcome = await humanLogin({ hostname: HOST, username: 'marge', password: 'wrong', protocol: 'http' });
    expect(outcome.state).toBe('invalid_login');
  });
});
