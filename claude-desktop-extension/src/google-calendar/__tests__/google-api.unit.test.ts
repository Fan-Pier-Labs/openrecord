// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { afterEach, beforeAll, describe, expect, it } from 'bun:test';

import { setTestTransport } from '../../../../scrapers/http';

// The build bakes the OAuth client in as globals (`bun build --define`); a test plays the build.
const g = globalThis as Record<string, unknown>;
g.__GOOGLE_OAUTH_CLIENT_ID__ = 'test-client.apps.googleusercontent.com';
g.__GOOGLE_OAUTH_CLIENT_SECRET__ = 'test-secret';

let api: typeof import('../google-api');
beforeAll(async () => {
  api = await import('../google-api');
});

type Call = { url: string; method: string; body: string };
let calls: Call[] = [];

/** Script Google: each handler sees the call and returns [status, json]. */
function google(handler: (c: Call) => [number, unknown]) {
  calls = [];
  setTestTransport(async (url, init) => {
    const call = { url, method: init.method ?? 'GET', body: typeof init.body === 'string' ? init.body : '' };
    calls.push(call);
    const [status, json] = handler(call);
    return new Response(json === null ? null : JSON.stringify(json), { status });
  });
}

afterEach(() => setTestTransport(null));

const tokens: [number, unknown] = [200, { access_token: 'access-1', refresh_token: 'refresh-1' }];

/** Start consent; `url` resolves with the page the browser would have opened. */
function start(): { result: Promise<string>; url: Promise<string> } {
  let opened: (u: string) => void = () => {};
  const url = new Promise<string>((resolve) => { opened = resolve; });
  return { result: api.authorizeInBrowser((u) => opened(u)), url };
}

/** Run consent, answering the browser redirect with `query` (state filled in unless given). */
async function consent(query: (state: string) => string): Promise<{ result: Promise<string>; page: string }> {
  const { result, url } = start();
  // It can settle (or fail) before the test awaits it.
  result.catch(() => {});
  const auth = new URL(await url);
  const redirect = auth.searchParams.get('redirect_uri')!;
  const res = await fetch(`${redirect}/?${query(auth.searchParams.get('state')!)}`);
  return { result, page: await res.text() };
}

describe('authorizeInBrowser', () => {
  it('trades the code from the loopback redirect for a refresh token, with the PKCE verifier', async () => {
    google(() => tokens);
    const { result, page } = await consent((state) => `code=the-code&state=${state}`);
    expect(await result).toBe('refresh-1');
    expect(page).toContain('Google Calendar connected');
    const form = new URLSearchParams(calls[0]!.body);
    expect(form.get('code')).toBe('the-code');
    expect(form.get('grant_type')).toBe('authorization_code');
    expect(form.get('client_id')).toBe('test-client.apps.googleusercontent.com');
    expect(form.get('code_verifier')!.length).toBeGreaterThan(40);
  });

  it('reports a declined consent', async () => {
    google(() => tokens);
    const denied = await consent((state) => `error=access_denied&state=${state}`);
    await expect(denied.result).rejects.toThrow('Google Calendar access was not granted.');
    expect(denied.page).toContain('was not connected');
  });

  it("refuses a redirect carrying someone else's state and keeps waiting for the real one", async () => {
    google(() => tokens);
    const { result, url } = start();
    const auth = new URL(await url);
    const redirect = auth.searchParams.get('redirect_uri')!;
    expect((await fetch(`${redirect}/?code=forged&state=forged`)).status).toBe(400);
    expect(calls).toEqual([]);
    await fetch(`${redirect}/?code=real&state=${auth.searchParams.get('state')}`);
    expect(await result).toBe('refresh-1');
    expect(new URLSearchParams(calls[0]!.body).get('code')).toBe('real');
  });

  it('fails when Google returns no refresh token', async () => {
    google(() => [200, { access_token: 'a' }]);
    const { result } = await consent((state) => `code=c&state=${state}`);
    await expect(result).rejects.toThrow('Google did not return a refresh token.');
  });

  it('answers 404 to anything but the redirect path', async () => {
    google(() => tokens);
    const { result, url } = start();
    const auth = new URL(await url);
    const redirect = auth.searchParams.get('redirect_uri')!;
    expect((await fetch(`${redirect}/favicon.ico`)).status).toBe(404);
    await fetch(`${redirect}/?code=c&state=${auth.searchParams.get('state')}`);
    expect(await result).toBe('refresh-1');
  });
});

