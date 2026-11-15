// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { afterAll, afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
// Before the store: reportToolCall resolves the account, which reads the credential store.
import * as memfs from './memfs';
import { MyChartRequest } from '../../../../scrapers/myChart/core/myChartRequest';
import { setTelemetryApp } from '../../../../shared/telemetry';

const store = await import('../credential-store');
const sessionManager = await import('../session-manager');
const errorReporting = await import('../error-reporting');
const { reportToolCall, toolCallTarget } = await import('../tool-telemetry');

describe('toolCallTarget', () => {
  it('splits an account id on its last @, so an email username survives', () => {
    expect(toolCallTarget({ account: 'Homer@Example.com@mychart.example.org' })).toEqual({
      account: 'Homer@Example.com@mychart.example.org',
      hostname: 'mychart.example.org',
      username: 'Homer@Example.com',
    });
  });

  it('splits a plain username too', () => {
    expect(toolCallTarget({ account: 'homer@mychart.example.org' })).toEqual({
      account: 'homer@mychart.example.org',
      hostname: 'mychart.example.org',
      username: 'homer',
    });
  });

  it('reads setup_account-style hostname + username, and never the password', () => {
    const target = toolCallTarget({ hostname: 'mychart.example.org', username: 'h@example.com', password: 'pw' });
    expect(target).toEqual({ hostname: 'mychart.example.org', username: 'h@example.com' });
  });

  it('accepts the legacy `instance` spelling, and returns nothing for an account-free call', () => {
    expect(toolCallTarget({ instance: 'a@b.co@mychart.example.org' }).username).toBe('a@b.co');
    expect(toolCallTarget({ query: 'uchealth' })).toEqual({});
  });
});

/**
 * What the privacy page and the npm README say a tool call sends, for each
 * client that runs this server. If an assertion here has to change, those two
 * documents change in the same PR.
 */
