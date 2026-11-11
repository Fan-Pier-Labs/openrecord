// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { describe, expect, it } from 'bun:test';

import { failureNotice, iconSymbol, isSyncDue, statusLines, SYNC_INTERVAL_MS } from '../tray-menu';

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
    expect(iconSymbol(state, false)).toBe('calendar.badge.exclamationmark');
  });

  it('shows syncing over everything else', () => {
    expect(statusLines({}, true)).toEqual(['Syncing…']);
    expect(iconSymbol({}, true)).toBe('arrow.triangle.2.circlepath');
    expect(statusLines({}, false)).toEqual(['Not connected. Ask Claude to connect Google Calendar.']);
  });
});

describe('failureNotice', () => {
  const failed = (at: string, accounts: { account: string; error?: string }[]) => ({
    at, ok: false, synced: 0, accounts: accounts.map((a) => ({ ...a, synced: 0, removed: 0 })),
  });

  it('says nothing when the sync worked', () => {
    expect(failureNotice(undefined, lastSync(ago(0)))).toBeNull();
  });

  it('names the one account that failed', () => {
    const notice = failureNotice(undefined, failed(ago(0), [{ account: 'a@b.org' }, { account: 'c@d.org', error: 'Login failed' }]));
    expect(notice?.title).toBe('MyChart calendar sync failed');
    expect(notice?.body).toBe('c@d.org: Login failed');
  });

  it('lists several failed accounts', () => {
    const notice = failureNotice(undefined, failed(ago(0), [{ account: 'a@b.org', error: 'x' }, { account: 'c@d.org', error: 'y' }]));
    expect(notice?.body).toMatch(/^2 accounts could not sync: a@b\.org, c@d\.org\./);
  });

  it('reports a failure before any account, like a revoked Google grant', () => {
    const notice = failureNotice(undefined, { ...failed(ago(0), []), error: 'Google access was revoked' });
    expect(notice?.body).toBe('Google access was revoked');
    expect(statusLines({ connectedAt: ago(0), lastSync: { ...failed(ago(0), []), error: 'Google access was revoked' } }, false)[1])
      .toBe('⚠︎ Google access was revoked');
  });

  it('treats a run that recorded nothing as unfinished', () => {
    const before = lastSync(ago(SYNC_INTERVAL_MS));
    expect(failureNotice(before, before)?.key).toBe('unfinished');
    expect(failureNotice(undefined, undefined)?.key).toBe('unfinished');
  });

  it('gives the same failure the same key, so it is announced once', () => {
    const a = failureNotice(undefined, failed(ago(SYNC_INTERVAL_MS), [{ account: 'c@d.org', error: 'Login failed' }]));
    const b = failureNotice(undefined, failed(ago(0), [{ account: 'c@d.org', error: 'Login failed' }]));
    const c = failureNotice(undefined, failed(ago(0), [{ account: 'c@d.org', error: 'Something else' }]));
    expect(a?.key).toBe(b?.key);
    expect(c?.key).not.toBe(a?.key);
  });
});
