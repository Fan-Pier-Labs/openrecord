/**
 * The version check is fire-and-forget, so every failure mode here is silent by
 * design — which is exactly why each one is pinned. A check that starts
 * throwing takes the CLI's first turn with it; one that starts returning a
 * confident wrong answer tells every user to reinstall.
 */
import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { setTestTransport } from '../../http';
import { resetHostLimiters } from '../../../shared/hostConcurrency';
import {
  VERSION_MANIFEST_URL,
  VERSION_TARGETS,
  checkVersion,
  compareSemver,
  fetchVersionManifest,
  formatUpdateNotice,
  parseVersionManifest,
  type VersionManifest,
} from '../version';

const MANIFEST: VersionManifest = {
  schema: 1,
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
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    return Promise.resolve(new Response(text, init));
  });
  return calls;
}

beforeEach(() => {
  resetHostLimiters();
});

afterEach(() => {
  setTestTransport(null);
  resetHostLimiters();
});

describe('compareSemver', () => {
  it('orders by major, then minor, then patch', () => {
    expect(compareSemver('1.0.0', '2.0.0')).toBe(-1);
    expect(compareSemver('2.0.0', '1.0.0')).toBe(1);
    expect(compareSemver('1.0.0', '1.1.0')).toBe(-1);
    expect(compareSemver('1.0.1', '1.0.0')).toBe(1);
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0);
  });

  it('treats a missing segment as zero, so 1.2 and 1.2.0 are the same version', () => {
    expect(compareSemver('1.2', '1.2.0')).toBe(0);
    expect(compareSemver('1.2', '1.2.1')).toBe(-1);
  });

  it('does not compare 10 as less than 9', () => {
    // The bug a string comparison would have.
    expect(compareSemver('1.10.0', '1.9.0')).toBe(1);
  });

  it('drops a prerelease suffix instead of reading it as a fourth segment', () => {
    // Naively splitting on '.' makes 1.2.0-beta.1 four segments long and so
    // NEWER than 1.2.0, which is backwards.
    expect(compareSemver('1.2.0-beta.1', '1.2.0')).toBe(0);
    expect(compareSemver('1.2.0-beta.1', '1.3.0')).toBe(-1);
    expect(compareSemver('1.2.0', '1.2.0-beta.1')).toBe(0);
  });

  it('reads an unparseable version as 0.0.0 rather than NaN', () => {
    // NaN comparisons are all false, so an unguarded parse would report
    // "equal" and the check would go silent instead of wrong-but-visible.
    expect(compareSemver('dev', '1.0.0')).toBe(-1);
  });
});

describe('parseVersionManifest', () => {
  it('accepts a well-formed document', () => {
    expect(parseVersionManifest(JSON.parse(JSON.stringify(MANIFEST)))).toEqual(MANIFEST);
  });

  it('rejects a schema it was not written for, rather than guessing at the shape', () => {
    expect(parseVersionManifest({ ...MANIFEST, schema: 2 })).toBeNull();
  });

  it('rejects a document missing any target', () => {
    for (const target of VERSION_TARGETS) {
      const versions = { ...MANIFEST.versions };
      delete (versions as Record<string, string>)[target];
      expect(parseVersionManifest({ ...MANIFEST, versions })).toBeNull();
    }
  });

  it('rejects an empty or non-string version', () => {
    expect(parseVersionManifest({ ...MANIFEST, versions: { ...MANIFEST.versions, cli: '' } })).toBeNull();
    expect(parseVersionManifest({ ...MANIFEST, versions: { ...MANIFEST.versions, cli: 3 } })).toBeNull();
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
    // The browser header block and the abort signal are scraperFetch's, and
    // only arrive here because the request went through it.
    expect(calls[0]!.init.signal).toBeInstanceOf(AbortSignal);
    expect((calls[0]!.init.headers as Record<string, string>)['User-Agent']).toContain('Chrome');
  });

  it('returns null on a non-200 rather than parsing an error page', async () => {
    serve('<html>Not Found</html>', { status: 404 });
    expect(await fetchVersionManifest()).toBeNull();
  });

  it('returns null when the body is not JSON', async () => {
    serve('<html>hi</html>');
    expect(await fetchVersionManifest()).toBeNull();
  });

  it('returns null when the network fails, and never throws', async () => {
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

  it('checks the scraper core when no target is named', async () => {
    serve(MANIFEST);
    const check = await checkVersion({ currentVersion: '1.2.0' });
    expect(check?.target).toBe('scrapers');
    expect(check?.latestVersion).toBe('1.2.0');
    expect(check?.updateAvailable).toBe(false);
  });

  it('does not nag someone running ahead of the published version', async () => {
    serve(MANIFEST);
    const check = await checkVersion({ currentVersion: '9.0.0', target: 'cli' });
    expect(check?.updateAvailable).toBe(false);
  });

  it('answers from a manifest already in hand without touching the network', async () => {
    setTestTransport(() => {
      throw new Error('should not have made a request');
    });
    const check = await checkVersion({ currentVersion: '1.0.0', target: 'mcpb', manifest: MANIFEST });
    expect(check?.latestVersion).toBe('2.0.0');
  });

  it('returns null when it could not find out, rather than claiming up to date', async () => {
    setTestTransport(() => Promise.reject(new Error('offline')));
    expect(await checkVersion({ currentVersion: '0.0.1', target: 'cli' })).toBeNull();
  });
});

describe('formatUpdateNotice', () => {
  it('names both versions and the URL from the manifest', async () => {
    serve(MANIFEST);
    const check = (await checkVersion({ currentVersion: '1.0.0', target: 'cli' }))!;
    const notice = formatUpdateNotice(check);
    expect(notice).toContain('v1.0.0');
    expect(notice).toContain('v1.4.0');
    expect(notice).toContain('https://example.test/cli');
  });
});
