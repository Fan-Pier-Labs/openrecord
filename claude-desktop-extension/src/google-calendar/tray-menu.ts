// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/** What the menu-bar item decides and says — kept apart from the AppKit calls so it can be tested. */

import type { CalendarState, LastSync } from './store';

export const SYNC_INTERVAL_MS = 4 * 60 * 60_000;

/** Connected, and four hours or more since the last sync (or never synced). */
export function isSyncDue(state: CalendarState, now: Date): boolean {
  if (!state.connectedAt) return false;
  const last = state.lastSync ? Date.parse(state.lastSync.at) : NaN;
  return Number.isNaN(last) || now.getTime() - last >= SYNC_INTERVAL_MS;
}

export function iconSymbol(state: CalendarState, syncing: boolean): string {
  if (syncing) return 'arrow.triangle.2.circlepath';
  return state.lastSync?.ok === false ? 'calendar.badge.exclamationmark' : 'calendar';
}

/** The disabled status lines at the top of the menu. */
export function statusLines(state: CalendarState, syncing: boolean): string[] {
  if (syncing) return ['Syncing…'];
  if (!state.connectedAt) return ['Not connected. Ask Claude to connect Google Calendar.'];
  const last = state.lastSync;
  if (!last) return ['Not synced yet'];
  const when = new Date(last.at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  const count = last.synced === 1 ? '1 appointment' : `${last.synced} appointments`;
  if (last.error) return [`Sync failed ${when}`, `⚠︎ ${last.error}`];
  return [
    `Last synced ${when} · ${count}`,
    ...last.accounts.filter((a) => a.error).map((a) => `⚠︎ ${a.account}: ${a.error}`),
  ];
}

export interface FailureNotice {
  /** Same key, same failure: the tray notifies once per distinct failure, not every four hours. */
  key: string;
  title: string;
  body: string;
}

const FAILURE_TITLE = 'MyChart calendar sync failed';

/**
 * What to tell the user about the sync that just ended, or null when it
 * worked. `before` is the last sync recorded when this one started; a run
 * that recorded nothing new crashed or was stopped at the timeout.
 */
export function failureNotice(before: LastSync | undefined, after: LastSync | undefined): FailureNotice | null {
  if (!after || after.at === before?.at) {
    return { key: 'unfinished', title: FAILURE_TITLE, body: 'The sync stopped before it finished. OpenRecord will try again.' };
  }
  if (after.ok) return null;
  if (after.error) return { key: `error:${after.error}`, title: FAILURE_TITLE, body: after.error };
  const failed = after.accounts.filter((a) => a.error);
  return {
    key: JSON.stringify(failed.map((a) => [a.account, a.error])),
    title: FAILURE_TITLE,
    body: failed.length === 1
      ? `${failed[0]!.account}: ${failed[0]!.error}`
      : `${failed.length} accounts could not sync: ${failed.map((a) => a.account).join(', ')}. Open the calendar menu for details.`,
  };
}
