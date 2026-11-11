// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * One sync pass: every saved MyChart account's upcoming visits onto the
 * "MyChart Appointments" Google calendar, and future events whose visit has
 * gone (canceled, rescheduled away) taken back off.
 */

import * as crypto from 'crypto';

import { detailedMessage } from '../../../shared/detailedError';
import { ACCOUNT_PROPERTY, visitToEvent, type CalendarEvent, type SyncVisit } from './events';
import { GoogleTokenError, revoke, type CalendarClient } from './google-api';
import { clearRefreshToken, readRefreshToken, readState, writeState, type AccountSyncResult, type LastSync } from './store';

/** Reads one account's upcoming visits — `get_upcoming_visits` in `json` mode. */
export type FetchVisits = (account: string) => Promise<SyncVisit[]>;

/** What a calendar event says about its account: a hash, so the MyChart username never reaches a calendar that may be shared. */
export function accountTag(account: string): string {
  return crypto.createHash('sha256').update(account.toLowerCase()).digest('hex').slice(0, 32);
}

/** Consecutive failed attempts before scheduled syncs give up on an account (or on Google) and tell the user. */
export const MAX_ATTEMPTS = 3;

export async function syncAccount(
  client: CalendarClient,
  calendarId: string,
  account: string,
  fetchVisits: FetchVisits,
  now: Date = new Date(),
): Promise<AccountSyncResult> {
  try {
    const events = (await fetchVisits(account))
      .map((v) => visitToEvent(accountTag(account), account, v))
      .filter((e): e is CalendarEvent => e !== null);
    for (const event of events) await client.upsertEvent(calendarId, event);

    // Only once the read succeeded: a failed MyChart read must never look like
    // "every appointment was canceled" and empty the calendar.
    const keep = new Set(events.map((e) => e.id));
    const existing = await client.listEventIds(calendarId, `${ACCOUNT_PROPERTY}=${accountTag(account)}`, now.toISOString());
    const stale = existing.filter((id) => !keep.has(id));
    for (const id of stale) await client.deleteEvent(calendarId, id);

    return { account, synced: events.length, removed: stale.length };
  } catch (err) {
    return { account, synced: 0, removed: 0, error: detailedMessage(err) };
  }
}

const counted = <T extends { failures?: number }>(failure: T, before: number): T & { failures: number; stopped?: true } => {
  const failures = before + 1;
  return { ...failure, failures, ...(failures >= MAX_ATTEMPTS && { stopped: true as const }) };
};

/**
 * Every account. Any failure counts — a rejected sign-in, a network error,
 * anything — and the MAX_ATTEMPTS-th in a row stops that account: scheduled
 * syncs then carry its result forward instead of trying again. A manual sync
 * (`scheduled` false: Sync Now, or connecting) retries everything from zero.
 */
export async function syncAccounts(
  client: CalendarClient,
  calendarId: string,
  accounts: string[],
  fetchVisits: FetchVisits,
  previous: LastSync | undefined,
  scheduled: boolean,
): Promise<AccountSyncResult[]> {
  const results: AccountSyncResult[] = [];
  for (const account of accounts) {
    const prev = scheduled ? previous?.accounts.find((a) => a.account === account) : undefined;
    if (prev?.stopped) {
      results.push(prev);
      continue;
    }
    const result = await syncAccount(client, calendarId, account, fetchVisits);
    results.push(result.error ? counted(result, prev?.failures ?? 0) : result);
  }
  // An account removed from OpenRecord (disconnect_account) takes its future
  // events with it: synced as if it had no visits. A prune that fails stays in
  // the results, so the next sync tries it again.
  for (const gone of previous?.accounts ?? []) {
    if (accounts.includes(gone.account)) continue;
    const pruned = await syncAccount(client, calendarId, gone.account, () => Promise.resolve([]));
    if (pruned.error) results.push(pruned);
  }
  return results;
}

/**
 * A run that failed before reaching any account — Google refused, or the run
 * crashed or timed out. Counted like an account's failures; the accounts'
 * own results carry forward so none of their counts are lost.
 */
export function failedRun(previous: LastSync | undefined, error: string, scheduled: boolean, at: Date): LastSync {
  const before = scheduled && previous?.error ? previous.failures ?? 1 : 0;
  return counted<LastSync>({ at: at.toISOString(), ok: false, synced: 0, accounts: previous?.accounts ?? [], error }, before);
}

/**
 * Revoke Google access and forget the token, keeping only the calendar ID.
 * Google won't let this scope list calendars, so once the ID is gone the app
 * can never find its calendar again, and turning sync back on would leave a
 * second "MyChart Appointments" beside the first.
 */
export async function disconnectGoogle(): Promise<void> {
  const refreshToken = readRefreshToken();
  // Best effort: the local token goes either way, and an offline revoke must not keep it.
  if (refreshToken) await revoke(refreshToken).catch(() => {});
  clearRefreshToken();
  const { calendarId } = readState();
  writeState(calendarId ? { calendarId } : {});
}

/** The calendar to write to: the saved one while it exists, else a new one. */
export async function ensureCalendar(client: CalendarClient, savedId: string | undefined): Promise<string> {
  if (savedId && (await client.calendarExists(savedId))) return savedId;
  return client.createCalendar(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
}

/**
 * An access token for `connect`: from the saved grant while Google still honours
 * it, so turning sync on again (or a second connect) never sends the user back
 * through consent for nothing. Only a grant Google calls dead — revoked, or
 * expired — falls back to consent; a network failure is an error, not a prompt.
 */
export async function connectAccessToken(
  saved: string | undefined,
  refresh: (refreshToken: string) => Promise<string>,
  consent: () => Promise<string>,
  save: (refreshToken: string) => void,
): Promise<{ accessToken: string; reusedGrant: boolean }> {
  if (saved) {
    try {
      return { accessToken: await refresh(saved), reusedGrant: true };
    } catch (err) {
      if (!(err instanceof GoogleTokenError && err.code === 'invalid_grant')) throw err;
    }
  }
  const refreshToken = await consent();
  save(refreshToken);
  return { accessToken: await refresh(refreshToken), reusedGrant: false };
}
