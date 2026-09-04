/**
 * Searching the MyChart directory: the ranking, the one-fetch cache, and the
 * fallback to the checked-in seed.
 *
 * The fallback is the case worth a test — it is silent by construction (a
 * failed fetch still returns matches), so without one it would only be noticed
 * when a picker went stale in someone's hands. Every assertion here reads the
 * `source` field for exactly that reason.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { setTestTransport } from '../../http';
import {
  DEFAULT_DIRECTORY_SEARCH_LIMIT,
  MAX_DIRECTORY_SEARCH_LIMIT,
  SANDBOX_INSTANCE,
  clearDirectoryCache,
  rankDirectoryMatches,
  searchMyChartDirectory,
} from '../searchDirectory';
import fixture from './fixtures/directory-response.json';

beforeEach(() => clearDirectoryCache());
afterEach(() => {
  setTestTransport(null);
  clearDirectoryCache();
});

const liveTransport = (onRequest?: () => void) => () => {
  onRequest?.();
  return Promise.resolve(new Response(JSON.stringify(fixture), { status: 200 }));
};

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
  it('searches the live directory and says so', async () => {
    setTestTransport(liveTransport());
    const result = await searchMyChartDirectory('AACI');
    expect(result.source).toBe('live');
    expect(result.matches.map((m) => m.slgId)).toEqual(['432-112']);
    expect(result.count).toBe(1);
    expect(result.query).toBe('AACI');
  });

  it('fetches once for many searches', async () => {
    let requests = 0;
    setTestTransport(liveTransport(() => { requests += 1; }));
    await searchMyChartDirectory('AACI');
    await searchMyChartDirectory('access');
    await searchMyChartDirectory('aa');
    expect(requests).toBe(1);
  });

  it('makes one request for searches that start together', async () => {
    let requests = 0;
    setTestTransport(liveTransport(() => { requests += 1; }));
    // A picker fires one of these per keystroke; without the in-flight
    // promise each would open its own request to Epic.
    await Promise.all([
      searchMyChartDirectory('AACI'),
      searchMyChartDirectory('AACI'),
      searchMyChartDirectory('AACI'),
    ]);
    expect(requests).toBe(1);
  });

  it('falls back to the bundled seed when the fetch fails, and admits it', async () => {
    setTestTransport(() => Promise.resolve(new Response('nope', { status: 503 })));
    const result = await searchMyChartDirectory('AACI');
    // The seed is a real answer, just an older one — the caller is told which
    // it got rather than being left to assume the list was current.
    expect(result.source).toBe('bundled');
    expect(result.matches.map((m) => m.name)).toContain('AACI');
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
