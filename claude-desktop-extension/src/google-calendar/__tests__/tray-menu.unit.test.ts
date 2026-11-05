// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { describe, expect, it } from 'bun:test';

import { iconSymbol, isSyncDue, statusLines, SYNC_INTERVAL_MS } from '../tray-menu';

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
