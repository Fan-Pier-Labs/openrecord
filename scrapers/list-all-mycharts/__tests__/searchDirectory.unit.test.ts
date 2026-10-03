/**
 * Searching the MyChart directory: the ranking, the checked-in list it reads
 * (and never Epic's live one), and the sandbox entry.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { setTestTransport } from '../../http';
import {
  DEFAULT_DIRECTORY_SEARCH_LIMIT,
  MAX_DIRECTORY_SEARCH_LIMIT,
  SANDBOX_INSTANCE,
  SANDBOX_UNAVAILABLE_NOTE,
  clearSandboxAvailabilityCache,
  rankDirectoryMatches,
  searchMyChartDirectory,
} from '../searchDirectory';

beforeEach(() => clearSandboxAvailabilityCache());
afterEach(() => {
  setTestTransport(null);
  clearSandboxAvailabilityCache();
});

/** Any request but the sandbox probe fails the test: a search must not reach Epic. */
const noEpic = (sandbox: () => Promise<Response> = () => Promise.reject(new Error('down'))) => (url: string) =>
  url.includes('fake-mychart') ? sandbox() : Promise.reject(new Error(`a search reached ${url}`));

describe('rankDirectoryMatches', () => {
  const instances = [
    { name: 'Mercy Health Partners', url: 'https://c.example.org/MyChart/', logoUrl: '', slgId: '3', aliases: [] },
    { name: 'Mercy', url: 'https://a.example.org/MyChart/', logoUrl: '', slgId: '1', aliases: [] },
    { name: 'Saint Mercy', url: 'https://d.example.org/MyChart/', logoUrl: '', slgId: '4', aliases: [] },
    { name: 'Northside Care', url: 'https://mercy-host.example.org/MyChart/', logoUrl: '', slgId: '5', aliases: [] },
    { name: 'Riverside Group', url: 'https://b.example.org/MyChart/', logoUrl: '', slgId: '2', aliases: ['Mercy Clinics'] },
  ];

  it('ranks exact, then prefix, then substring, then alias, then hostname', () => {
    // Directory order is alphabetical, which is to say arbitrary — a plain
    // filter would have put "Mercy Health Partners" above "Mercy" itself.
    expect(rankDirectoryMatches(instances, 'mercy').map((m) => m.slgId)).toEqual(['1', '3', '4', '2', '5']);
  });

  it('is case-insensitive and honours the limit', () => {
    expect(rankDirectoryMatches(instances, 'MERCY', 2).map((m) => m.slgId)).toEqual(['1', '3']);
  });

  it('returns nothing for a blank query rather than everything', () => {
    expect(rankDirectoryMatches(instances, '   ')).toEqual([]);
  });

  it('matches an extra hostname as a hostname', () => {
    const withExtra = [{ ...instances[4]!, extraHosts: ['portal.riverside.example'] }];
    expect(rankDirectoryMatches(withExtra, 'portal.riverside').map((m) => m.slgId)).toEqual(['2']);
  });

  it('carries the hostname a client keys an account on', () => {
    const [first] = rankDirectoryMatches(instances, 'mercy', 1);
    expect(first).toEqual({
      hostname: 'a.example.org',
      name: 'Mercy',
      logoUrl: '',
      loginUrl: 'https://a.example.org/MyChart/',
      slgId: '1',
      aliases: [],
    });
  });
});

