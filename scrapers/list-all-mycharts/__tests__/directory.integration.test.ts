/**
 * The directory and icon scrapers over real HTTP, against fake-mychart's
 * stand-in for mychart.org.
 *
 * The unit tests cover parsing with a scripted transport; this covers the
 * things only a socket exercises — that the request Epic's picker makes is the
 * request we make (including `includeOrganizations`, without which the payload
 * has no organizations in it at all), and that a logo comes back as bytes a
 * client can render.
 *
 * Nothing here reaches Epic: the fake serves the directory *and* the media
 * paths its logo records resolve against, so `mediaBase` points at the fake
 * too.
 *
 * Requires fake-mychart running on FAKE_MYCHART_HOST (default localhost:4000).
 */

import { beforeAll, describe, expect, it } from 'bun:test';

import { resetFakeMyChart } from '../../myChart/__tests__/fake-mychart/mountMode';
import { fetchMyChartDirectory, fetchMyChartIcon } from '../directory';
import { clearDirectoryCache, searchMyChartDirectory } from '../searchDirectory';

const HOST = process.env.FAKE_MYCHART_HOST ?? 'localhost:4000';
const BASE = `http://${HOST}`;
const DIRECTORY = {
  directoryUrl: `${BASE}/cached-api/help/organizations/?locale=en-us&includeOrganizations=1`,
  mediaBase: `${BASE}/mychartdotorg`,
};

describe('MyChart directory over HTTP', () => {
  beforeAll(async () => {
    await resetFakeMyChart(HOST);
  });

  it('lists the instances the directory publishes', async () => {
    const instances = await fetchMyChartDirectory(DIRECTORY);

    expect(instances.map((i) => i.name)).toEqual([
      'Springfield General Hospital',
      'Shelbyville Medical Group',
    ]);

    const springfield = instances[0]!;
    expect(springfield.url).toBe(`${BASE}/MyChart/`);
    expect(springfield.slgId).toBe('9001');
    expect(springfield.aliases).toEqual(['Springfield Nuclear Plant Occupational Health']);
    expect(springfield.logoUrl).toBe(
      `${BASE}/mychartdotorg/directus/organizations/B7A4E1C0-0000-4000-9000-5F1E2D3C4B5A/5f1e2d3c4b5a69788796a5b4c3d2e1f0.png`,
    );
  });

  it('drops the entry that has no portal to connect to', async () => {
    const instances = await fetchMyChartDirectory(DIRECTORY);
    expect(instances.some((i) => i.name.startsWith('Ogdenville'))).toBe(false);
  });

  it('falls back to the generic logo for an organization with no image', async () => {
    const instances = await fetchMyChartDirectory(DIRECTORY);
    const shelbyville = instances.find((i) => i.slgId === '9002')!;
    expect(shelbyville.logoUrl).toBe(
      `${BASE}/mychartdotorg/site/en-us/images/login/default.png`,
    );
  });

  it('throws when the request omits includeOrganizations', async () => {
    // Epic answers 200 with no `organizations` key. Reporting that as an empty
    // directory would look exactly like a working scrape of an empty world.
    await expect(
      fetchMyChartDirectory({
        ...DIRECTORY,
        directoryUrl: `${BASE}/cached-api/help/organizations/?locale=en-us`,
      }),
    ).rejects.toThrow(/organizations/);
  });
});

describe('MyChart icon over HTTP', () => {
  beforeAll(async () => {
    await resetFakeMyChart(HOST);
  });

  it('fetches every logo the directory hands out', async () => {
    // Both fallbacks included: whichever logo an entry ends up with, fetching
    // it has to produce bytes.
    const instances = await fetchMyChartDirectory(DIRECTORY);
    expect(instances).toHaveLength(2);

    for (const instance of instances) {
      const icon = await fetchMyChartIcon(instance);
      expect(icon).not.toBeNull();
      expect(icon!.contentType).toBe('image/png');
      // A PNG, by its magic number — not an HTML error page with a 200 on it.
      expect(Array.from(icon!.bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
      expect(icon!.bytes.length).toBeGreaterThan(100);
      expect(icon!.dataUri.startsWith('data:image/png;base64,iVBOR')).toBe(true);
    }
  });

  it('serves the hand-placed logos too', async () => {
    // The path a client builds for the handful of organizations whose logo
    // Epic ships as a site asset instead of a directory record.
    const icon = await fetchMyChartIcon(
      `${BASE}/mychartdotorg/site/en-us/images/login/custom/mayoClinic.png`,
    );
    expect(icon?.contentType).toBe('image/png');
  });

  it('returns null for a logo that is not there', async () => {
    expect(
      await fetchMyChartIcon(`${BASE}/mychartdotorg/directus/organizations/nope/nope.png`),
    ).toBeNull();
    expect(await fetchMyChartIcon(`${BASE}/mychartdotorg/site/en-us/images/other/x.png`)).toBeNull();
  });
});

/**
 * The search on top of that fetch — what `search_mycharts` runs.
 *
 * The unit tests cover the ranking with a scripted transport. What only a
 * socket shows is which list actually answered: `source` says `live` here, and
 * a search that quietly fell back to the checked-in seed would say `bundled`
 * and still return matches.
 */
describe('searching the MyChart directory over HTTP', () => {
  beforeAll(async () => {
    await resetFakeMyChart(HOST);
    clearDirectoryCache();
  });

  it('answers from the live directory, and says that is where it came from', async () => {
    const result = await searchMyChartDirectory('springfield general', DIRECTORY);
    expect(result.source).toBe('live');
    const springfield = result.matches.find((m) => m.slgId === '9001')!;
    expect(springfield.name).toBe('Springfield General Hospital');
    expect(springfield.loginUrl).toBe(`${BASE}/MyChart/`);
    expect(springfield.hostname).toBe(new URL(BASE).hostname);
  });

  it('finds an organization by an alias it no longer trades under', async () => {
    const result = await searchMyChartDirectory('nuclear plant', DIRECTORY);
    expect(result.matches.map((m) => m.slgId)).toContain('9001');
  });

  it('never offers the entry with no portal to connect to', async () => {
    // `fetchMyChartDirectory` drops it; the search must not reintroduce it.
    const result = await searchMyChartDirectory('ogdenville', DIRECTORY);
    expect(result.matches).toEqual([]);
  });
});
