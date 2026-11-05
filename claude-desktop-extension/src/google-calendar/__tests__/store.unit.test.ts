// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { beforeEach, describe, expect, it } from 'bun:test';
import * as os from 'node:os';
import path from 'node:path';

import * as memfs from '../../__tests__/memfs';

const store = await import('../store');
const ROOT = path.join(os.homedir(), '.openrecord-mcpb');

beforeEach(() => memfs.reset());

describe('calendar state', () => {
  it('is empty until written, round-trips, is private, and clears', () => {
    expect(store.readState()).toEqual({});
    store.writeState({ calendarId: 'cal', connectedAt: '2026-11-05T00:00:00Z' });
    expect(store.readState()).toEqual({ calendarId: 'cal', connectedAt: '2026-11-05T00:00:00Z' });
    expect(memfs.modeOf(path.join(ROOT, 'google-calendar.json'))).toBe(0o600);
    store.clearState();
    expect(store.readState()).toEqual({});
    store.clearState();
  });

  it('reads a corrupt file as no state rather than throwing', () => {
    memfs.put(path.join(ROOT, 'google-calendar.json'), '{not json');
    expect(store.readState()).toEqual({});
  });
});

describe('refresh token', () => {
  it('saves to a private file when there is no keystore, reads back, and clears', () => {
    expect(store.readRefreshToken()).toBeUndefined();
    store.saveRefreshToken('refresh-1');
    expect(store.readRefreshToken()).toBe('refresh-1');
    expect(memfs.modeOf(path.join(ROOT, 'google-calendar-token.json'))).toBe(0o600);
    store.clearRefreshToken();
    expect(store.readRefreshToken()).toBeUndefined();
    store.clearRefreshToken();
  });
});
