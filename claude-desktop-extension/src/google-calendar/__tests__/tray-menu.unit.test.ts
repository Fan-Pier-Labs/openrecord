// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { describe, expect, it } from 'bun:test';

import { accountLines, iconSymbol, isSyncDue, statusLines, stopNotice, SYNC_INTERVAL_MS } from '../tray-menu';

const now = new Date('2026-11-05T12:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
const lastSync = (at: string, ok = true) => ({ at, ok, synced: 2, accounts: [] });

describe('isSyncDue', () => {
  it('never syncs before Google is connected', () => {
    expect(isSyncDue({}, now)).toBe(false);
  });

  it('syncs when connected and never synced, or four hours have passed', () => {
    expect(isSyncDue({ connectedAt: ago(0) }, now)).toBe(true);
    expect(isSyncDue({ connectedAt: ago(0), lastSync: lastSync(ago(SYNC_INTERVAL_MS - 60_000)) }, now)).toBe(false);
    expect(isSyncDue({ connectedAt: ago(0), lastSync: lastSync(ago(SYNC_INTERVAL_MS)) }, now)).toBe(true);
  });
});

describe('menu text and icon', () => {
  it('says how the last sync went, with each failed account', () => {
    const state = {
      connectedAt: ago(0),
      lastSync: { at: ago(0), ok: false, synced: 1, accounts: [
        { account: 'a@b.org', synced: 1, removed: 0 },
        { account: 'c@d.org', synced: 0, removed: 0, error: 'Login failed' },
      ] },
    };
    const lines = statusLines(state, false);
    expect(lines[0]).toMatch(/^Last synced .* · 1 appointment$/);
    expect(lines[1]).toBe('⚠︎ c@d.org: Login failed');
    expect(iconSymbol(state, false)).toBe('exclamationmark.triangle');
    expect(iconSymbol({}, false)).toBe('cross.case');
  });

  it('shows syncing over everything else', () => {
    expect(statusLines({}, true)).toEqual(['Syncing…']);
    expect(iconSymbol({}, true)).toBe('arrow.triangle.2.circlepath');
    expect(statusLines({}, false)).toEqual(['Not connected. Ask Claude to connect Google Calendar.']);
  });
});


describe('retries and stopping', () => {
  const account = (error?: string, failures?: number, stopped?: true) =>
    ({ account: 'c@d.org', synced: 0, removed: 0, ...(error && { error }), ...(failures && { failures }), ...(stopped && { stopped }) });
  const run = (at: string, accounts: ReturnType<typeof account>[], extra: object = {}) =>
    ({ at, ok: accounts.every((a) => !a.error) && !('error' in extra), synced: 0, accounts, ...extra });

  it('retries a failure at the next four-hour mark, not sooner', () => {
    const failedAt = (ms: number) => ({ connectedAt: ago(0), lastSync: run(ago(ms), [account('Login failed', 1)]) });
    expect(isSyncDue(failedAt(SYNC_INTERVAL_MS - 60_000), now)).toBe(false);
    expect(isSyncDue(failedAt(SYNC_INTERVAL_MS), now)).toBe(true);
    const runFailedAt = (ms: number) => ({ connectedAt: ago(0), lastSync: run(ago(ms), [], { error: 'Offline.', failures: 1 }) });
    expect(isSyncDue(runFailedAt(SYNC_INTERVAL_MS - 60_000), now)).toBe(false);
    expect(isSyncDue(runFailedAt(SYNC_INTERVAL_MS), now)).toBe(true);
  });

  it('never schedules a sync after a run-level stop', () => {
    const stopped = { connectedAt: ago(0), lastSync: run(ago(SYNC_INTERVAL_MS * 10), [], { error: 'Google said no.', failures: 3, stopped: true }) };
    expect(isSyncDue(stopped, now)).toBe(false);
    expect(statusLines(stopped, false)[0]).toMatch(/^Sync stopped /);
  });

  it('says nothing until something has stopped', () => {
    expect(stopNotice(undefined)).toBeNull();
    expect(stopNotice(run(ago(0), [account('Login failed', 2)]))).toBeNull();
    expect(stopNotice(run(ago(0), [], { error: 'Offline.', failures: 2 }))).toBeNull();
  });

  it('names the account that stopped, and the menu says how to start it again', () => {
    const last = run(ago(0), [account('Login failed', 3, true)]);
    expect(stopNotice(last)).toMatchObject({ title: 'MyChart calendar sync stopped', body: 'c@d.org failed 3 times in a row: Login failed' });
    expect(statusLines({ connectedAt: ago(0), lastSync: last }, false)[1]).toContain('choose Sync Now to try again');
  });

  it('reports a run-level stop, like a revoked Google grant', () => {
    const notice = stopNotice(run(ago(0), [], { error: 'Google sign-in failed (invalid_grant).', failures: 3, stopped: true }));
    expect(notice?.body).toBe('Failed 3 times in a row: Google sign-in failed (invalid_grant). Choose Sync Now to try again.');
    expect(stopNotice(run(ago(0), [], { error: 'Network error', failures: 3, stopped: true }))?.body)
      .toBe('Failed 3 times in a row: Network error. Choose Sync Now to try again.');
  });

  it('keeps the same key while the same stop persists, so it is announced once', () => {
    const a = stopNotice(run(ago(SYNC_INTERVAL_MS), [account('Login failed', 3, true)]));
    const b = stopNotice(run(ago(0), [account('Login failed', 3, true)]));
    expect(a?.key).toBe(b?.key);
  });
});

describe('accountLines', () => {
  it('lists each connected account, or says there are none', () => {
    expect(accountLines(['a@b.org', 'c@d.org'])).toEqual(['a@b.org', 'c@d.org']);
    expect(accountLines([])).toEqual(['No MyChart accounts connected']);
  });
});
