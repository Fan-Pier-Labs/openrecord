// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { describe, expect, it } from 'bun:test';

import type { CalendarEvent, SyncVisit } from '../events';
import { GoogleTokenError, type CalendarClient } from '../google-api';
import { connectAccessToken, ensureCalendar, syncAccount } from '../sync';

/** An in-memory calendar with the client's surface. */
function fakeClient(existing: string[] = [], calendars: string[] = []) {
  const events = new Map<string, CalendarEvent | null>(existing.map((id) => [id, null]));
  const listed: string[] = [];
  const client = {
    upsertEvent: async (_cal: string, e: CalendarEvent) => { events.set(e.id, e); },
    listEventIds: async (_cal: string, property: string) => { listed.push(property); return [...events.keys()]; },
    deleteEvent: async (_cal: string, id: string) => { events.delete(id); },
    calendarExists: async (id: string) => calendars.includes(id),
    createCalendar: async () => 'new-cal',
  };
  return { client: client as unknown as CalendarClient, events, listed };
}

const visit = (csn: string): SyncVisit => ({
  Csn: csn, CsnForECheckIn: null, Id: null,
  instantISO: '2026-12-01T15:00:00.000Z', PrimaryDate: '12/01/2026 10:00:00 AM',
  IsTimeToBeDetermined: false, IsHideVisitTime: false, DurationInMinutes: 30, ArrivalTime: null,
  VisitTypeName: 'Visit', PrimaryProviderName: null,
  PrimaryDepartment: { Name: null, Address: [], PhoneNumber: null, Specialty: { Title: null }, Instructions: [], ArrivalLocation: null, TimeZone: null },
  organizationName: null, status: 'scheduled', Telemedicine: null,
});

describe('syncAccount', () => {
  it('writes every upcoming visit and removes future events whose visit is gone', async () => {
    const { client, events, listed } = fakeClient(['stale-event']);
    const result = await syncAccount(client, 'cal', 'Pat@host.org', async () => [visit('1'), visit('2')]);
    expect(result).toEqual({ account: 'Pat@host.org', synced: 2, removed: 1 });
    expect(events.size).toBe(2);
    expect(events.has('stale-event')).toBe(false);
    // Pruning only ever looks at this account's own events.
    expect(listed).toEqual(['openrecordAccount=pat@host.org']);
  });

  it('never prunes when the MyChart read fails — a failed read is not "everything was canceled"', async () => {
    const { client, events } = fakeClient(['kept']);
    const result = await syncAccount(client, 'cal', 'a@b.org', async () => { throw new Error('portal down'); });
    expect(result).toEqual({ account: 'a@b.org', synced: 0, removed: 0, error: 'portal down' });
    expect(events.has('kept')).toBe(true);
  });
});

describe('ensureCalendar', () => {
  it('keeps the saved calendar while it exists and makes a new one once the user deleted it', async () => {
    expect(await ensureCalendar(fakeClient([], ['mine']).client, 'mine')).toBe('mine');
    expect(await ensureCalendar(fakeClient([], []).client, 'mine')).toBe('new-cal');
    expect(await ensureCalendar(fakeClient().client, undefined)).toBe('new-cal');
  });
});

describe('connectAccessToken', () => {
  const run = async (saved: string | undefined, refresh: (t: string) => Promise<string>) => {
    const consents: string[] = [];
    const saves: string[] = [];
    const result = await connectAccessToken(saved, refresh, async () => { consents.push('asked'); return 'fresh'; }, (t) => saves.push(t));
    return { result, consents, saves };
  };

  it('reuses a saved grant Google still honours, without asking the user again', async () => {
    const { result, consents, saves } = await run('saved', async (t) => `access-for-${t}`);
    expect(result).toEqual({ accessToken: 'access-for-saved', reusedGrant: true });
    expect(consents).toEqual([]);
    expect(saves).toEqual([]);
  });

  it('asks again only when Google calls the saved grant dead, and saves the new one', async () => {
    const refresh = async (t: string) => { if (t === 'saved') throw new GoogleTokenError('invalid_grant'); return `access-for-${t}`; };
    const { result, consents, saves } = await run('saved', refresh);
    expect(result).toEqual({ accessToken: 'access-for-fresh', reusedGrant: false });
    expect(consents).toEqual(['asked']);
    expect(saves).toEqual(['fresh']);
    expect((await run(undefined, async (t) => `access-for-${t}`)).consents).toEqual(['asked']);
  });

  it('does not send the user to Google over a network failure', async () => {
    await expect(run('saved', async () => { throw new Error('offline'); })).rejects.toThrow('offline');
  });
});
