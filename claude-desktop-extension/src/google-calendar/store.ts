// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * What calendar sync keeps on disk, beside the MyChart credentials in
 * ~/.openrecord-mcpb:
 *   keystore item `google-calendar:refresh-token` (file fallback: google-calendar-token.json)
 *   google-calendar.json — not secret: the calendar id and how the last sync went,
 *                          which the menu-bar app and list_accounts both read.
 */

import * as fs from 'fs';
import * as path from 'path';

import { _paths } from '../credential-store';
import { clearSecret, readSecret, writeSecret, type FileSlot } from '../secret-store';

const STATE_PATH = path.join(_paths.ROOT, 'google-calendar.json');
const TOKEN_FILE = path.join(_paths.ROOT, 'google-calendar-token.json');
const TOKEN_KEY = 'google-calendar:refresh-token';

export interface AccountSyncResult {
  account: string;
  synced: number;
  removed: number;
  error?: string;
}

export interface LastSync {
  at: string;
  ok: boolean;
  synced: number;
  accounts: AccountSyncResult[];
}

export interface CalendarState {
  calendarId?: string;
  connectedAt?: string;
  lastSync?: LastSync;
}

export function readState(): CalendarState {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8')) as CalendarState;
  } catch {
    return {};
  }
}

export function writeState(state: CalendarState): void {
  fs.mkdirSync(_paths.ROOT, { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
  try { fs.chmodSync(STATE_PATH, 0o600); } catch { /* best effort */ }
}

export function clearState(): void {
  try { fs.unlinkSync(STATE_PATH); } catch { /* ignore */ }
}

const tokenSlot: FileSlot = {
  read() {
    try {
      return (JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf-8')) as { refreshToken?: string }).refreshToken || undefined;
    } catch {
      return undefined;
    }
  },
  write(secret) {
    fs.mkdirSync(_paths.ROOT, { recursive: true });
    fs.writeFileSync(TOKEN_FILE, JSON.stringify({ refreshToken: secret }));
    try { fs.chmodSync(TOKEN_FILE, 0o600); } catch { /* best effort */ }
  },
  clear() {
    try { fs.unlinkSync(TOKEN_FILE); } catch { /* ignore */ }
  },
};

export const readRefreshToken = (): string | undefined => readSecret(TOKEN_KEY, tokenSlot);
export const saveRefreshToken = (token: string): void => writeSecret(TOKEN_KEY, token, tokenSlot);
export const clearRefreshToken = (): void => clearSecret(TOKEN_KEY, tokenSlot);

