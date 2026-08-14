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

  test('real instances load logos from a host the widget can actually reach', () => {
    // The widget runs on the user's machine with no credentials of ours, so
    // every logo has to come from a public host. It used to also carry an S3
    // mirror in a private bucket, which 403d for every user who hit it.
    const real = allInstances().filter((i) => i.hostname !== FAKE_HOST);
    expect(real.length).toBeGreaterThan(1000);
    expect(real.every((i) => i.logoUrl.startsWith('https://media.epic.com/'))).toBe(true);
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
