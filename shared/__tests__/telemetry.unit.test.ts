import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';
import { gatherEnvInfo, sendTelemetryEvent } from '../telemetry';

/** Anything with the shape of a `mock()`'d fetch, for the drain helper below. */
type FetchMock = { mock: { calls: unknown[][] } };

/**
 * Let a fire-and-forget `sendTelemetryEvent` reach its `fetch` calls.
 *
 * There is no promise to await by design, so this drains the microtask queue
 * until the expected fetches have been issued. It costs no real time, and it
 * cannot pass by luck: a send that never fires leaves the count short and the
 * assertion that follows fails, where the fixed 100ms sleep this replaced was
 * simultaneously slow and a coin flip on a loaded CI box.
 */
async function drainSend(fetchMock: FetchMock, expected: number): Promise<void> {
  for (let i = 0; i < 1000 && fetchMock.mock.calls.length < expected; i++) {
    await Promise.resolve();
  }
}

describe('telemetry', () => {
  describe('gatherEnvInfo', () => {
    test('returns platform, arch, runtime_version, os_version', () => {
      const info = gatherEnvInfo();
      expect(info.platform).toBeTruthy();
      expect(info.arch).toBeTruthy();
      expect(info.runtime_version).toBeTruthy();
      expect(info.os_version).toBeTruthy();
    });

    test('does not include identifying fields', () => {
      const info = gatherEnvInfo();
      // The anonymized version drops public_ip, hostname, git identity,
      // env_user. None of those should be in the payload.
      expect(info).not.toHaveProperty('public_ip');
      expect(info).not.toHaveProperty('hostname');
      expect(info).not.toHaveProperty('git_user_name');
      expect(info).not.toHaveProperty('git_user_email');
      expect(info).not.toHaveProperty('env_user');
    });
  });

  describe('sendTelemetryEvent', () => {
    let originalFetch: typeof globalThis.fetch;
    let originalDisable: string | undefined;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
      originalDisable = process.env.MYCHART_CLI_TELEMETRY_DISABLED;
      delete process.env.MYCHART_CLI_TELEMETRY_DISABLED;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
      if (originalDisable === undefined) {
        delete process.env.MYCHART_CLI_TELEMETRY_DISABLED;
      } else {
        process.env.MYCHART_CLI_TELEMETRY_DISABLED = originalDisable;
      }
    });

    test('does not throw even if fetch fails', () => {
      globalThis.fetch = mock(() => {
        throw new Error('network error');
      }) as unknown as typeof fetch;
      expect(() => sendTelemetryEvent('test_event', { foo: 'bar' })).not.toThrow();
    });

    test('does not throw even if fetch rejects', () => {
      globalThis.fetch = mock(() => Promise.reject(new Error('network error'))) as unknown as typeof fetch;
      expect(() => sendTelemetryEvent('test_event')).not.toThrow();
    });

    test('calls fetch with Amplitude API endpoint and anonymous payload', async () => {
      const fetchMock = mock(() =>
        Promise.resolve(new Response('{}', { status: 200 }))
      );
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      sendTelemetryEvent('test_event', { action: 'test' });
      await drainSend(fetchMock, 2);

      const amplitudeCall = fetchMock.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('amplitude.com')
      );
      expect(amplitudeCall).toBeTruthy();

      if (amplitudeCall) {
        const opts = amplitudeCall[1] as RequestInit;
        expect(opts.method).toBe('POST');
        const body = JSON.parse(opts.body as string);
        expect(body.api_key).toBe('a7d8557f623f24012e62edc61bbc0fd6');
        expect(body.events).toHaveLength(1);
        expect(body.events[0].event_type).toBe('test_event');
        expect(body.events[0].event_properties.action).toBe('test');

        // Identifying fields must not appear anywhere in the payload.
        const ev = body.events[0];
        expect(ev.user_properties).toBeUndefined();
        expect(ev.event_properties.public_ip).toBeUndefined();
        expect(JSON.stringify(body)).not.toContain('git_user_email');
        expect(JSON.stringify(body)).not.toContain('git_user_name');
      }
    });

    test('does not fetch when MYCHART_CLI_TELEMETRY_DISABLED is set', async () => {
      process.env.MYCHART_CLI_TELEMETRY_DISABLED = '1';
      const fetchMock = mock(() =>
        Promise.resolve(new Response('{}', { status: 200 }))
      );
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      sendTelemetryEvent('test_event');
      // Nothing to wait for — but drain anyway, so a regression that *does*
      // fetch has every chance to show itself rather than racing the assertion.
      await drainSend(fetchMock, 1);

      expect(fetchMock.mock.calls).toHaveLength(0);
    });
  });

  describe('self-hosted analytics sink', () => {
    let originalFetch: typeof globalThis.fetch;
    const analyticsEnvKeys = [
      'OPENRECORD_ANALYTICS_ENDPOINT',
      'OPENRECORD_ANALYTICS_DISABLED',
      'MYCHART_CLI_TELEMETRY_DISABLED',
    ] as const;
    let originalEnv: Record<string, string | undefined>;

    /** Mock fetch, emit one event, and return every URL it was called with. */
    async function capturePostUrls(...args: Parameters<typeof sendTelemetryEvent>) {
      const fetchMock = mock(() => Promise.resolve(new Response('{}', { status: 200 })));
      globalThis.fetch = fetchMock as unknown as typeof fetch;
      sendTelemetryEvent(...args);
      // Both sinks when they're both on; the tests that switch one off drain
      // the full budget instead, which is still instant.
      await drainSend(fetchMock, 2);
      return {
        urls: fetchMock.mock.calls.map((call) => String(call[0])),
        calls: fetchMock.mock.calls,
      };
    }

    beforeEach(() => {
      originalFetch = globalThis.fetch;
      originalEnv = Object.fromEntries(analyticsEnvKeys.map((k) => [k, process.env[k]]));
      for (const key of analyticsEnvKeys) delete process.env[key];
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
      for (const key of analyticsEnvKeys) {
        if (originalEnv[key] === undefined) delete process.env[key];
        else process.env[key] = originalEnv[key]!;
      }
    });

    test('posts to both Amplitude and the analytics Lambda', async () => {
      const { urls } = await capturePostUrls('test_event', { foo: 'bar' }, 'cli');
      expect(urls.some((u) => u.includes('amplitude.com'))).toBe(true);
      expect(urls.some((u) => u.includes('execute-api.us-east-2.amazonaws.com'))).toBe(true);
    });

    test('sends the analytics payload in the Lambda event contract', async () => {
      const { calls } = await capturePostUrls('cli_started', { action: 'scrape' }, 'cli');
      const analyticsCall = calls.find((c) => String(c[0]).includes('execute-api'));
      expect(analyticsCall).toBeTruthy();

      const body = JSON.parse((analyticsCall![1] as RequestInit).body as string);
      expect(body.event).toBe('cli_started');
      expect(body.source).toBe('cli');
      expect(body.deviceId).toBeTruthy();
      expect(typeof body.ts).toBe('number');
      expect(body.properties.action).toBe('scrape');
      // Env info rides along on every event.
      expect(body.properties.platform).toBeTruthy();
      expect(body.properties.runtime_version).toBeTruthy();
    });

    test('defaults source to "node" when the caller omits it', async () => {
      const { calls } = await capturePostUrls('test_event');
      const analyticsCall = calls.find((c) => String(c[0]).includes('execute-api'));
      const body = JSON.parse((analyticsCall![1] as RequestInit).body as string);
      expect(body.source).toBe('node');
    });

    test('uses the same anonymous device id for both sinks', async () => {
      const { calls } = await capturePostUrls('test_event');
      const amplitudeBody = JSON.parse(
        (calls.find((c) => String(c[0]).includes('amplitude.com'))![1] as RequestInit).body as string,
      );
      const analyticsBody = JSON.parse(
        (calls.find((c) => String(c[0]).includes('execute-api'))![1] as RequestInit).body as string,
      );
      expect(analyticsBody.deviceId).toBe(amplitudeBody.events[0].device_id);
    });

    test('honors OPENRECORD_ANALYTICS_ENDPOINT as an override', async () => {
      process.env.OPENRECORD_ANALYTICS_ENDPOINT = 'https://analytics.example.test';
      const { urls } = await capturePostUrls('test_event');
      expect(urls.some((u) => u === 'https://analytics.example.test')).toBe(true);
      expect(urls.some((u) => u.includes('execute-api'))).toBe(false);
      // Amplitude is unaffected by the self-hosted override.
      expect(urls.some((u) => u.includes('amplitude.com'))).toBe(true);
    });

    test('skips only the self-hosted sink when OPENRECORD_ANALYTICS_DISABLED is set', async () => {
      process.env.OPENRECORD_ANALYTICS_DISABLED = '1';
      const { urls } = await capturePostUrls('test_event');
      expect(urls.some((u) => u.includes('amplitude.com'))).toBe(true);
      expect(urls.some((u) => u.includes('execute-api'))).toBe(false);
    });

    test('still delivers to Amplitude when the analytics sink rejects', async () => {
      const fetchMock = mock((url: string) =>
        String(url).includes('execute-api')
          ? Promise.reject(new Error('sink down'))
          : Promise.resolve(new Response('{}', { status: 200 })),
      );
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      expect(() => sendTelemetryEvent('test_event')).not.toThrow();
      await drainSend(fetchMock, 2);

      const urls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes('amplitude.com'))).toBe(true);
    });
  });
});
