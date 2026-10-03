/**
 * Searching the MyChart directory: the ranking, which list a search reads (the
 * checked-in one until a refresh, the refresh's after), and the sandbox entry.
 * Every list assertion reads `source`, because which list answered is silent
 * otherwise.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { setTestTransport } from '../../http';
import {
  DEFAULT_DIRECTORY_SEARCH_LIMIT,
  MAX_DIRECTORY_SEARCH_LIMIT,
  SANDBOX_INSTANCE,
  SANDBOX_UNAVAILABLE_NOTE,
  clearDirectoryCache,
  clearSandboxAvailabilityCache,
  rankDirectoryMatches,
  refreshMyChartDirectory,
  searchMyChartDirectory,
  useRefreshedMyCharts,
} from '../searchDirectory';
import fixture from './fixtures/directory-response.json';

beforeEach(() => {
  clearDirectoryCache();
  clearSandboxAvailabilityCache();
});
afterEach(() => {
  setTestTransport(null);
  clearDirectoryCache();
  clearSandboxAvailabilityCache();
});

/** What every non-sandbox request gets: a search must not depend on any. */
const liveTransport = () => () => Promise.resolve(new Response(JSON.stringify(fixture), { status: 200 }));

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
  it('searches the checked-in list until a refresh, with no request, and says so', async () => {
    setTestTransport(() => Promise.reject(new Error('a search made a request')));
    const result = await searchMyChartDirectory('AACI');
    expect(result.source).toBe('bundled');
    expect(result.matches.map((m) => m.slgId)).toEqual(['432-112']);
    expect(result.count).toBe(1);
    expect(result.query).toBe('AACI');
    // …with the hand-kept entries merged in.
    expect((await searchMyChartDirectory('Bellin')).matches[0]?.hostname).toBe('mychart.emplifyhealth.org');
    expect((await searchMyChartDirectory('mynm.nm.org')).matches[0]?.name).toBe('Northwestern Medicine');
  });

  it('reruns the full refresh, then searches its result merged with the hand-kept entries', async () => {
    const requested: string[] = [];
    setTestTransport((url) => {
      requested.push(url);
      if (url.includes('/cached-api/help/organizations/')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              organizations: [
                { slgId: '9001', name: 'Springfield General', loginUrl: 'https://mychart.springfield.example/MyChart/' },
                { slgId: '306-2', name: 'Bellin', loginUrl: 'https://www.mybellin.example/MyChart/' },
              ],
            }),
            { status: 200 },
          ),
        );
      }
      if (url === 'https://mychart.springfield.example/MyChart/') {
        return Promise.resolve(new Response('<input name="__RequestVerificationToken">', { status: 200 }));
      }
      return Promise.resolve(new Response('gone', { status: 404 }));
    });

    const refreshed = await refreshMyChartDirectory();
    // The refresh checked each login URL, as the release's does…
    expect(requested).toContain('https://mychart.springfield.example/MyChart/');
    expect(refreshed.find((e) => e.slgId === '306-2')?.down).toBe(true);

    // …and searches now read its result, the hand-kept entries on top.
    const springfield = await searchMyChartDirectory('Springfield General');
    expect(springfield.source).toBe('live');
    expect(springfield.matches.some((m) => m.slgId === '9001')).toBe(true);
    expect((await searchMyChartDirectory('Bellin')).matches[0]?.hostname).toBe('mychart.emplifyhealth.org');
    expect((await searchMyChartDirectory('AACI')).matches).toEqual([]);
  });

  it('searches a saved refresh, until cleared back to the checked-in list', async () => {
    useRefreshedMyCharts([{ name: 'Saved Health', url: 'https://saved.example/MyChart/', logoUrl: '', slgId: 's1', aliases: [] }]);
    const saved = await searchMyChartDirectory('Saved Health');
    expect(saved.source).toBe('live');
    expect(saved.matches[0]?.slgId).toBe('s1');

    clearDirectoryCache();
    expect((await searchMyChartDirectory('Saved Health')).source).toBe('bundled');
  });

  it('offers the fake-mychart sandbox, and ranks it ahead of a real match', async () => {
    setTestTransport(liveTransport());
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
    setTestTransport((url) =>
      url.includes('fake-mychart')
        ? Promise.reject(new Error('getaddrinfo ENOTFOUND'))
        : Promise.resolve(new Response(JSON.stringify(fixture), { status: 200 })),
    );
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
      return Promise.resolve(
        url.includes('fake-mychart')
          ? new Response(null, { status: 308, headers: { Location: '/MyChart' } })
          : new Response(JSON.stringify(fixture), { status: 200 }),
      );
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
      setTestTransport((url) =>
        Promise.resolve(url.includes('fake-mychart') ? parked() : new Response(JSON.stringify(fixture), { status: 200 })),
      );
      const result = await searchMyChartDirectory('springfield');
      expect(result.matches.find((m) => m.slgId === 'fake-mychart')?.unavailable).toBe(SANDBOX_UNAVAILABLE_NOTE);
    }
  });

  it('does not probe the sandbox for a search that did not turn it up', async () => {
    let sandboxProbes = 0;
    setTestTransport((url) => {
      if (url.includes('fake-mychart')) sandboxProbes++;
      return Promise.resolve(new Response(JSON.stringify(fixture), { status: 200 }));
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
    setTestTransport(liveTransport());
    await expect(searchMyChartDirectory('  ')).rejects.toThrow(/Pass a query/);
  });

  it('clamps the limit to the range it documents', async () => {
    setTestTransport(liveTransport());
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
