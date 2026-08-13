/**
 * Unit tests for the extension's update checker.
 *
 * The checker's state file lives under ~/.openrecord-mcpb, so the memfs shim
 * must load FIRST — these tests touch no real disk. The GitHub API is a fake
 * fetch; the installed version is the real manifest version, so "newer" and
 * "older" fixtures use extreme versions (99.x / 0.0.x) rather than assuming
 * what the current number is.
 */
import * as memfs from './memfs';
import { beforeEach, describe, expect, test } from 'bun:test';
import {
  checkForUpdate,
  compareVersions,
  takeUpdateNotice,
  _resetForTests,
  _STATE_PATH,
  RELEASES_PAGE_URL,
} from '../update-check';
import { EXTENSION_VERSION } from '../version';

interface ReleaseFixture {
  tag_name: string;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
  assets: { name?: string; browser_download_url?: string }[];
}

function release(
  tag: string,
  opts: { draft?: boolean; prerelease?: boolean; assets?: ReleaseFixture['assets'] } = {},
): ReleaseFixture {
  return {
    tag_name: tag,
    html_url: `https://github.com/Fan-Pier-Labs/openrecord/releases/tag/${tag}`,
    draft: opts.draft ?? false,
    prerelease: opts.prerelease ?? false,
    assets: opts.assets ?? [
      {
        name: 'openrecord.mcpb',
        browser_download_url: `https://github.com/Fan-Pier-Labs/openrecord/releases/download/${tag}/openrecord.mcpb`,
      },
    ],
  };
}

