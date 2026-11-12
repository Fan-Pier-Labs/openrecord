// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * machineLogin / humanLogin against the fake-mychart server. marge is seeded to
 * hit 2FA on every password login, which is the one place the modes differ:
 * machine mode must stop there without making the server send a code, human
 * mode must send exactly one and hand back a login that code can finish.
 *
 * "Sent" is read from fake-mychart's outbox, where every SendCode delivers a
 * fresh code instead of texting or emailing it. That is the server's own
 * record, so it holds however the client got there.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { machineLogin, humanLogin } from '../loginModes';
import { complete2faFlow } from '../login';
import { resetFakeMyChart } from '../../__tests__/fake-mychart/mountMode';
import { readOutbox } from '../../__tests__/fake-mychart/outbox';

const HOST = process.env.FAKE_MYCHART_HOST ?? 'localhost:4000';
const MARGE_TOTP_SECRET = 'JBSWY3DPEHPK3PXP';

const margesCodes = () => readOutbox(HOST, 'marge');

beforeEach(async () => {
  process.env.MYCHART_CLI_TELEMETRY_DISABLED = '1';
  await resetFakeMyChart(HOST);
});

describe('machineLogin', () => {
  it('stops at the 2FA page with needs_human, and no code is sent', async () => {
    const outcome = await machineLogin({ hostname: HOST, username: 'marge', password: 'donuts123', protocol: 'http' });
    expect(outcome.state).toBe('needs_human');
    expect(await margesCodes()).toEqual([]);
  });

  it('gets past 2FA with a stored TOTP secret, and no code is sent', async () => {
    const outcome = await machineLogin({
      hostname: HOST,
      username: 'marge',
      password: 'donuts123',
      totpSecret: MARGE_TOTP_SECRET,
      protocol: 'http',
    });
    expect(outcome.state).toBe('logged_in');
    expect(await margesCodes()).toEqual([]);
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
  it('sends exactly one code at the 2FA page, and that code finishes the sign-in', async () => {
    const outcome = await humanLogin({ hostname: HOST, username: 'marge', password: 'donuts123', protocol: 'http' });
    expect(outcome.state).toBe('need_2fa');
    if (outcome.state !== 'need_2fa') return;

    const sent = await margesCodes();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.channel).toBe(outcome.delivery!.method);

    // Read off the "phone", exactly as the patient would type it in.
    const finished = await complete2faFlow({ mychartRequest: outcome.mychartRequest, code: sent[0]!.code });
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
    expect(await margesCodes()).toEqual([]);
  });

  it('reports a wrong password as invalid_login', async () => {
    const outcome = await humanLogin({ hostname: HOST, username: 'marge', password: 'wrong', protocol: 'http' });
    expect(outcome.state).toBe('invalid_login');
  });
});
