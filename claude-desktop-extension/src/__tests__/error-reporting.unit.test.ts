// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import * as os from 'os';
import { captureToolError, resetErrorReporting } from '../error-reporting';
import { DetailedError } from '../../../shared/detailedError';

const DSN = 'https://publickey@o0.ingest.sentry.io/1';

type SentryEvent = {
  exception: { values: Array<{ type: string; value: string; stacktrace?: { frames: Array<{ function?: string; filename?: string }> } }> };
  server_name?: string;
  user: Record<string, string>;
  tags: Record<string, string>;
  release: string;
  breadcrumbs?: unknown[];
};

let originalFetch: typeof fetch;
let fetchMock: ReturnType<typeof mock>;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  fetchMock = mock((_url: string, _init?: RequestInit) => Promise.resolve(new Response('{}', { status: 200 })));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(async () => {
  await resetErrorReporting();
  globalThis.fetch = originalFetch;
});

/** The event inside the first envelope posted to Sentry's ingest host, once it has gone out. */
async function sentEvent(): Promise<{ url: string; event: SentryEvent }> {
  const sent = () => fetchMock.mock.calls.find((c) => String(c[0]).includes('ingest.sentry.io'));
  for (let i = 0; i < 200 && !sent(); i++) {
    await new Promise<void>((r) => {
      setTimeout(r, 0);
    });
  }
  const call = sent()!;
  // An envelope is newline-delimited JSON: header, item header, item.
  const lines = ((call[1] as RequestInit).body as string).split('\n');
  return { url: String(call[0]), event: JSON.parse(lines[2]!) as SentryEvent };
}

function failingScraper(): never {
  throw new Error('MyChart answered 500', { cause: new TypeError('socket hang up') });
}

describe('captureToolError', () => {
  it('sends the exception with its frames, its cause, who it was and which tool', async () => {
    let thrown: unknown;
    try {
      failingScraper();
    } catch (err) {
      thrown = err;
    }
    captureToolError(thrown, { tool: 'get_lab_results', hostname: 'mychart.example.org', email: 'h@example.com', username: 'homer' }, DSN);

    const { url, event } = await sentEvent();
    expect(url).toContain('/api/1/envelope/');
    const values = event.exception.values;
    // Linked errors: the cause first, the error itself last.
    expect(values.map((v) => v.value)).toEqual(['socket hang up', 'MyChart answered 500']);
    expect(values.at(-1)!.stacktrace!.frames.some((f) => f.function === 'failingScraper')).toBe(true);
    expect(event.user).toEqual({ email: 'h@example.com', username: 'homer', ip_address: '{{auto}}' });
    expect(event.tags).toEqual({ tool: 'get_lab_results', hostname: 'mychart.example.org' });
    expect(event.release).toStartWith('openrecord-mcpb@');
    expect(event.breadcrumbs ?? []).toEqual([]);
    // Nothing that names the machine or its user: no computer name, no home folder in a path.
    expect(event.server_name).toBeUndefined();
    const filenames = values.flatMap((v) => v.stacktrace!.frames.map((f) => f.filename ?? ''));
    expect(filenames.some((f) => f.includes('error-reporting.unit.test.ts'))).toBe(true);
    expect(filenames.every((f) => !f.includes(os.homedir()))).toBe(true);
  });

  it('sends a DetailedError as its message, never its detailed message', async () => {
    const error = new DetailedError('No patient record matches that name.', "No patient record matches 'Nelson'. Available: 'Bart Simpson'.");
    captureToolError(error, { tool: 'switch_proxy_target' }, DSN);
    const body = JSON.stringify((await sentEvent()).event);
    expect(body).toContain('No patient record matches that name.');
    expect(body).not.toContain('Bart');
    expect(body).not.toContain('Nelson');
  });

  it('sends nothing without a DSN', async () => {
    captureToolError(new Error('boom'), { tool: 'get_profile' }, '');
    for (let i = 0; i < 50; i++) {
      await new Promise<void>((r) => {
        setTimeout(r, 0);
      });
    }
    expect(fetchMock.mock.calls).toHaveLength(0);
  });
});
