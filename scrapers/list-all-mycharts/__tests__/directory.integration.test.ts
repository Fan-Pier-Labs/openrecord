/**
 * The directory and icon scrapers over real HTTP, against fake-mychart's
 * stand-in for mychart.org.
 *
 * The unit tests cover parsing with a scripted transport; this covers the
 * things only a socket exercises — that the request Epic's picker makes is the
 * request we make (including `includeOrganizations`, without which the payload
 * has no organizations in it at all), and that an image comes back as bytes a
 * client can render.
 *
 * Requires fake-mychart running on FAKE_MYCHART_HOST (default localhost:4000).
 */

import { beforeAll, describe, expect, it } from 'bun:test';

import { resetFakeMyChart } from '../../myChart/__tests__/fake-mychart/mountMode';
import { fetchMyChartDirectory, fetchMyChartIcon } from '../directory';

const HOST = process.env.FAKE_MYCHART_HOST ?? 'localhost:4000';
const BASE = `http://${HOST}`;
const DIRECTORY_URL = `${BASE}/cached-api/help/organizations/?locale=en-us&includeOrganizations=1`;
const LOGO_URL = `${BASE}/mychartdotorg/directus/organizations/B7A4E1C0-0000-4000-9000-5F1E2D3C4B5A/5f1e2d3c4b5a69788796a5b4c3d2e1f0.png`;

describe('MyChart directory over HTTP', () => {
  beforeAll(async () => {
    await resetFakeMyChart(HOST);
  });

  it('lists the instances the directory publishes', async () => {
    const instances = await fetchMyChartDirectory({ directoryUrl: DIRECTORY_URL });

    expect(instances.map((i) => i.name)).toEqual([
      'Springfield General Hospital',
      'Shelbyville Medical Group',
    ]);

    const springfield = instances[0]!;
    expect(springfield.url).toBe(`${BASE}/MyChart/`);
    expect(springfield.slgId).toBe('9001');
    expect(springfield.aliases).toEqual(['Springfield Nuclear Plant Occupational Health']);
    expect(springfield.logoUrl).toBe(
      'https://media.epic.com/mychartdotorg/directus/organizations/B7A4E1C0-0000-4000-9000-5F1E2D3C4B5A/5f1e2d3c4b5a69788796a5b4c3d2e1f0.png',
    );
  });

  it('drops the entry that has no portal to connect to', async () => {
    const instances = await fetchMyChartDirectory({ directoryUrl: DIRECTORY_URL });
    expect(instances.some((i) => i.name.startsWith('Ogdenville'))).toBe(false);
  });

  it('falls back to the generic logo for an organization with no image', async () => {
    const instances = await fetchMyChartDirectory({ directoryUrl: DIRECTORY_URL });
    const shelbyville = instances.find((i) => i.slgId === '9002')!;
    expect(shelbyville.logoUrl).toBe(
      'https://media.epic.com/mychartdotorg/site/en-us/images/login/default.png',
    );
  });

  it('throws when the request omits includeOrganizations', async () => {
    // Epic answers 200 with no `organizations` key. Reporting that as an empty
    // directory would look exactly like a working scrape of an empty world.
    await expect(
      fetchMyChartDirectory({ directoryUrl: `${BASE}/cached-api/help/organizations/?locale=en-us` }),
    ).rejects.toThrow(/organizations/);
  });
});

describe('MyChart icon over HTTP', () => {
  beforeAll(async () => {
    await resetFakeMyChart(HOST);
  });

  it('fetches a logo as renderable bytes', async () => {
    const icon = await fetchMyChartIcon(LOGO_URL);
    expect(icon).not.toBeNull();
    expect(icon!.contentType).toBe('image/png');
    // A PNG, by its magic number — not an HTML error page with a 200 on it.
    expect(Array.from(icon!.bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(icon!.dataUri.startsWith('data:image/png;base64,iVBOR')).toBe(true);
  });

  it('returns null for a logo that is not there', async () => {
    expect(
      await fetchMyChartIcon(`${BASE}/mychartdotorg/directus/organizations/nope/nope.png`),
    ).toBeNull();
  });
});
