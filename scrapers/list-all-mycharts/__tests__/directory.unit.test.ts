/**
 * The directory scrapers, against a fixture captured from the live endpoint.
 *
 * The fixture keeps the real response's shape — including the two logo
 * fallbacks and the entry with no `loginUrl` — because every interesting case
 * in this parser is a field that is *absent*, and a hand-written happy-path
 * object has none of them.
 */
import { afterEach, describe, expect, it } from 'bun:test';

import { setTestTransport } from '../../http';
import {
  defaultLogoUrl,
  fetchMyChartDirectory,
  fetchMyChartIcon,
  logoUrlFor,
  parseDirectoryPayload,
} from '../directory';
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
      logoUrl:
        'https://media.epic.com/mychartdotorg/directus/organizations/C7785A28-8697-454E-9FFD-23E143F9F672/caba6e8737d0c70cdbfd2f92d373084a.png',
      slgId: '432-112',
      aliases: [],
      states: ['CA'],
      countries: ['US'],
      brandName: 'MyChart',
      liveOnCentral: true,
    });
  });

  it('keeps the aliases an organization is also searched by', () => {
    const elCamino = instances.find((i) => i.slgId === '920-1');
    expect(elCamino?.aliases).toEqual(['Silicon Valley Sports Medicine']);
  });

  it('throws rather than reporting an empty directory when the shape changes', () => {
    expect(() => parseDirectoryPayload({ orgs: [] })).toThrow(/organizations/);
    expect(() => parseDirectoryPayload(null)).toThrow(/organizations/);
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
