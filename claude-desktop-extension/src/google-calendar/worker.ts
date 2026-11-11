// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

// stdout carries exactly one JSON line (the result the menu-bar app and the
// MCPB parse), so every log goes to stderr — set before any scraper loads.
import { setLogSink } from '../../../shared/logger';
setLogSink((level, args) => {
  process.stderr.write(`[${level}] ` + args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ') + '\n');
});

/**
 * `openrecord-calendar`: Google Calendar sync as one self-contained binary,
 * compiled with `bun build --compile --aot` (scripts/build-calendar-applet.ts),
 * so it runs the extension's own TypeScript — the same scrapers, credential
 * store and passkeys — with no Node install.
 *
 *   openrecord-calendar tray        the menu-bar item (what the LaunchAgent starts at login)
 *   openrecord-calendar connect     Google consent in the browser; creates the calendar
 *   openrecord-calendar sync        one sync pass over every saved MyChart account
 *   openrecord-calendar disconnect  revoke Google access and forget the token
 *
 * All but `tray` print one JSON object to stdout and exit 0 on success, 1 on failure.
 */

import { execFile } from 'child_process';

import { executeCapability } from '../../../shared/capabilities';
import { detailedMessage } from '../../../shared/detailedError';
import { accountId, readAccountIdentities } from '../credential-store';
import { clearAllSessions, NeedsHumanSignInError, resolveSessionWithoutUser } from '../session-manager';
import type { SyncVisit } from './events';
import { accessTokenFor, authorizeInBrowser, CalendarClient } from './google-api';
import { connectAccessToken, disconnectGoogle, ensureCalendar, failedRun, syncAccounts } from './sync';
import { runTray } from './tray';
import { readRefreshToken, readState, saveRefreshToken, writeState } from './store';

type Result = { ok: boolean } & Record<string, unknown>;

async function connect(): Promise<Result> {
  const { accessToken, reusedGrant } = await connectAccessToken(
    readRefreshToken(),
    accessTokenFor,
    () => authorizeInBrowser((url) => execFile('open', [url])),
    saveRefreshToken,
  );
  // The calendar ID outlives a disconnect, so turning sync back on finds the same calendar.
  const savedId = readState().calendarId;
  const calendarId = await ensureCalendar(new CalendarClient(accessToken), savedId);
  writeState({ ...readState(), calendarId, connectedAt: new Date().toISOString() });
  return { ok: true, calendarId, reusedGrant, reusedCalendar: calendarId === savedId };
}

async function fetchVisits(account: string): Promise<SyncVisit[]> {
  // Machine mode: nobody is at a sync to type a code, so it must never make
  // MyChart send one — docs/login-modes.md.
  const session = await resolveSessionWithoutUser(account).catch((err: unknown) => {
    if (err instanceof NeedsHumanSignInError) {
      throw new Error('MyChart wants a verification code, and background syncs never ask for one. Ask Claude to set up a passkey for this account, then choose Sync Now.');
    }
    throw err;
  });
  // No `patient`: executeCapability then asserts the account holder's own
  // chart is active, so a session left on a family member refuses instead of
  // putting their appointments on this calendar.
  const result = (await executeCapability(session, 'get_upcoming_visits', { mode: 'json' })) as { visits?: SyncVisit[] } | null;
  return result?.visits ?? [];
}

/**
 * `sync --scheduled` is the menu-bar item's timer: it counts consecutive
 * failures and skips what has failed MAX_ATTEMPTS times. Plain `sync` — Sync
 * Now, and the first sync after connecting — retries everything from zero.
 */
async function sync(scheduled: boolean): Promise<Result> {
  try {
    const refreshToken = readRefreshToken();
    if (!refreshToken) throw new Error('Google Calendar is not connected. Ask Claude to connect Google Calendar again.');
    const client = new CalendarClient(await accessTokenFor(refreshToken));
    const calendarId = await ensureCalendar(client, readState().calendarId);

    const ids = readAccountIdentities().map(accountId);
    const accounts = await syncAccounts(client, calendarId, ids, fetchVisits, readState().lastSync, scheduled);
    const synced = accounts.reduce((n, a) => n + a.synced, 0);
    const ok = accounts.every((a) => !a.error);
    writeState({ ...readState(), calendarId, lastSync: { at: new Date().toISOString(), ok, synced, accounts } });
    return { ok, synced, accounts };
  } catch (err) {
    // Recorded, not just returned: the menu-bar item reads the outcome from the
    // state file, and a revoked Google grant must show (and notify) as a failure.
    const error = detailedMessage(err);
    const state = readState();
    writeState({ ...state, lastSync: failedRun(state.lastSync, error, scheduled, new Date()) });
    return { ok: false, error };
  }
}

async function disconnect(): Promise<Result> {
  await disconnectGoogle();
  return { ok: true };
}

const COMMANDS: Record<string, () => Promise<Result>> = {
  connect,
  sync: () => sync(process.argv.includes('--scheduled')),
  disconnect,
};

async function main(): Promise<void> {
  if (process.argv[2] === 'tray') runTray(process.execPath);
  const command = COMMANDS[process.argv[2] ?? ''];
  let result: Result;
  if (!command) {
    result = { ok: false, error: `Usage: openrecord-calendar <tray|${Object.keys(COMMANDS).join('|')}>` };
  } else {
    try {
      result = await command();
    } catch (err) {
      result = { ok: false, error: detailedMessage(err) };
    }
  }
  clearAllSessions();
  process.stdout.write(JSON.stringify(result) + '\n');
  process.exit(result.ok ? 0 : 1);
}

if (import.meta.main) void main();
