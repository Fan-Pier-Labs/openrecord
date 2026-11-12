// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * MyChart upcoming visits → Google Calendar events. Pure, so the setup widget
 * can count what a sync would write with the same rule the sync uses.
 */

import type { UpcomingVisitStandard } from '../../../scrapers/myChart/chart/visits/standardized.types';

/**
 * The slice of a visit the mapping reads — what `get_upcoming_visits` returns
 * in `json` mode. The second group only adds detail to the description, so it
 * is optional.
 */
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
> &
  Partial<
    Pick<
      UpcomingVisitStandard,
      | 'EarlyArrivalReason'
      | 'ChiefComplaint'
      | 'PatientNextStepInstructions'
      | 'SurgicalProcedures'
      | 'OtherProviders'
      | 'PreadmissionLocation'
      | 'Copay'
    >
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

const lines = (...xs: Array<string | null | undefined | false>): string[] => xs.filter((x): x is string => !!x && !!x.trim());

/** Where to go: the clinic and its address, or "Video visit". Never empty when MyChart names any place at all. */
function place(v: SyncVisit): string {
  if (v.Telemedicine?.IsTelemedicine === true) return 'Video visit';
  const dept = v.PrimaryDepartment;
  const pre = v.PreadmissionLocation;
  return [dept?.Name, ...(dept?.Address ?? [])].filter(Boolean).join(', ')
    || [pre?.Name, ...(pre?.Address ?? [])].filter(Boolean).join(', ')
    || v.organizationName
    || '';
}

/** Everything MyChart says about the visit that someone getting ready for it would want. */
function details(v: SyncVisit): string[] {
  const dept = v.PrimaryDepartment;
  const others = (v.OtherProviders ?? []).map((p) => p.Name).filter(Boolean);
  const procedures = (v.SurgicalProcedures ?? []).filter((p) => p.Name);
  const instructions = [
    ...(dept?.Instructions ?? []).map((i) => i.Text),
    ...(v.PreadmissionLocation?.Instructions ?? []).map((i) => i.Text),
    ...procedures.map((p) => p.Instructions),
    v.PatientNextStepInstructions,
  ].filter((x): x is string => !!x && !!x.trim());
  const main = lines(
    v.VisitTypeName && `Visit type: ${v.VisitTypeName}`,
    v.PrimaryProviderName && `Provider: ${v.PrimaryProviderName}`,
    others.length > 0 && `Also with: ${others.join(', ')}`,
    v.ChiefComplaint && `Reason for visit: ${v.ChiefComplaint}`,
    procedures.length > 0 && `Procedures: ${procedures.map((p) => p.Name).join(', ')}`,
    v.Telemedicine?.IsTelemedicine === true && 'Video visit: join from MyChart.',
    dept?.Name && `Department: ${dept.Name}${dept.Specialty?.Title ? ` (${dept.Specialty.Title})` : ''}`,
    (dept?.Address ?? []).length > 0 && `Address: ${dept.Address.join(', ')}`,
    dept?.PhoneNumber && `Clinic phone: ${dept.PhoneNumber}`,
    v.ArrivalTime && `Arrive by ${v.ArrivalTime}${v.EarlyArrivalReason ? ` (${v.EarlyArrivalReason})` : ''}.`,
    dept?.ArrivalLocation && `Check in at: ${dept.ArrivalLocation}`,
    v.Copay?.Amount && `Copay: ${v.Copay.Amount}${v.Copay.IsPaid ? ' (paid)' : ''}`,
    v.organizationName,
  );
  return instructions.length ? [...main, '', 'Instructions:', ...instructions] : main;
}

/**
 * `tag` is the account's `accountTag`, which keys the event; `account` is the
 * MyChart login, shown in the footer so a multi-account calendar says whose
 * appointment it is.
 */
export function visitToEvent(tag: string, account: string, v: SyncVisit): CalendarEvent | null {
  if (!isSyncableVisit(v)) return null;
  const times = when(v);
  if (!times) return null;

  const who = v.PrimaryProviderName || v.PrimaryDepartment?.Name;
  const summary = who ? `Visit with ${who}` : v.VisitTypeName || 'Appointment';
  const location = place(v);
  const body = details(v);
  const footer = `Synced from MyChart (${account}) by OpenRecord. Edits here are overwritten on the next sync.`;

  return {
    id: eventId(tag, v),
    summary,
    ...(location ? { location } : {}),
    description: [...body, ...(body.length ? [''] : []), footer].join('\n'),
    ...times,
    status: 'confirmed',
    extendedProperties: { private: { [ACCOUNT_PROPERTY]: tag } },
  };
}