describe('tokens', () => {
  it('refreshes an access token, and names the error when Google refuses', async () => {
    google(() => tokens);
    expect(await api.accessTokenFor('refresh-1')).toBe('access-1');
    expect(new URLSearchParams(calls[0]!.body).get('grant_type')).toBe('refresh_token');

    google(() => [400, { error: 'invalid_grant' }]);
    await expect(api.accessTokenFor('revoked')).rejects.toThrow('Google sign-in failed (invalid_grant).');
  });

  it('revokes', async () => {
    google(() => [200, {}]);
    await api.revoke('refresh-1');
    expect(calls[0]!.url).toBe('https://oauth2.googleapis.com/revoke?token=refresh-1');
  });
});

describe('CalendarClient', () => {
  const client = () => new api.CalendarClient('access-1');
  const event = {
    id: 'orabc', summary: 'Visit', description: '', start: { dateTime: 'x' }, end: { dateTime: 'y' },
    status: 'confirmed' as const, extendedProperties: { private: { openrecordAccount: 'a@b.org' } },
  };

  it('looks up and creates the calendar', async () => {
    google((c) => (c.url.endsWith('/calendars/mine') ? [200, { id: 'mine' }] : c.method === 'POST' ? [200, { id: 'new' }] : [404, null]));
    expect(await client().calendarExists('mine')).toBe(true);
    expect(await client().calendarExists('gone')).toBe(false);
    expect(await client().createCalendar('America/New_York')).toBe('new');
    expect(JSON.parse(calls.at(-1)!.body)).toEqual({ summary: 'MyChart Appointments', timeZone: 'America/New_York' });

    google(() => [500, null]);
    await expect(client().calendarExists('mine')).rejects.toThrow('calendar lookup failed (HTTP 500).');
    // Google's reason is what tells the user what to fix.
    google(() => [403, { error: { message: 'Google Calendar API has not been used in project 1 before or it is disabled.' } }]);
    await expect(client().createCalendar('UTC')).rejects.toThrow(
      'calendar creation failed (HTTP 403): Google Calendar API has not been used in project 1 before or it is disabled.',
    );
    await expect(client().createCalendar('UTC')).rejects.toThrow('calendar creation failed');
  });

  it('updates an event in place, and inserts it when it does not exist yet', async () => {
    google(() => [200, {}]);
    await client().upsertEvent('cal', event);
    expect(calls.map((c) => c.method)).toEqual(['PUT']);

    google((c) => (c.method === 'PUT' ? [404, null] : [200, {}]));
    await client().upsertEvent('cal', event);
    expect(calls.map((c) => c.method)).toEqual(['PUT', 'POST']);

    google(() => [403, null]);
    await expect(client().upsertEvent('cal', event)).rejects.toThrow('event update failed (HTTP 403)');
    google((c) => (c.method === 'PUT' ? [404, null] : [409, null]));
    await expect(client().upsertEvent('cal', event)).rejects.toThrow('event insert failed (HTTP 409)');
  });

  it('lists every page of one account\'s events', async () => {
    google((c) => (new URL(c.url).searchParams.get('pageToken') ? [200, { items: [{ id: 'b' }] }] : [200, { items: [{ id: 'a' }], nextPageToken: 'p2' }]));
    expect(await client().listEventIds('cal', 'openrecordAccount=a@b.org', '2026-01-01T00:00:00Z')).toEqual(['a', 'b']);
    expect(new URL(calls[0]!.url).searchParams.get('privateExtendedProperty')).toBe('openrecordAccount=a@b.org');

    google(() => [500, null]);
    await expect(client().listEventIds('cal', 'p', 't')).rejects.toThrow('event listing failed');
  });

  it('treats an already-deleted event as deleted', async () => {
    for (const status of [204, 404, 410]) {
      google(() => [status, null]);
      await client().deleteEvent('cal', 'x');
    }
    google(() => [500, null]);
    await expect(client().deleteEvent('cal', 'x')).rejects.toThrow('event delete failed');
  });
});