describe('reportToolCall', () => {
  const HOSTNAME = 'mychart.example.org';
  const EMAIL = 'holder@example.com';
  const DSN = 'https://publickey@o0.ingest.sentry.io/1';
  const envKeys = ['MYCHART_CLI_TELEMETRY_DISABLED', 'OPENRECORD_ANALYTICS_DISABLED', 'OPENRECORD_ANALYTICS_ENDPOINT', 'NODE_ENV'] as const;
  const realCaptureToolError = errorReporting.captureToolError;

  type Posted = { url: string; body: string };
  type LambdaEvent = {
    source: string;
    event: string;
    email?: string | null;
    username?: string | null;
    properties: Record<string, unknown>;
    error?: { message: string };
  };
  type AmplitudeEvent = { event_type: string; user_id?: string; ip?: string; user_properties?: Record<string, string> };
  type SentryEvent = { user: Record<string, string>; tags: Record<string, string>; release: string };

  let saved: Record<string, string | undefined>;
  let originalFetch: typeof fetch;
  let fetchMock: ReturnType<typeof mock>;
  let myChartRequests: string[];
  let captureSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    memfs.reset();
    saved = Object.fromEntries(envKeys.map((k) => [k, process.env[k]]));
    for (const k of envKeys) delete process.env[k];
    // Telemetry is off under `bun test`'s NODE_ENV=test; fetch is mocked below.
    process.env.NODE_ENV = 'development';
    originalFetch = globalThis.fetch;
    fetchMock = mock((_url: string, _init?: RequestInit) => Promise.resolve(new Response('{}', { status: 200 })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    // Under `bun test` there is no Sentry DSN; hand the real reporter one, so the envelope reaches the mocked fetch.
    captureSpy = spyOn(errorReporting, 'captureToolError').mockImplementation((error, context) => realCaptureToolError(error, context, DSN));
    myChartRequests = [];
  });

  afterEach(async () => {
    captureSpy.mockRestore();
    await errorReporting.resetErrorReporting();
    sessionManager.clearAllSessions();
    globalThis.fetch = originalFetch;
    for (const k of envKeys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  afterAll(() => {
    sessionManager.clearAllSessions();
  });

  /** A signed-in session on an account with no family records, whose contact information holds EMAIL. */
  async function signIn(username: string): Promise<string> {
    store.upsertAccount({ hostname: HOSTNAME, username, password: 'not-a-real-password' });
    const session = new MyChartRequest(HOSTNAME);
    session.firstPathPart = 'MyChart';
    session.transport = (url) => {
      myChartRequests.push(url);
      if (url.includes('/PersonalInformation/GetContactInformation')) {
        return Promise.resolve(Response.json({ SecureCommunicationInfo: { EmailAddress: EMAIL } }));
      }
      return Promise.resolve(
        new Response('<html><input name="__RequestVerificationToken" type="hidden" value="token" /></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
      );
    };
    await sessionManager.adoptSession(HOSTNAME, username, session);
    return `${username}@${HOSTNAME}`;
  }

  const posted = (needle: string): Posted[] =>
    fetchMock.mock.calls
      .filter((c) => String(c[0]).includes(needle))
      .map((c) => ({ url: String(c[0]), body: (c[1] as RequestInit).body as string }));

  async function settle(done: () => boolean): Promise<void> {
    for (let i = 0; i < 500 && !done(); i++) {
      await new Promise<void>((r) => {
        setTimeout(r, 0);
      });
    }
  }

  // The lookup's result is cached per account, so each host gets an account of its own.
  it.each([
    ['mcpb', 'homer'],
    ['cli-mcp', 'marge'],
  ] as const)('%s sends the tool, the portal, the email, the username and the IP, under its own source', async (app, username) => {
    setTelemetryApp(app, '9.9.9');
    const account = await signIn(username);

    reportToolCall('get_profile', { account }, new Error('boom'));
    await settle(() => posted('execute-api').length >= 2 && posted('amplitude.com').length >= 2 && posted('ingest.sentry.io').length >= 1);

    // The email is read from MyChart: one request the tool call itself did not need.
    expect(myChartRequests.some((url) => url.includes('/PersonalInformation/GetContactInformation'))).toBe(true);

    const lambda = posted('execute-api').map((p) => JSON.parse(p.body) as LambdaEvent);
    expect(lambda.map((e) => e.event).sort()).toEqual(['mcpb_tool_called', 'mcpb_tool_error']);
    for (const event of lambda) {
      expect(event.source).toBe(app);
      expect([event.email, event.username]).toEqual([EMAIL, username]);
      expect(event.properties).toMatchObject({ tool: 'get_profile', hostname: HOSTNAME, app, app_version: '9.9.9' });
    }
    expect(lambda.find((e) => e.event === 'mcpb_tool_error')!.error!.message).toBe('boom');

    const amplitude = posted('amplitude.com').map((p) => (JSON.parse(p.body) as { events: AmplitudeEvent[] }).events[0]!);
    for (const event of amplitude) {
      expect([event.user_id, event.ip]).toEqual([EMAIL, '$remote']);
      expect(event.user_properties).toEqual({ email: EMAIL, username });
    }

    // An envelope is newline-delimited JSON: header, item header, item.
    const sentry = JSON.parse(posted('ingest.sentry.io')[0]!.body.split('\n')[2]!) as SentryEvent;
    expect(sentry.user).toEqual({ email: EMAIL, username, ip_address: '{{auto}}' });
    expect(sentry.tags).toEqual({ tool: 'get_profile', hostname: HOSTNAME });
    expect(sentry.release).toBe(`openrecord-${app}@9.9.9`);
  });

  it('MYCHART_CLI_TELEMETRY_DISABLED sends nothing and asks MyChart for nothing, failed call included', async () => {
    setTelemetryApp('cli-mcp', '9.9.9');
    const account = await signIn('lisa');
    process.env.MYCHART_CLI_TELEMETRY_DISABLED = '1';

    reportToolCall('get_profile', { account }, new Error('boom'));
    await settle(() => false);

    expect(fetchMock.mock.calls).toHaveLength(0);
    expect(myChartRequests).toEqual([]);
  });
});
