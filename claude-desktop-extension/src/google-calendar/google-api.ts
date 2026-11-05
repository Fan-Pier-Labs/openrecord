// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * Google OAuth (installed-app flow: loopback redirect + PKCE) and the handful
 * of Calendar API calls the sync needs.
 *
 * The only scope requested is `calendar.app.created`: it lets us create a
 * calendar of our own and manage events on it, and nothing else — no read
 * access to the user's existing calendars. Everything here therefore lives on
 * the one secondary calendar this app creates.
 *
 * Requests go through `scraperFetch` like every other outbound call (the
 * deadline and per-host permit apply to Google as much as to MyChart).
 */

import * as crypto from 'crypto';
import * as http from 'http';
import type { AddressInfo } from 'net';

import { scraperFetch } from '../../../scrapers/http';
import type { CalendarEvent } from './events';

// A "Desktop app" OAuth client, baked into the worker binary at build time
// (scripts/build-calendar-applet.ts, from ~/.config/fan-pier-labs/google-oauth-client.json)
// so it never sits in git. Google documents that an installed app's client
// secret is not confidential, and PKCE is what protects the exchange, but a
// public repo with one in it trips secret scanning all the same.
declare const __GOOGLE_OAUTH_CLIENT_ID__: string | undefined;
declare const __GOOGLE_OAUTH_CLIENT_SECRET__: string | undefined;
const clientId = () => (typeof __GOOGLE_OAUTH_CLIENT_ID__ === 'string' ? __GOOGLE_OAUTH_CLIENT_ID__ : '');
const clientSecret = () => (typeof __GOOGLE_OAUTH_CLIENT_SECRET__ === 'string' ? __GOOGLE_OAUTH_CLIENT_SECRET__ : '');

export const SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

const CALENDAR_NAME = 'MyChart Appointments';

/** How long the browser consent may take before the flow gives up. */
const CONSENT_TIMEOUT_MS = 5 * 60_000;

function requireClient(): void {
  if (!clientId() || !clientSecret()) {
    throw new Error('Google Calendar sync is not available in this build: no Google OAuth client is configured.');
  }
}

const base64url = (buf: Buffer) => buf.toString('base64url');

export function buildAuthUrl(redirectUri: string, codeChallenge: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    // A refresh token is the whole point: the sync runs every 4 hours with nobody there.
    access_type: 'offline',
    prompt: 'consent',
  });
  return `${AUTH_URL}?${params}`;
}

/** Google refused a token request; `code` is its OAuth error, e.g. `invalid_grant` for a revoked or expired grant. */
export class GoogleTokenError extends Error {
  constructor(readonly code: string) {
    super(`Google sign-in failed (${code}).`);
  }
}

async function tokenRequest(body: Record<string, string>): Promise<{ access_token: string; refresh_token?: string; scope?: string }> {
  const res = await scraperFetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ client_id: clientId(), client_secret: clientSecret(), ...body }).toString(),
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; scope?: string; error?: string };
  if (!res.ok || !json.access_token) {
    // `invalid_grant` on a refresh means the user revoked access or the token aged out.
    throw new GoogleTokenError(json.error ?? `HTTP ${res.status}`);
  }
  return json as { access_token: string; refresh_token?: string; scope?: string };
}

/**
 * Run the consent flow: listen on a loopback port, open the browser at
 * Google's consent page, and trade the code that comes back for tokens.
 * Resolves with the refresh token.
 */
export async function authorizeInBrowser(openBrowser: (url: string) => void): Promise<string> {
  requireClient();
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  const state = base64url(crypto.randomBytes(16));

  let finish: (result: { code?: string | undefined; error?: string | undefined }) => void = () => {};
  const received = new Promise<{ code?: string | undefined; error?: string | undefined }>((resolve) => { finish = resolve; });

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (url.pathname !== '/') {
      res.writeHead(404).end();
      return;
    }
    const ok = url.searchParams.get('state') === state && !!url.searchParams.get('code');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(
      `<!doctype html><meta charset="utf-8"><title>OpenRecord</title>` +
        `<body style="font:16px -apple-system,sans-serif;padding:3em;text-align:center">` +
        (ok ? '<h2>Google Calendar connected</h2><p>You can close this tab and go back to Claude.</p>'
          : '<h2>Google Calendar was not connected</h2><p>You can close this tab and try again from Claude.</p>') +
        '</body>',
    );
    if (url.searchParams.get('state') !== state) finish({ error: 'state_mismatch' });
    else finish({ code: url.searchParams.get('code') ?? undefined, error: url.searchParams.get('error') ?? undefined });
  });

  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve); });
  const redirectUri = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const timer = setTimeout(() => finish({ error: 'timed_out' }), CONSENT_TIMEOUT_MS);

  try {
    openBrowser(buildAuthUrl(redirectUri, challenge, state));
    const { code, error } = await received;
    if (!code) {
      throw new Error(
        error === 'access_denied' ? 'Google Calendar access was not granted.'
          : error === 'timed_out' ? 'Timed out waiting for Google sign-in in the browser.'
            : `Google sign-in did not complete (${error ?? 'no code'}).`,
      );
    }
    const tokens = await tokenRequest({ code, code_verifier: verifier, redirect_uri: redirectUri, grant_type: 'authorization_code' });
    if (!tokens.refresh_token) throw new Error('Google did not return a refresh token.');
    return tokens.refresh_token;
  } finally {
    clearTimeout(timer);
    server.close();
  }
}