describe('searchMyChartDirectory', () => {
  it('searches the checked-in list without a request to Epic', async () => {
    setTestTransport(noEpic());
    const result = await searchMyChartDirectory('AACI');
    expect(result.matches.map((m) => m.slgId)).toEqual(['432-112']);
    expect(result.count).toBe(1);
    expect(result.query).toBe('AACI');
  });

  it('returns a hand correction rather than the URL Epic publishes', async () => {
    // Bellin's Epic URL no longer resolves; its patients moved to Emplify Health.
    setTestTransport(noEpic());
    const [bellin] = (await searchMyChartDirectory('Bellin')).matches;
    expect(bellin?.hostname).toBe('mychart.emplifyhealth.org');
  });

  it("finds an organization Epic doesn't list, and one by its extra hostname", async () => {
    setTestTransport(noEpic());
    expect((await searchMyChartDirectory('Royal National Orthopaedic')).matches[0]?.slgId).toBe('openrecord-rnoh');
    expect((await searchMyChartDirectory('mynm.nm.org')).matches[0]?.name).toBe('Northwestern Medicine');
  });

  it('offers the fake-mychart sandbox, and ranks it ahead of a real match', async () => {
    setTestTransport(noEpic());
    const result = await searchMyChartDirectory('springfield');
    expect(result.matches[0]?.hostname).toBe('fake-mychart.fanpierlabs.com');
    expect(result.matches[0]?.name).toBe(SANDBOX_INSTANCE.name);

    // …and by the words someone reaches for when looking for a demo.
    for (const query of ['test', 'sandbox', 'fake-mychart']) {
      const byAlias = await searchMyChartDirectory(query);
      expect(byAlias.matches.some((m) => m.hostname === 'fake-mychart.fanpierlabs.com')).toBe(true);
    }
  });

  it('marks the sandbox unavailable when it is not serving, instead of hiding it', async () => {
    // The sandbox is a single deployment that gets torn down when it isn't
    // worth its bill. Dropping the entry would look like a bug; offering it
    // sends someone through the whole connect flow to a login that can't
    // succeed, which is how it was reported.
    setTestTransport(noEpic(() => Promise.reject(new Error('getaddrinfo ENOTFOUND'))));
    const result = await searchMyChartDirectory('springfield');
    const sandbox = result.matches.find((m) => m.hostname === 'fake-mychart.fanpierlabs.com');
    expect(sandbox?.unavailable).toBe(SANDBOX_UNAVAILABLE_NOTE);
    expect(sandbox?.unavailable).toContain('ryan@fanpierlabs.com');
  });

  it('leaves the sandbox connectable while it answers, and probes it once', async () => {
    let sandboxProbes = 0;
    setTestTransport((url) => {
      if (url.includes('fake-mychart')) sandboxProbes++;
      // What the live sandbox answers at its URL: a redirect under the mount.
      return noEpic(() => Promise.resolve(new Response(null, { status: 308, headers: { Location: '/MyChart' } })))(url);
    });
    for (const query of ['springfield', 'sandbox']) {
      const result = await searchMyChartDirectory(query);
      expect(result.matches.find((m) => m.slgId === 'fake-mychart')?.unavailable).toBeUndefined();
    }
    // Cached — a picker searching on every keystroke must not probe per stroke.
    expect(sandboxProbes).toBe(1);
  });

  it('treats a parked domain or a redirect elsewhere as down, not as serving', async () => {
    for (const parked of [
      () => new Response('<html>This domain is for sale</html>', { status: 200 }),
      () => new Response(null, { status: 302, headers: { Location: 'https://parking.example.com/' } }),
    ]) {
      clearSandboxAvailabilityCache();
      setTestTransport(noEpic(() => Promise.resolve(parked())));
      const result = await searchMyChartDirectory('springfield');
      expect(result.matches.find((m) => m.slgId === 'fake-mychart')?.unavailable).toBe(SANDBOX_UNAVAILABLE_NOTE);
    }
  });

  it('does not probe the sandbox for a search that did not turn it up', async () => {
    let sandboxProbes = 0;
    setTestTransport((url) => {
      if (url.includes('fake-mychart')) sandboxProbes++;
      return noEpic()(url);
    });
    await searchMyChartDirectory('AACI');
    expect(sandboxProbes).toBe(0);
  });

  it('renders the sandbox logo without Buffer, so it works in every client', () => {
    // This module loads in React Native and in a browser. A base64 data URI
    // built with `Buffer.from` — which is what the extension's copy did —
    // throws on both.
    expect(SANDBOX_INSTANCE.logoUrl.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    expect(decodeURIComponent(SANDBOX_INSTANCE.logoUrl.split(',')[1]!)).toContain('<svg');
  });

  it('refuses a blank query rather than returning the whole directory', async () => {
    setTestTransport(noEpic());
    await expect(searchMyChartDirectory('  ')).rejects.toThrow(/Pass a query/);
  });

  it('clamps the limit to the range it documents', async () => {
    setTestTransport(noEpic());
    expect((await searchMyChartDirectory('mychart', { limit: 1 })).matches).toHaveLength(1);
    expect(
      (await searchMyChartDirectory('a', { limit: MAX_DIRECTORY_SEARCH_LIMIT + 500 })).matches.length,
    ).toBeLessThanOrEqual(MAX_DIRECTORY_SEARCH_LIMIT);
    // An omitted limit is the documented default, not "everything".
    expect((await searchMyChartDirectory('a')).matches.length).toBeLessThanOrEqual(
      DEFAULT_DIRECTORY_SEARCH_LIMIT,
    );
  });
});