/** A fake fetch that serves `body` and counts calls. */
function fakeFetch(body: unknown, status = 200) {
  const state = { calls: 0 };
  const fn = (async () => {
    state.calls++;
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof globalThis.fetch;
  return { fn, state };
}

const failingFetch = (async () => {
  throw new Error('network down');
}) as unknown as typeof globalThis.fetch;

beforeEach(() => {
  memfs.reset();
  _resetForTests();
});

describe('compareVersions', () => {
  test('orders numerically, not lexically', () => {
    expect(compareVersions('0.9.0', '0.10.0')).toBe(-1);
    expect(compareVersions('2.0.0', '10.0.0')).toBe(-1);
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
    expect(compareVersions('1.2.4', '1.2.3')).toBe(1);
  });

  test('tolerates a leading v, short versions, and prerelease suffixes', () => {
    expect(compareVersions('v1.2.3', '1.2.3')).toBe(0);
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
    expect(compareVersions('1.2', '1.2.1')).toBe(-1);
    expect(compareVersions('1.3.0-beta', '1.2.9')).toBe(1);
  });

  test('unparseable versions compare equal — garbage can never claim to be an update', () => {
    expect(compareVersions('1.2.3', 'not-a-version')).toBe(0);
    expect(compareVersions('bogus', '9.9.9')).toBe(0);
  });
});

describe('checkForUpdate', () => {
  test('finds the newest published mcpb release among mixed tags', async () => {
    const { fn } = fakeFetch([
      release('v9.9.9'), // another release train (npm) — must be ignored
      release('mcpb-v99.0.0'),
      release('mcpb-v0.0.1'),
    ]);
    const result = await checkForUpdate({ fetchFn: fn });
    expect(result.latestVersion).toBe('99.0.0');
    expect(result.updateAvailable).toBe(true);
    expect(result.downloadUrl).toContain('mcpb-v99.0.0/openrecord.mcpb');
    expect(result.installedVersion).toBe(EXTENSION_VERSION);
    expect(result.checkFailed).toBe(false);
  });

  test('skips drafts and prereleases', async () => {
    const { fn } = fakeFetch([
      release('mcpb-v99.0.0', { draft: true }),
      release('mcpb-v98.0.0', { prerelease: true }),
      release('mcpb-v97.0.0'),
    ]);
    const result = await checkForUpdate({ fetchFn: fn });
    expect(result.latestVersion).toBe('97.0.0');
  });

  test('falls back to the release page when the release has no .mcpb asset', async () => {
    const { fn } = fakeFetch([release('mcpb-v99.0.0', { assets: [{ name: 'notes.txt' }] })]);
    const result = await checkForUpdate({ fetchFn: fn });
    expect(result.updateAvailable).toBe(true);
    expect(result.downloadUrl).toBe(
      'https://github.com/Fan-Pier-Labs/openrecord/releases/tag/mcpb-v99.0.0',
    );
  });

  test('no mcpb release yet means current, not failed', async () => {
    const { fn } = fakeFetch([release('v1.0.0')]);
    const result = await checkForUpdate({ fetchFn: fn });
    expect(result.latestVersion).toBeNull();
    expect(result.updateAvailable).toBe(false);
    expect(result.checkFailed).toBe(false);
    expect(takeUpdateNotice()).toBeNull();
  });

  test('an equal or older release is not an update', async () => {
    const { fn } = fakeFetch([release(`mcpb-v${EXTENSION_VERSION}`)]);
    const result = await checkForUpdate({ fetchFn: fn });
    expect(result.updateAvailable).toBe(false);
    expect(takeUpdateNotice()).toBeNull();

    _resetForTests();
    memfs.reset();
    const older = fakeFetch([release('mcpb-v0.0.1')]);
    const olderResult = await checkForUpdate({ fetchFn: older.fn });
    expect(olderResult.updateAvailable).toBe(false);
    expect(takeUpdateNotice()).toBeNull();
  });

  test('caches the answer on disk and skips the network for 24h', async () => {
    const first = fakeFetch([release('mcpb-v99.0.0')]);
    await checkForUpdate({ fetchFn: first.fn });
    expect(first.state.calls).toBe(1);
    expect(memfs.read(_STATE_PATH)).toContain('99.0.0');

    const second = fakeFetch([release('mcpb-v100.0.0')]);
    const cached = await checkForUpdate({ fetchFn: second.fn });
    expect(second.state.calls).toBe(0); // served from the state file
    expect(cached.latestVersion).toBe('99.0.0');
    expect(cached.updateAvailable).toBe(true);
  });

  test('a stale state file triggers a live fetch', async () => {
    memfs.put(
      _STATE_PATH,
      JSON.stringify({
        checkedAt: Date.now() - 25 * 60 * 60 * 1000,
        latestVersion: '98.0.0',
        downloadUrl: null,
      }),
    );
    const { fn, state } = fakeFetch([release('mcpb-v99.0.0')]);
    const result = await checkForUpdate({ fetchFn: fn });
    expect(state.calls).toBe(1);
    expect(result.latestVersion).toBe('99.0.0');
  });

  test('force bypasses a fresh cache', async () => {
    const first = fakeFetch([release('mcpb-v99.0.0')]);
    await checkForUpdate({ fetchFn: first.fn });
    const second = fakeFetch([release('mcpb-v100.0.0')]);
    const forced = await checkForUpdate({ fetchFn: second.fn, force: true });
    expect(second.state.calls).toBe(1);
    expect(forced.latestVersion).toBe('100.0.0');
  });

  test('a corrupt state file is treated as absent', async () => {
    memfs.put(_STATE_PATH, 'not json{{{');
    const { fn, state } = fakeFetch([release('mcpb-v99.0.0')]);
    const result = await checkForUpdate({ fetchFn: fn });
    expect(state.calls).toBe(1);
    expect(result.latestVersion).toBe('99.0.0');
  });

  test('network failure is silent: checkFailed, no throw, no notice', async () => {
    const result = await checkForUpdate({ fetchFn: failingFetch });
    expect(result.checkFailed).toBe(true);
    expect(result.updateAvailable).toBe(false);
    expect(result.latestVersion).toBeNull();
    expect(takeUpdateNotice()).toBeNull();
  });

  test('a non-2xx response counts as failed', async () => {
    const { fn } = fakeFetch({ message: 'rate limited' }, 403);
    const result = await checkForUpdate({ fetchFn: fn });
    expect(result.checkFailed).toBe(true);
  });

  test('a non-array payload counts as failed', async () => {
    const { fn } = fakeFetch({ message: 'unexpected' });
    const result = await checkForUpdate({ fetchFn: fn });
    expect(result.checkFailed).toBe(true);
  });
});

describe('takeUpdateNotice', () => {
  test('hands the notice out exactly once', async () => {
    const { fn } = fakeFetch([release('mcpb-v99.0.0')]);
    await checkForUpdate({ fetchFn: fn });
    const notice = takeUpdateNotice();
    expect(notice).toContain('99.0.0');
    expect(notice).toContain(EXTENSION_VERSION);
    expect(notice).toContain('openrecord.mcpb');
    expect(takeUpdateNotice()).toBeNull();
  });

  test('RELEASES_PAGE_URL points at the public repo', () => {
    expect(RELEASES_PAGE_URL).toBe('https://github.com/Fan-Pier-Labs/openrecord/releases');
  });
});