export async function accessTokenFor(refreshToken: string): Promise<string> {
  requireClient();
  return (await tokenRequest({ refresh_token: refreshToken, grant_type: 'refresh_token' })).access_token;
}

export async function revoke(refreshToken: string): Promise<void> {
  await scraperFetch(`${REVOKE_URL}?token=${encodeURIComponent(refreshToken)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
}

/** A Calendar API client bound to one access token. */
export class CalendarClient {
  constructor(private readonly accessToken: string) {}

  private async call(method: string, path: string, body?: unknown): Promise<{ status: number; json: unknown }> {
    const res = await scraperFetch(`${CALENDAR_API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    let json: unknown = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
    return { status: res.status, json };
  }

  // Google's own explanation — e.g. "Google Calendar API has not been used in
  // project N … Enable it by visiting …" — is the actionable part, and it is
  // about the API, never the chart, so it goes in the message.
  private fail(what: string, res: { status: number; json: unknown }): never {
    const reason = (res.json as { error?: { message?: string } } | null)?.error?.message;
    throw new Error(`Google Calendar ${what} failed (HTTP ${res.status})${reason ? `: ${reason}` : '.'}`);
  }

  /** The calendar's id if it still exists — the user may have deleted it in Google Calendar. */
  async calendarExists(id: string): Promise<boolean> {
    const res = await this.call('GET', `/calendars/${encodeURIComponent(id)}`);
    if (res.status === 200) return true;
    if (res.status === 404 || res.status === 410) return false;
    return this.fail('calendar lookup', res);
  }

  async createCalendar(timeZone: string): Promise<string> {
    const res = await this.call('POST', '/calendars', { summary: CALENDAR_NAME, timeZone });
    const id = (res.json as { id?: string } | null)?.id;
    if (res.status !== 200 || !id) return this.fail('calendar creation', res);
    return id;
  }

  /**
   * Insert or overwrite one event by its deterministic id. PUT first: it also
   * revives an event a previous sync deleted, which Google keeps as
   * `cancelled` and would refuse to insert again under the same id.
   */
  async upsertEvent(calendarId: string, event: CalendarEvent): Promise<void> {
    const cal = encodeURIComponent(calendarId);
    const put = await this.call('PUT', `/calendars/${cal}/events/${event.id}`, event);
    if (put.status === 200) return;
    if (put.status !== 404) this.fail('event update', put);
    const post = await this.call('POST', `/calendars/${cal}/events`, event);
    if (post.status !== 200) this.fail('event insert', post);
  }

  /** Ids of this account's events starting after `timeMin`. */
  async listEventIds(calendarId: string, privateProperty: string, timeMin: string): Promise<string[]> {
    const ids: string[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({ privateExtendedProperty: privateProperty, timeMin, maxResults: '250', singleEvents: 'true' });
      if (pageToken) params.set('pageToken', pageToken);
      const res = await this.call('GET', `/calendars/${encodeURIComponent(calendarId)}/events?${params}`);
      if (res.status !== 200) this.fail('event listing', res);
      const page = res.json as { items?: Array<{ id: string }>; nextPageToken?: string };
      ids.push(...(page.items ?? []).map((e) => e.id));
      pageToken = page.nextPageToken;
    } while (pageToken);
    return ids;
  }

  async deleteEvent(calendarId: string, id: string): Promise<void> {
    const res = await this.call('DELETE', `/calendars/${encodeURIComponent(calendarId)}/events/${id}`);
    // Already gone is the outcome we wanted.
    if (![200, 204, 404, 410].includes(res.status)) this.fail('event delete', res);
  }
}
