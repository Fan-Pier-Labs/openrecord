// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * MyChart upcoming visits → Google Calendar events. Pure, so the setup widget
 * can count what a sync would write with the same rule the sync uses.
 */

import type { UpcomingVisitStandard } from '../../../scrapers/myChart/chart/visits/standardized.types';

/** The slice of a visit the mapping reads — what `get_upcoming_visits` returns in `json` mode. */
export type SyncVisit = Pick<
  UpcomingVisitStandard,
  | 'Csn'
  | 'CsnForECheckIn'
  | 'Id'
  | 'instantISO'
  | 'PrimaryDate'
  | 'IsTimeToBeDetermined'
  | 'IsHideVisitTime'
  | 'DurationInMinutes'
  | 'ArrivalTime'
  | 'VisitTypeName'
  | 'PrimaryProviderName'
  | 'PrimaryDepartment'
  | 'organizationName'
  | 'status'
  | 'Telemedicine'
>;

export interface CalendarEvent {
  id: string;
  summary: string;
  location?: string;
  description: string;
  start: { dateTime: string } | { date: string };
  end: { dateTime: string } | { date: string };
  status: 'confirmed';
  extendedProperties: { private: { openrecordAccount: string } };
}

/**
 * Private extended property every synced event carries, so a sync can find
 * (and prune) only its own account's. Its value is `accountTag` (sync.ts), a
 * hash, never the MyChart username: calendars get shared.
 */
export const ACCOUNT_PROPERTY = 'openrecordAccount';

const DEFAULT_DURATION_MINUTES = 30;

// A canceled or missed visit is not an appointment anyone should drive to.
const NOT_HAPPENING = new Set(['canceled', 'no_show', 'left_without_being_seen', 'completed']);

function visitKey(v: SyncVisit): string | null {
  return v.Csn || v.CsnForECheckIn || v.Id || null;
}

/** Whether a sync would put this visit on the calendar. */
export function isSyncableVisit(v: SyncVisit): boolean {
  return !NOT_HAPPENING.has(v.status) && visitKey(v) !== null && (v.instantISO !== null || clinicDate(v) !== null);
}

/**
 * Google event ids allow only base32hex (0-9, a-v), so the key is hex-encoded.
 * Deterministic on (account tag, CSN): re-syncing updates the same event
 * instead of adding a duplicate.
 */
export function eventId(tag: string, v: SyncVisit): string {
  const key = `${tag}|${visitKey(v) ?? ''}`;
  let hex = '';
  for (const byte of new TextEncoder().encode(key)) hex += byte.toString(16).padStart(2, '0');
  return `or${hex}`;
}

/** `MM/DD/YYYY …` (clinic-local) → `YYYY-MM-DD`. */
function clinicDate(v: SyncVisit): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(v.PrimaryDate ?? '');
  if (!m) return null;
  return `${m[3]}-${m[1]!.padStart(2, '0')}-${m[2]!.padStart(2, '0')}`;
}

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function when(v: SyncVisit): Pick<CalendarEvent, 'start' | 'end'> | null {
  // A visit whose clock time MyChart hides or hasn't set goes on its day, not at a made-up hour.
  const timeUnknown = v.IsTimeToBeDetermined === true || v.IsHideVisitTime === true || !v.instantISO;
  if (timeUnknown) {
    const date = clinicDate(v);
    return date ? { start: { date }, end: { date: nextDay(date) } } : null;
  }
  const start = new Date(v.instantISO!);
  if (Number.isNaN(start.getTime())) return null;
  const minutes = v.DurationInMinutes && v.DurationInMinutes > 0 ? v.DurationInMinutes : DEFAULT_DURATION_MINUTES;
  const end = new Date(start.getTime() + minutes * 60_000);
  return { start: { dateTime: start.toISOString() }, end: { dateTime: end.toISOString() } };
}

/** `tag` is the account's `accountTag`, not its username. */
export function visitToEvent(tag: string, v: SyncVisit): CalendarEvent | null {
  if (!isSyncableVisit(v)) return null;
  const times = when(v);
  if (!times) return null;

  const what = v.VisitTypeName || 'Appointment';
  const summary = v.PrimaryProviderName ? `${what} with ${v.PrimaryProviderName}` : what;
  const video = v.Telemedicine?.IsTelemedicine === true;
  const dept = v.PrimaryDepartment;
  const location = video ? 'Video visit' : [dept?.Name, ...(dept?.Address ?? [])].filter(Boolean).join(', ');

  const details = [
    v.ArrivalTime ? `Arrive by ${v.ArrivalTime}.` : null,
    dept?.PhoneNumber ? `Clinic phone: ${dept.PhoneNumber}` : null,
    v.organizationName,
  ].filter(Boolean);
  const footer = 'Synced from MyChart by OpenRecord. Edits here are overwritten on the next sync.';

  return {
    id: eventId(tag, v),
    summary,
    ...(location ? { location } : {}),
    description: [...details, ...(details.length ? [''] : []), footer].join('\n'),
    ...times,
    status: 'confirmed',
    extendedProperties: { private: { [ACCOUNT_PROPERTY]: tag } },
  };
}
