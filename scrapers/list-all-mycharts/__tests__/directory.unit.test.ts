/**
 * The directory scrapers, against a fixture captured from the live endpoint.
 *
 * The fixture keeps the real response's shape — including the two logo
 * fallbacks and the entry with no `loginUrl` — because every interesting case
 * in this parser is a field that is *absent*, and a hand-written happy-path
 * object has none of them.
 */
import { afterEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

import { setTestTransport } from '../../http';
import {
  directoryPrefixesFor,
  defaultLogoUrl,
  fetchMyChartDirectory,
  fetchMyChartIcon,
  listMyCharts,
  logoUrlFor,
  toSortedJson,
  withManualEntries,
  parseDirectoryPayload,
  toSeedEntry,
  type MyChartInstanceSeed,
} from '../directory';
import bundledInstances from '../mychart-instances.json';
import manualEntries from '../mychart-instances-manual.json';
import fixture from './fixtures/directory-response.json';

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

afterEach(() => setTestTransport(null));

describe('parseDirectoryPayload', () => {
  const instances = parseDirectoryPayload(fixture);

  it('drops entries with no login URL', () => {
    expect(instances.map((i) => i.name)).not.toContain('No Login URL Health');
    expect(instances).toHaveLength(fixture.organizations.length - 1);
  });

  it('maps the fields every client consumes', () => {
    const aaci = instances.find((i) => i.slgId === '432-112');
    expect(aaci).toEqual({
      name: 'AACI',
      url: 'https://mychart.ochin.org/MyChartAACI/',
      directoryUrl: 'https://mychart.ochin.org/MyChartAACI/',
      logoUrl:
        'https://media.epic.com/mychartdotorg/directus/organizations/C7785A28-8697-454E-9FFD-23E143F9F672/caba6e8737d0c70cdbfd2f92d373084a.png',
      slgId: '432-112',
      aliases: [],
      states: ['CA'],
      countries: ['US'],
      brandName: 'MyChart',
      liveOnCentral: true,
      phone: null,
      email: null,
      faqUrl: null,
    });
  });

  it('keeps the contact fields the directory publishes, and nulls the empty ones', () => {
    const [org] = parseDirectoryPayload({
      organizations: [
        {
          slgId: '9001',
          name: 'Springfield General Hospital',
          loginUrl: 'https://mychart.example.org/MyChart/',
          phone: '555-010-0100',
          email: 'mychart@example.org',
          emailHref: 'mailto:mychart@example.org',
          faq: 'https://mychart.example.org/MyChart/Authentication/Login?mode=stdfile&option=faq',
        },
        { slgId: '9002', name: 'Shelbyville Medical Group', loginUrl: 'https://mychart.example.net/', phone: '', email: '', faq: '' },
      ],
    });
    expect(org).toMatchObject({
      phone: '555-010-0100',
      email: 'mychart@example.org',
      faqUrl: 'https://mychart.example.org/MyChart/Authentication/Login?mode=stdfile&option=faq',
    });
    expect(instances.every((i) => i.phone === null && i.email === null && i.faqUrl === null)).toBe(true);
  });

  it('keeps the aliases an organization is also searched by', () => {
    const elCamino = instances.find((i) => i.slgId === '920-1');
    expect(elCamino?.aliases).toEqual(['Silicon Valley Sports Medicine']);
  });

  it('records a correction and a down portal in the seed only when there is one', () => {
    const [plain] = parseDirectoryPayload({
      organizations: [{ slgId: '9001', name: 'Springfield', loginUrl: 'https://mychart.example.org/MyChart/' }],
    });
    expect(toSeedEntry(plain!)).not.toContainKey('directoryUrl');
    expect(toSeedEntry(plain!)).not.toContainKey('down');
    expect(
      toSeedEntry({ ...plain!, url: 'https://portal.example.org/MyChart/', down: true }),
    ).toMatchObject({ directoryUrl: 'https://mychart.example.org/MyChart/', down: true });
  });

  describe('duplicates', () => {
    const parse = (organizations: object[]) => parseDirectoryPayload({ organizations });

    it('merges entries with the same name and URL, keeping the parent and every alias', () => {
      // Cleveland Clinic's shape: listed for the US and again for Canada.
      const merged = parse([
        { slgId: '320', name: 'Cleveland Clinic', loginUrl: 'https://mychart.clevelandclinic.org/', aliases: ['Martin'], states: ['OH'], countries: ['US'] },
        { slgId: '320-1', name: 'Cleveland Clinic', loginUrl: 'https://mychart.clevelandclinic.org/', aliases: [], states: [], countries: ['CA'] },
      ]);
      expect(merged).toHaveLength(1);
      expect(merged[0]).toMatchObject({ slgId: '320', aliases: ['Martin'] });
    });

    it('keeps same-named systems on different portals, and affiliates sharing one', () => {
      const kept = parse([
        { slgId: '1', name: 'Baptist Health', loginUrl: 'https://mychart.baptist-al.example/Baptist/', states: ['AL'] },
        { slgId: '2', name: 'Baptist Health', loginUrl: 'https://mychart.baptist-ar.example/mychart/', states: ['AR'] },
        { slgId: '3', name: 'Shelbyville Clinic', loginUrl: 'https://mychart.baptist-ar.example/mychart/' },
      ]);
      expect(kept.map((i) => i.slgId)).toEqual(['1', '2', '3']);
    });
  });

  it('throws rather than reporting an empty directory when the shape changes', () => {
    expect(() => parseDirectoryPayload({ orgs: [] })).toThrow(/organizations/);
    expect(() => parseDirectoryPayload(null)).toThrow(/organizations/);
  });
});

describe('listMyCharts and withManualEntries', () => {
  const seed = bundledInstances as MyChartInstanceSeed[];
  const merged = listMyCharts();
  const bySlgId = (slgId: string) => merged.find((i) => i.slgId === slgId);
  const additions = manualEntries.filter((e) => e.slgId.startsWith('openrecord-'));

  it('is the generated list plus the hand additions', () => {
    expect(merged).toHaveLength(seed.length + additions.length);
    expect(bySlgId('openrecord-rnoh')).toMatchObject({
      name: 'Royal National Orthopaedic Hospital',
      url: 'https://mycare.rnoh.nhs.uk/RNOHMyCare/',
      logoUrl: defaultLogoUrl(),
    });
  });

  it('lets a hand entry win, and clears the down the generated list gave its Epic URL', () => {
    // Bellin: Epic's host no longer resolves; its patients moved to Emplify Health.
    expect(seed.find((i) => i.slgId === '306-2')).toMatchObject({ url: 'https://www.mybellin.org/MyChart/', down: true });
    expect(bySlgId('306-2')?.url).toBe('https://mychart.emplifyhealth.org/MyChart/');
    expect(bySlgId('306-2')).not.toContainKey('down');
    expect(bySlgId('650')?.extraHosts).toEqual(['mynm.nm.org']);
  });

  it('merges the hand-kept entries into a newer refresh the same way, and nothing else', () => {
    const refreshed = withManualEntries([
      { name: 'Bellin', url: 'https://www.mybellin.org/MyChart/', logoUrl: '', slgId: '306-2', aliases: [], down: true },
      { name: 'Somewhere Else', url: 'https://mychart.elsewhere.example/', logoUrl: '', slgId: '9999', aliases: [] },
    ]);
    expect(refreshed.find((i) => i.slgId === '306-2')).toEqual({
      name: 'Bellin', url: 'https://mychart.emplifyhealth.org/MyChart/', logoUrl: '', slgId: '306-2', aliases: [],
    });
    expect(refreshed.find((i) => i.slgId === '9999')?.url).toBe('https://mychart.elsewhere.example/');
    // A fix for an organization the list lacks is skipped; an addition is always there.
    expect(refreshed).toHaveLength(2 + additions.length);
  });

  it('never mutates the generated list it reads', () => {
    expect(seed.find((i) => i.slgId === '650')).not.toContainKey('extraHosts');
  });
});

/**
 * `mychart-instances-manual.json` is kept by hand against a generated file a
 * release rewrites, so these fail the build when the two drift apart.
 */
describe('the checked-in JSON files', () => {
  const seed = new Map((bundledInstances as MyChartInstanceSeed[]).map((i) => [i.slgId, i]));
  const dir = path.join(import.meta.dir, '..');

  it('are sorted by slgId with keys in order, so a diff shows only what changed', () => {
    for (const file of ['mychart-instances.json', 'mychart-instances-manual.json']) {
      const text = fs.readFileSync(path.join(dir, file), 'utf8');
      expect(text, file).toBe(toSortedJson(JSON.parse(text) as { slgId: string }[]));
    }
  });

  it('fix only entries that exist, and add only organizations Epic does not list', () => {
    const hosts = new Set([...seed.values()].map((i) => new URL(i.url).hostname.toLowerCase()));
    for (const e of manualEntries) {
      if (e.slgId.startsWith('openrecord-')) {
        expect(e.url && e.name, e.slgId).toBeTruthy();
        // Epic listing the host now means the addition can go.
        expect(hosts.has(new URL(e.url!).hostname.toLowerCase()), e.slgId).toBe(false);
      } else {
        expect(seed.has(e.slgId), e.slgId).toBe(true);
      }
    }
  });

  it('give extra hostnames that differ from the entry\'s own, and mount URLs a login can start from', () => {
    for (const e of manualEntries) {
      for (const host of e.extraHosts ?? []) expect(new URL(seed.get(e.slgId)!.url).hostname, host).not.toBe(host);
      if (e.url) expect(e.url).toMatch(/^https:\/\/[^/]+\/([^/]+\/)?$/);
    }
  });
});

describe('logoUrlFor', () => {
  it('uses the organization\'s own image when it has one', () => {
    expect(
      logoUrlFor({
        slgId: '1-1',
        name: 'X',
        loginUrl: 'https://x.example/',
        logo: { imageId: 'IMG', fileName: 'f.png', subAreaName: 'organizations' },
      }),
    ).toBe('https://media.epic.com/mychartdotorg/directus/organizations/IMG/f.png');
  });

  it('falls back to the per-organization override, keyed by directory id', () => {
    // Mayo has no logo record; without this fallback it renders as unbranded.
    expect(logoUrlFor({ slgId: '958', name: 'Mayo Clinic', loginUrl: 'https://x.example/' })).toBe(
      'https://media.epic.com/mychartdotorg/site/en-us/images/login/custom/mayoClinic.png',
    );
  });

  it('falls back to the generic logo when there is neither', () => {
    expect(logoUrlFor({ slgId: '920-1', name: 'El Camino', loginUrl: 'https://x.example/' })).toBe(
      defaultLogoUrl(),
    );
  });

  it('resolves against another media base when given one', () => {
    // What a client pointed at fake-mychart does: the record is an id and a
    // filename, so the base is the only thing that decides where it resolves.
    const base = 'http://localhost:4000/mychartdotorg';
    expect(
      logoUrlFor(
        {
          slgId: '1-1',
          name: 'X',
          loginUrl: 'https://x.example/',
          logo: { imageId: 'IMG', fileName: 'f.png', subAreaName: 'organizations' },
        },
        base,
      ),
    ).toBe(`${base}/directus/organizations/IMG/f.png`);
    expect(logoUrlFor({ slgId: '958', name: 'Mayo Clinic', loginUrl: 'https://x.example/' }, base)).toBe(
      `${base}/site/en-us/images/login/custom/mayoClinic.png`,
    );
    expect(defaultLogoUrl(base)).toBe(`${base}/site/en-us/images/login/default.png`);
  });
});

describe('fetchMyChartDirectory', () => {
  it('parses the directory endpoint', async () => {
    let requested = '';
    setTestTransport((url) => {
      requested = url;
      return Promise.resolve(new Response(JSON.stringify(fixture), { status: 200 }));
    });

    const instances = await fetchMyChartDirectory();
    expect(requested).toContain('/cached-api/help/organizations/');
    expect(instances.map((i) => i.slgId)).toEqual(['432-112', '958', '920-1', '412-2']);
  });

  it('throws on a non-OK response instead of returning nothing', async () => {
    setTestTransport(() => Promise.resolve(new Response('nope', { status: 503 })));
    await expect(fetchMyChartDirectory()).rejects.toThrow(/503/);
  });
});

describe('fetchMyChartIcon', () => {
  it('returns the bytes and a renderable data URI', async () => {
    setTestTransport(() =>
      Promise.resolve(
        new Response(PNG_BYTES, { status: 200, headers: { 'Content-Type': 'image/png' } }),
      ),
    );

    const icon = await fetchMyChartIcon({ logoUrl: 'https://media.epic.com/logo.png' });
    expect(icon?.contentType).toBe('image/png');
    expect(icon?.bytes).toEqual(PNG_BYTES);
    expect(icon?.dataUri).toBe(`data:image/png;base64,${Buffer.from(PNG_BYTES).toString('base64')}`);
  });

  it('accepts a bare URL as well as an instance', async () => {
    setTestTransport(() => Promise.resolve(new Response(PNG_BYTES, { status: 200 })));
    const icon = await fetchMyChartIcon('https://media.epic.com/logo.png');
    expect(icon?.url).toBe('https://media.epic.com/logo.png');
  });

  it('infers the type from the extension when the server sends none', async () => {
    setTestTransport(() => Promise.resolve(new Response(PNG_BYTES, { status: 200 })));
    const icon = await fetchMyChartIcon('https://media.epic.com/logo.svg');
    expect(icon?.contentType).toBe('image/svg+xml');
  });

  it('returns null for a missing, empty or unreachable logo', async () => {
    setTestTransport(() => Promise.resolve(new Response('', { status: 404 })));
    expect(await fetchMyChartIcon('https://media.epic.com/gone.png')).toBeNull();

    setTestTransport(() => Promise.resolve(new Response(new Uint8Array(), { status: 200 })));
    expect(await fetchMyChartIcon('https://media.epic.com/empty.png')).toBeNull();

    setTestTransport(() => Promise.reject(new Error('offline')));
    expect(await fetchMyChartIcon('https://media.epic.com/logo.png')).toBeNull();

    expect(await fetchMyChartIcon('')).toBeNull();
  });
});

describe('directoryPrefixesFor', () => {
  it('lists every mount the seed publishes for a multi-tenant host, most-listed first', () => {
    // mychart.adventhealth.com serves a handful of tenants and its root names
    // none of them; discovery has no other way to learn the mounts.
    const prefixes = directoryPrefixesFor('mychart.adventhealth.com');
    expect(prefixes).toContain('shepherdshope');
    expect(prefixes).toContain('gracemedical');
    expect(new Set(prefixes.map((p) => p.toLowerCase())).size).toBe(prefixes.length);
  });

  it('matches the host case-insensitively and answers nothing for an unknown host', () => {
    expect(directoryPrefixesFor('MYCHART.ADVENTHEALTH.COM')).toEqual(directoryPrefixesFor('mychart.adventhealth.com'));
    expect(directoryPrefixesFor('nobody.example.org')).toEqual([]);
  });
});
