// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * One sync pass: every saved MyChart account's upcoming visits onto the
 * "MyChart Appointments" Google calendar, and future events whose visit has
 * gone (canceled, rescheduled away) taken back off.
 */

import { detailedMessage } from '../../../shared/detailedError';
import { ACCOUNT_PROPERTY, visitToEvent, type CalendarEvent, type SyncVisit } from './events';
import type { CalendarClient } from './google-api';
import type { AccountSyncResult } from './store';

/** Reads one account's upcoming visits — `get_upcoming_visits` in `json` mode. */
export type FetchVisits = (account: string) => Promise<SyncVisit[]>;

export async function syncAccount(
  client: CalendarClient,
  calendarId: string,
  account: string,
  fetchVisits: FetchVisits,
  now: Date = new Date(),
): Promise<AccountSyncResult> {
  try {
    const events = (await fetchVisits(account))
      .map((v) => visitToEvent(account, v))
      .filter((e): e is CalendarEvent => e !== null);
    for (const event of events) await client.upsertEvent(calendarId, event);

    // Only once the read succeeded: a failed MyChart read must never look like
    // "every appointment was canceled" and empty the calendar.
    const keep = new Set(events.map((e) => e.id));
    const existing = await client.listEventIds(calendarId, `${ACCOUNT_PROPERTY}=${account.toLowerCase()}`, now.toISOString());
    const stale = existing.filter((id) => !keep.has(id));
    for (const id of stale) await client.deleteEvent(calendarId, id);

    return { account, synced: events.length, removed: stale.length };
  } catch (err) {
    return { account, synced: 0, removed: 0, error: detailedMessage(err) };
  }
}

/** The calendar to write to: the saved one while it exists, else a new one. */
export async function ensureCalendar(client: CalendarClient, savedId: string | undefined): Promise<string> {
  if (savedId && (await client.calendarExists(savedId))) return savedId;
  return client.createCalendar(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
}
