// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/** What the menu-bar item decides and says — kept apart from the AppKit calls so it can be tested. */

import type { CalendarState, LastSync } from './store';
import { MAX_ATTEMPTS } from './sync';

export const SYNC_INTERVAL_MS = 4 * 60 * 60_000;

/**
 * Connected, and four hours or more since the last sync (or never synced) —
 * a failed one too, so a retry waits for the next four-hour mark. Never once
 * Google (or a crashing run) has failed MAX_ATTEMPTS times: only Sync Now
 * starts again.
 */
export function isSyncDue(state: CalendarState, now: Date): boolean {
  if (!state.connectedAt) return false;
  const last = state.lastSync;
  if (!last) return true;
  if (last.stopped) return false;
  const at = Date.parse(last.at);
  return Number.isNaN(at) || now.getTime() - at >= SYNC_INTERVAL_MS;
}

export function iconSymbol(state: CalendarState, syncing: boolean): string {
  if (syncing) return 'arrow.triangle.2.circlepath';
  return state.lastSync?.ok === false ? 'calendar.badge.exclamationmark' : 'calendar';
}

const STOPPED_HINT = 'stopped after 3 failed tries; choose Sync Now to try again';

/** The disabled status lines at the top of the menu. */
export function statusLines(state: CalendarState, syncing: boolean): string[] {
  if (syncing) return ['Syncing…'];
  if (!state.connectedAt) return ['Not connected. Ask Claude to connect Google Calendar.'];
  const last = state.lastSync;
  if (!last) return ['Not synced yet'];
  const when = new Date(last.at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  if (last.error) return [`${last.stopped ? 'Sync stopped' : 'Sync failed'} ${when}`, `⚠︎ ${last.error}`];
  const count = last.synced === 1 ? '1 appointment' : `${last.synced} appointments`;
  return [
    `Last synced ${when} · ${count}`,
    ...last.accounts.filter((a) => a.error).map((a) => `⚠︎ ${a.account}: ${a.error}${a.stopped ? ` (${STOPPED_HINT})` : ''}`),
  ];
}

export interface FailureNotice {
  /** Same key, same stop: the tray announces it once, not after every later sync. */
  key: string;
  title: string;
  body: string;
}

const TITLE = 'MyChart calendar sync stopped';
const sentence = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);

/** What to tell the user once something has failed MAX_ATTEMPTS times in a row, or null while nothing has. */
export function stopNotice(last: LastSync | undefined): FailureNotice | null {
  if (!last) return null;
  if (last.stopped) {
    return { key: `run:${last.error}`, title: TITLE, body: `Failed ${MAX_ATTEMPTS} times in a row: ${sentence(last.error ?? '')} Choose Sync Now to try again.` };
  }
  const stopped = last.accounts.filter((a) => a.stopped);
  if (!stopped.length) return null;
  return {
    key: JSON.stringify(stopped.map((a) => [a.account, a.error])),
    title: TITLE,
    body: stopped.length === 1
      ? `${stopped[0]!.account} failed ${MAX_ATTEMPTS} times in a row: ${stopped[0]!.error}`
      : `${stopped.length} accounts failed ${MAX_ATTEMPTS} times in a row: ${stopped.map((a) => a.account).join(', ')}. Open the calendar menu for details.`,
  };
}
