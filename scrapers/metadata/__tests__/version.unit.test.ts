/**
 * The check is fire-and-forget, so every failure here is silent by design. One
 * that starts throwing takes the CLI's first turn with it; one that starts
 * answering confidently tells every user to reinstall.
 */
import { describe, expect, it, afterEach } from 'bun:test';
import { setTestTransport } from '../../http';
import {
  VERSION_MANIFEST_URL,
  VERSION_TARGETS,
  checkVersion,
  fetchVersionManifest,
  formatUpdateNotice,
  parseVersionManifest,
  type VersionManifest,
} from '../version';

const MANIFEST: VersionManifest = {
  versions: { scrapers: '1.2.0', cli: '1.4.0', mcpb: '2.0.0', app: '1.1.0' },
  updateUrls: {
    scrapers: 'https://example.test/scrapers',
    cli: 'https://example.test/cli',
    mcpb: 'https://example.test/mcpb',
    app: 'https://example.test/app',
  },
};

/** Scripts the one outbound path, and records what it was asked for. */
function serve(body: unknown, init: ResponseInit = { status: 200 }) {
  const calls: { url: string; init: RequestInit }[] = [];
  setTestTransport((url, requestInit) => {
    calls.push({ url, init: requestInit });
    return Promise.resolve(new Response(typeof body === 'string' ? body : JSON.stringify(body), init));
  });
  return calls;
}

afterEach(() => {
  setTestTransport(null);
  delete process.env.MYCHART_CLI_TELEMETRY_DISABLED;
});

describe('parseVersionManifest', () => {
  it('accepts a well-formed document', () => {
    expect(parseVersionManifest(JSON.parse(JSON.stringify(MANIFEST)))).toEqual(MANIFEST);
  });

  it('rejects a document missing any target', () => {
    for (const target of VERSION_TARGETS) {
      const versions = { ...MANIFEST.versions };
      delete (versions as Record<string, string>)[target];
      expect(parseVersionManifest({ ...MANIFEST, versions })).toBeNull();
    }
  });

  it('rejects the things a 404 page or an outage actually returns', () => {
    for (const junk of [null, undefined, 'not json', 42, [], {}]) {
      expect(parseVersionManifest(junk)).toBeNull();
    }
  });
});

describe('fetchVersionManifest', () => {
  it('reads the manifest from the splash site', async () => {
    const calls = serve(MANIFEST);
    expect(await fetchVersionManifest()).toEqual(MANIFEST);
    expect(calls[0]!.url).toBe(VERSION_MANIFEST_URL);
  });

  it('goes out through scraperFetch, so it carries the deadline and the host permit', async () => {
    const calls = serve(MANIFEST);
    await fetchVersionManifest();
    // The abort signal and the header block are scraperFetch's, and only arrive
    // here because the request went through it.
    expect(calls[0]!.init.signal).toBeInstanceOf(AbortSignal);
    expect((calls[0]!.init.headers as Record<string, string>)['User-Agent']).toContain('Chrome');
  });

  it('returns null on a non-200, a non-JSON body, or a network failure', async () => {
    serve('<html>Not Found</html>', { status: 404 });
    expect(await fetchVersionManifest()).toBeNull();

    serve('<html>hi</html>');
    expect(await fetchVersionManifest()).toBeNull();

    setTestTransport(() => Promise.reject(new Error('offline')));
    expect(await fetchVersionManifest()).toBeNull();
  });
});

describe('checkVersion', () => {
  it('reports an available update against the target the caller names', async () => {
    serve(MANIFEST);
    expect(await checkVersion({ currentVersion: '1.0.0', target: 'cli' })).toEqual({
      target: 'cli',
      currentVersion: '1.0.0',
      latestVersion: '1.4.0',
      updateAvailable: true,
      updateUrl: 'https://example.test/cli',
    });
  });

  it('does not nag someone level with, or ahead of, the published version', async () => {
    serve(MANIFEST);
    expect((await checkVersion({ currentVersion: '1.4.0', target: 'cli' }))?.updateAvailable).toBe(false);
    expect((await checkVersion({ currentVersion: '9.0.0', target: 'cli' }))?.updateAvailable).toBe(false);
  });

  it('orders versions by number, not by text', async () => {
    // '1.9.0' > '1.10.0' as text, which would tell everyone on 1.9 they were ahead.
    const manifest = { ...MANIFEST, versions: { ...MANIFEST.versions, cli: '1.10.0' } };
    const check = await checkVersion({ currentVersion: '1.9.0', target: 'cli', manifest });
    expect(check?.updateAvailable).toBe(true);
  });

  it('offers the release to someone on a prerelease of it', async () => {
    const check = await checkVersion({ currentVersion: '1.4.0-beta.1', target: 'cli', manifest: MANIFEST });
    expect(check?.updateAvailable).toBe(true);
  });

  it('returns null rather than throwing when a version is not semver at all', async () => {
    // `compareVersions` throws on these, and this is called as
    // `void checkVersion(...)` — a throw here is an unhandled rejection.
    expect(await checkVersion({ currentVersion: 'dev', target: 'cli', manifest: MANIFEST })).toBeNull();
    expect(
      await checkVersion({
        currentVersion: '1.0.0',
        target: 'cli',
        manifest: { ...MANIFEST, versions: { ...MANIFEST.versions, cli: 'latest' } },
      }),
    ).toBeNull();
  });

  it('returns null when it could not find out, rather than claiming up to date', async () => {
    setTestTransport(() => Promise.reject(new Error('offline')));
    expect(await checkVersion({ currentVersion: '0.0.1', target: 'cli' })).toBeNull();
  });

  it('makes no request at all when the user opted out of telemetry', async () => {
    // Same predicate, because it is the same promise: a request to our server
    // on every run, putting the caller's IP and cadence in our logs.
    const calls = serve(MANIFEST);
    process.env.MYCHART_CLI_TELEMETRY_DISABLED = '1';
    expect(await checkVersion({ currentVersion: '1.0.0', target: 'cli' })).toBeNull();
    expect(calls).toHaveLength(0);
  });
});

describe('formatUpdateNotice', () => {
  it('names both versions and the URL from the manifest', async () => {
    const check = (await checkVersion({ currentVersion: '1.0.0', target: 'cli', manifest: MANIFEST }))!;
    expect(formatUpdateNotice(check)).toBe(
      'Update available: v1.0.0 → v1.4.0 — https://example.test/cli',
    );
  });
});
