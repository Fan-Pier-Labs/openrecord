import { describe, it, expect } from 'bun:test'
import {
  compareReleases,
  learnBuildHashes,
  normalizeOrganizationName,
  parseBuildHash,
  parseSoftwareVersion,
  type VersionProbeResult,
} from '../probe-epic-version'

/**
 * The sweep itself talks to ~750 real hospitals and Epic's endpoint list, so
 * nothing runs it on a commit. These hold the four pure parts to the shapes
 * real instances actually returned during the sweep — each one is a place
 * where a wrong answer looks exactly like a right one.
 */

describe('parseSoftwareVersion', () => {
  const capabilityStatement =
    '{"resourceType":"CapabilityStatement","status":"active","date":"2026-09-08T02:32:18Z",' +
    '"copyright":"Copyright Epic 1979-2025","kind":"instance",' +
    '"instantiates":["http://hl7.org/fhir/us/core/CapabilityStatement/us-core-server|6.1.0"],' +
    '"software":{"name":"Epic","version":"November 2025","releaseDate":"2026-04-08"},' +
    '"fhirVersion":"4.0.1","format":["xml","json"]}'

  it('reads the release out of a real prefix', () => {
    expect(parseSoftwareVersion(capabilityStatement)).toBe('November 2025')
  })

  it('does not mistake fhirVersion for the release', () => {
    // `fhirVersion` is 4.0.1 on every Epic instance ever shipped, so a bare
    // `"version"` match answers confidently and identically for all of them.
    const noSoftware = capabilityStatement.replace(/"software":\{[^}]*\},/, '')
    expect(parseSoftwareVersion(noSoftware)).toBeNull()
  })

  it('is null on a truncated prefix rather than guessing', () => {
    expect(parseSoftwareVersion('{"resourceType":"CapabilityStatement","softwa')).toBeNull()
  })
})

describe('parseBuildHash', () => {
  it('reads the header bundle hash, url-encoded as it arrives', () => {
    const html = '<script src="/MyChart/bundles/core-4-header?v=9FrK4pDAQpeOOfTcn9mA%2fXQ1"></script>'
    expect(parseBuildHash(html)).toBe('9FrK4pDAQpeOOfTcn9mA%2fXQ1')
  })

  it('stops at the query separator, not the end of the attribute', () => {
    const html = '<script src="/mychart/bundles/core-4-header?v=abc123&amp;foo=bar"></script>'
    expect(parseBuildHash(html)).toBe('abc123')
  })

  it('is null on a page that carries no bundle', () => {
    expect(parseBuildHash('<html><body>Service unavailable</body></html>')).toBeNull()
  })
})

describe('normalizeOrganizationName', () => {
  it('matches the same system named differently by the two directories', () => {
    expect(normalizeOrganizationName('Foo Health System')).toBe(normalizeOrganizationName('Foo Healthcare'))
    expect(normalizeOrganizationName("St. Jude's Medical Center")).toBe(normalizeOrganizationName('St Judes'))
  })

  it('keeps genuinely different systems apart', () => {
    expect(normalizeOrganizationName('Foo Health')).not.toBe(normalizeOrganizationName('Bar Health'))
  })
})

describe('learnBuildHashes', () => {
  const row = (buildHash: string, namedRelease?: string): VersionProbeResult => ({
    host: `${buildHash}-${namedRelease ?? 'none'}-${Math.random()}`,
    names: [],
    buildHash,
    namedRelease,
  })

  it('takes the majority release for a hash, not the first one seen', () => {
    // One Community Connect portal is served by its host system's instance
    // while its FHIR endpoint points at its own — a single dissenting host
    // must not relabel the whole build.
    const table = learnBuildHashes([
      row('h1', 'February 2026'),
      row('h1', 'November 2025'),
      row('h1', 'November 2025'),
      row('h1', 'November 2025'),
    ])
    expect(table.get('h1')).toBe('November 2025')
  })

  it('ignores hosts with no release to learn from', () => {
    const table = learnBuildHashes([row('h2'), row('h3', 'May 2026')])
    expect(table.has('h2')).toBe(false)
    expect(table.get('h3')).toBe('May 2026')
  })
})

describe('compareReleases', () => {
  it('sorts newest first, by release rather than alphabetically', () => {
    const releases = ['August 2025', 'May 2026', 'February 2026', 'November 2025', 'February 2025']
    expect([...releases].sort(compareReleases)).toEqual([
      'May 2026',
      'February 2026',
      'November 2025',
      'August 2025',
      'February 2025',
    ])
  })
})
