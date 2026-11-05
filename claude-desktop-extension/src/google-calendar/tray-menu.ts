// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/** What the menu-bar item decides and says — kept apart from the AppKit calls so it can be tested. */

import type { CalendarState } from './store';

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
  return [
    `Last synced ${when} · ${count}`,
    ...last.accounts.filter((a) => a.error).map((a) => `⚠︎ ${a.account}: ${a.error}`),
  ];
}
