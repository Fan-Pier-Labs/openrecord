import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';
import { checkForUpdate } from '../updateCheck';

describe('updateCheck', () => {
  describe('checkForUpdate', () => {
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    test('returns updateAvailable: true when behind', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(JSON.stringify({ tag_name: 'v2.0.0' }), { status: 200 }))
      ) as unknown as typeof fetch;

      const result = await checkForUpdate({ currentVersion: '1.0.0', packageName: 'test' });
      expect(result).toEqual({ latestVersion: '2.0.0', updateAvailable: true });
    });

    test('returns updateAvailable: false when up to date', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(JSON.stringify({ tag_name: 'v1.0.0' }), { status: 200 }))
      ) as unknown as typeof fetch;

      const result = await checkForUpdate({ currentVersion: '1.0.0', packageName: 'test' });
      expect(result).toEqual({ latestVersion: '1.0.0', updateAvailable: false });
    });

    test('returns updateAvailable: false when ahead', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(JSON.stringify({ tag_name: 'v1.0.0' }), { status: 200 }))
      ) as unknown as typeof fetch;

      const result = await checkForUpdate({ currentVersion: '2.0.0', packageName: 'test' });
      expect(result).toEqual({ latestVersion: '1.0.0', updateAvailable: false });
    });

    test('strips v prefix from tag_name', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(JSON.stringify({ tag_name: 'v3.0.0' }), { status: 200 }))
      ) as unknown as typeof fetch;

      const result = await checkForUpdate({ currentVersion: '1.0.0', packageName: 'test' });
      expect(result?.latestVersion).toBe('3.0.0');
    });

    test('returns null on network failure', async () => {
      globalThis.fetch = mock(() => Promise.reject(new Error('network error'))) as unknown as typeof fetch;

      const result = await checkForUpdate({ currentVersion: '1.0.0', packageName: 'test' });
      expect(result).toBeNull();
    });

    test('returns null on non-200 response', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(new Response('not found', { status: 404 }))
      ) as unknown as typeof fetch;

      const result = await checkForUpdate({ currentVersion: '1.0.0', packageName: 'test' });
      expect(result).toBeNull();
    });

    test('orders prerelease tags below the release', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(JSON.stringify({ tag_name: 'v2.0.0' }), { status: 200 }))
      ) as unknown as typeof fetch;

      const result = await checkForUpdate({ currentVersion: '2.0.0-rc.1', packageName: 'test' });
      expect(result).toEqual({ latestVersion: '2.0.0', updateAvailable: true });
    });

    test('compares partial versions against full ones', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(JSON.stringify({ tag_name: 'v1.0.1' }), { status: 200 }))
      ) as unknown as typeof fetch;

      const result = await checkForUpdate({ currentVersion: '1.0', packageName: 'test' });
      expect(result).toEqual({ latestVersion: '1.0.1', updateAvailable: true });
    });

    test('returns null on a tag that is not a version', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(JSON.stringify({ tag_name: 'nightly' }), { status: 200 }))
      ) as unknown as typeof fetch;

      const result = await checkForUpdate({ currentVersion: '1.0.0', packageName: 'test' });
      expect(result).toBeNull();
    });

    test('calls logger.warn when update is available', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(JSON.stringify({ tag_name: 'v2.0.0' }), { status: 200 }))
      ) as unknown as typeof fetch;

      const warns: string[] = [];
      const logger = { warn: (msg: string) => warns.push(msg) };

      await checkForUpdate({ currentVersion: '1.0.0', packageName: 'test', logger });
      expect(warns.length).toBe(1);
      expect(warns[0]).toContain('v1.0.0');
      expect(warns[0]).toContain('v2.0.0');
    });
  });
});
