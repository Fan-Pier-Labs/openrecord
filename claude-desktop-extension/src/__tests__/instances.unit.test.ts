import { describe, expect, test } from 'bun:test';
import {
  allInstances,
  searchInstances,
  findByHostname,
} from '../instances';

const FAKE_HOST = 'fake-mychart.fanpierlabs.com';

describe('instances catalog', () => {
  test('includes the real MyChart directory', () => {
    // The bundled directory has well over a thousand entries; the exact count
    // changes when the directory is refreshed, so just assert a sane floor.
    expect(allInstances().length).toBeGreaterThan(1000);
  });

  test('includes the fake-mychart test entry, labeled "(test)" with a logo', () => {
    const fake = allInstances().find((i) => i.hostname === FAKE_HOST);
    expect(fake).toBeDefined();
    expect(fake!.name.toLowerCase()).toContain('(test)');
    expect(fake!.url).toContain(FAKE_HOST);
    // Has a self-contained (data URI) banner logo so it renders like the others.
    expect(fake!.logoUrl.startsWith('data:image/svg+xml')).toBe(true);
  });

  test('real instances prefer the public Epic logo over the private S3 mirror', () => {
    // The S3 mirror (s3.amazonaws.com) 403s without AWS creds; the Epic CDN
    // (ichart2.epic.com) is public. A real entry should use the Epic URL.
    const real = allInstances().find((i) => i.logoUrl.includes('ichart2.epic.com'));
    expect(real).toBeDefined();
    expect(allInstances().some((i) => i.logoUrl.includes('s3.us-east-2.amazonaws.com'))).toBe(false);
  });
});

describe('searchInstances', () => {
  test('finds the test entry by name fragment', () => {
    const byCity = searchInstances('springfield');
    expect(byCity.some((i) => i.hostname === FAKE_HOST)).toBe(true);

    const byTest = searchInstances('test');
    expect(byTest.some((i) => i.hostname === FAKE_HOST)).toBe(true);
  });

  test('finds the test entry by hostname fragment', () => {
    const byHost = searchInstances('fake-mychart');
    expect(byHost.some((i) => i.hostname === FAKE_HOST)).toBe(true);
  });

  test('returns [] for an empty query', () => {
    expect(searchInstances('')).toEqual([]);
  });

  test('still resolves real health systems', () => {
    // Sanity: a real entry from the directory is still searchable.
    const matches = searchInstances('mychart');
    expect(matches.length).toBeGreaterThan(0);
  });
});

describe('findByHostname', () => {
  test('resolves the fake-mychart test entry (case-insensitive)', () => {
    expect(findByHostname(FAKE_HOST)?.hostname).toBe(FAKE_HOST);
    expect(findByHostname(FAKE_HOST.toUpperCase())?.hostname).toBe(FAKE_HOST);
  });

  test('returns undefined for unknown hostnames', () => {
    expect(findByHostname('not-a-real-host.example')).toBeUndefined();
  });
});
