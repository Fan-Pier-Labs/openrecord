// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { describe, expect, it } from 'bun:test';

import type { CalendarEvent, SyncVisit } from '../events';
import { GoogleTokenError, type CalendarClient } from '../google-api';
import { accountTag, connectAccessToken, ensureCalendar, failedRun, syncAccount, syncAccounts } from '../sync';

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
    expect(listed).toEqual([`openrecordAccount=${accountTag('pat@host.org')}`]);
    // Nothing on the calendar names the MyChart login.
    expect(JSON.stringify([...events.values()])).not.toContain('pat');
  });

  it('never prunes when the MyChart read fails — a failed read is not "everything was canceled"', async () => {
    const { client, events } = fakeClient(['kept']);
    const result = await syncAccount(client, 'cal', 'a@b.org', async () => { throw new Error('portal down'); });
    expect(result).toEqual({ account: 'a@b.org', synced: 0, removed: 0, error: 'portal down' });
    expect(events.has('kept')).toBe(true);
  });
});

describe('accountTag', () => {
  it('is the same for any casing of a login, different per login, and does not contain it', () => {
    expect(accountTag('Pat@Host.org')).toBe(accountTag('pat@host.org'));
    expect(accountTag('pat@host.org')).not.toBe(accountTag('kid@host.org'));
    expect(accountTag('pat@host.org')).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('syncAccounts — three tries, then stop', () => {
  const at = '2026-11-05T12:00:00.000Z';
  const failing = (account: string) => { throw new Error(`down: ${account}`); };

  /** Runs `times` scheduled syncs in a row, each fed the last one's results, and counts MyChart reads. */
  async function scheduledRuns(times: number, fetch: (account: string) => Promise<SyncVisit[]>) {
    const reads: string[] = [];
    let accounts: Awaited<ReturnType<typeof syncAccounts>> = [];
    for (let i = 0; i < times; i++) {
      accounts = await syncAccounts(fakeClient().client, 'cal', ['a@b.org', 'c@d.org'],
        async (account) => { reads.push(account); return fetch(account); },
        { at, ok: false, synced: 0, accounts }, true);
    }
    return { accounts, reads };
  }

  it('counts consecutive failures of any kind and stops an account at the third', async () => {
    const { accounts, reads } = await scheduledRuns(3, async (a) => (a === 'c@d.org' ? failing(a) : [visit('1')]));
    expect(accounts[0]).toEqual({ account: 'a@b.org', synced: 1, removed: 0 });
    expect(accounts[1]).toMatchObject({ account: 'c@d.org', error: 'down: c@d.org', failures: 3, stopped: true });
    expect(reads.filter((a) => a === 'c@d.org')).toHaveLength(3);
  });

  it('never tries a stopped account again on a schedule, but keeps syncing the rest', async () => {
    const { reads } = await scheduledRuns(5, async (a) => (a === 'c@d.org' ? failing(a) : [visit('1')]));
    expect(reads.filter((a) => a === 'c@d.org')).toHaveLength(3);
    expect(reads.filter((a) => a === 'a@b.org')).toHaveLength(5);
  });

  it('starts a failing account over after a success', async () => {
    let calls = 0;
    const { accounts } = await scheduledRuns(4, async (a) => {
      if (a === 'a@b.org') return [];
      calls++;
      return calls === 2 ? [] : failing(a);
    });
    // fail, succeed, fail, fail: two in a row, not stopped.
    expect(accounts[1]).toMatchObject({ failures: 2 });
    expect(accounts[1]!.stopped).toBeUndefined();
  });

  it('retries a stopped account from zero on a manual sync', async () => {
    const stopped = { account: 'c@d.org', synced: 0, removed: 0, error: 'x', failures: 3, stopped: true as const };
    const reads: string[] = [];
    const accounts = await syncAccounts(fakeClient().client, 'cal', ['c@d.org'],
      async (a) => { reads.push(a); throw new Error('still down'); },
      { at, ok: false, synced: 0, accounts: [stopped] }, false);
    expect(reads).toEqual(['c@d.org']);
    expect(accounts[0]).toMatchObject({ failures: 1 });
    expect(accounts[0]!.stopped).toBeUndefined();
  });
});

describe('syncAccounts — removed accounts', () => {
  it("takes a removed account's future events off the calendar and then forgets it", async () => {
    const { client, events, listed } = fakeClient(['old-event']);
    const previous = { at: 'earlier', ok: true, synced: 1, accounts: [{ account: 'gone@x.org', synced: 1, removed: 0 }] };
    const results = await syncAccounts(client, 'cal', [], async () => [], previous, true);
    expect(listed).toEqual([`openrecordAccount=${accountTag('gone@x.org')}`]);
    expect(events.has('old-event')).toBe(false);
    expect(results).toEqual([]);
  });

  it('keeps a failed prune in the results so the next sync retries it', async () => {
    const { client } = fakeClient();
    (client as unknown as { listEventIds: () => Promise<string[]> }).listEventIds = async () => { throw new Error('offline'); };
    const previous = { at: 'earlier', ok: true, synced: 1, accounts: [{ account: 'gone@x.org', synced: 1, removed: 0 }] };
    const results = await syncAccounts(client, 'cal', [], async () => [], previous, true);
    expect(results).toEqual([{ account: 'gone@x.org', synced: 0, removed: 0, error: 'offline' }]);
  });
});

describe('failedRun', () => {
  const when = new Date('2026-11-05T12:00:00Z');

  it('stops at the third run-level failure in a row, keeping the accounts\' results', () => {
    const accounts = [{ account: 'a@b.org', synced: 0, removed: 0, error: 'x', failures: 1 }];
    const first = failedRun({ at: 'earlier', ok: true, synced: 1, accounts }, 'Google said no.', true, when);
    expect(first).toMatchObject({ ok: false, error: 'Google said no.', failures: 1, accounts });
    const third = failedRun(failedRun(first, 'Google said no.', true, when), 'Google said no.', true, when);
    expect(third).toMatchObject({ failures: 3, stopped: true });
  });

  it('counts from zero on a manual sync', () => {
    const stopped = { at: 'earlier', ok: false, synced: 0, accounts: [], error: 'x', failures: 3, stopped: true as const };
    expect(failedRun(stopped, 'x', false, when)).toMatchObject({ failures: 1 });
    expect(failedRun(stopped, 'x', false, when).stopped).toBeUndefined();
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
