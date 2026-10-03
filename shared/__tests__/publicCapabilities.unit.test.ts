/**
 * The `public` capabilities, driven the way a client drives them: through
 * `executeCapability` with no session at all.
 *
 * What is worth testing here is the *mapping* — the tool's snake_case
 * arguments onto the scraper's camelCase query, which nothing else checks. A
 * `postal_code` that quietly failed to reach `postal_code` would look exactly
 * like a search nobody matched, so every criterion is asserted against the URL
 * that actually went out.
 *
 * `capability-parity.unit.test.ts` covers the other half — that no client asks
 * for an `account` or a `patient` on one of these.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { setTestTransport } from '../../scrapers/http';
import { clearDirectoryCache } from '../../scrapers/list-all-mycharts/searchDirectory';
import { executeCapability, PUBLIC_CAPABILITY_IDS } from '../capabilities';
import npiFixture from '../../scrapers/npi/__tests__/fixtures/npi-search-response.json';
import directoryFixture from '../../scrapers/list-all-mycharts/__tests__/fixtures/directory-response.json';

/** Every URL the capability under test asked for, in order. */
let requested: string[] = [];

function serve(payload: unknown) {
  setTestTransport((url) => {
    requested.push(url);
    return Promise.resolve(new Response(JSON.stringify(payload), { status: 200 }));
  });
}

beforeEach(() => {
  requested = [];
  clearDirectoryCache();
});
afterEach(() => {
  setTestTransport(null);
  clearDirectoryCache();
});

/** The query string of the one request the capability made. */
function sentParams(): URLSearchParams {
  expect(requested).toHaveLength(1);
  return new URL(requested[0]!).searchParams;
}

describe('lookup_npi', () => {
  it('sends the number and renders the provider', async () => {
    serve(npiFixture);
    const result = (await executeCapability(null, 'lookup_npi', {
      npi: '1234567893',
      mode: 'json',
    })) as { number: string; providerName: string };

    expect(sentParams().get('number')).toBe('1234567893');
    expect(result.number).toBe('1234567893');
    expect(result.providerName).toBe('JANE Q DOEMANN Jr., M.D.');
  });

  it('takes the registry `mode` like any other read', async () => {
    serve(npiFixture);
    // `concise` renders markdown, same as every chart read — the point being
    // that a public capability is a read, not a special case.
    const concise = (await executeCapability(null, 'lookup_npi', {
      npi: '1234567893',
      mode: 'concise',
    })) as string;
    expect(concise).toContain('**primarySpecialty**: Internal Medicine, Cardiovascular Disease');
    // The concise projection drops `basic` and keeps the derived fields.
    expect(concise).not.toContain('sole_proprietor');

    serve(npiFixture);
    const raw = (await executeCapability(null, 'lookup_npi', {
      npi: '1234567893',
      mode: 'raw',
    })) as { result_count: number };
    // Untouched: the registry's own envelope, not the single provider the
    // standard object narrows it to.
    expect(raw.result_count).toBe(2);
  });

  it('requires the number, and spends no request on a malformed one', async () => {
    serve(npiFixture);
    await expect(executeCapability(null, 'lookup_npi', {})).rejects.toThrow(/Missing required argument "npi"/);
    await expect(executeCapability(null, 'lookup_npi', { npi: '1234567890' })).rejects.toThrow(
      /not a valid NPI/,
    );
    expect(requested).toEqual([]);
  });
});

describe('search_npi_registry', () => {
  it('maps every declared argument onto the registry’s own parameter name', async () => {
    serve(npiFixture);
    await executeCapability(null, 'search_npi_registry', {
      first_name: 'Jane',
      last_name: 'Doemann',
      organization_name: 'Example Health',
      specialty: 'Cardiology',
      city: 'Springfield',
      state: 'MA',
      postal_code: '01101',
      type: 'individual',
      limit: 25,
      skip: 10,
    });

    const params = sentParams();
    expect(Object.fromEntries(params)).toEqual({
      version: '2.1',
      first_name: 'Jane',
      last_name: 'Doemann',
      organization_name: 'Example Health',
      taxonomy_description: 'Cardiology',
      city: 'Springfield',
      state: 'MA',
      postal_code: '01101',
      enumeration_type: 'NPI-1',
      limit: '25',
      skip: '10',
    });
  });

  it('maps the organization type, and leaves limit and skip to the registry when unset', async () => {
    serve(npiFixture);
    await executeCapability(null, 'search_npi_registry', {
      organization_name: 'Example Health',
      type: 'organization',
    });
    const params = sentParams();
    expect(params.get('enumeration_type')).toBe('NPI-2');
    // The registry's own default page size, not one this layer invented.
    expect(params.get('limit')).toBe('10');
    expect(params.has('skip')).toBe(false);
  });

  it('refuses an unknown type rather than silently widening the search', async () => {
    serve(npiFixture);
    await expect(
      executeCapability(null, 'search_npi_registry', { last_name: 'Doe', type: 'organisation' }),
    ).rejects.toThrow(/Expected "individual" or "organization"/);
    expect(requested).toEqual([]);
  });

  it('refuses a query naming nothing to search for', async () => {
    serve(npiFixture);
    await expect(executeCapability(null, 'search_npi_registry', {})).rejects.toThrow(
      /needs at least one of/,
    );
    // An empty string is not a criterion either.
    await expect(executeCapability(null, 'search_npi_registry', { last_name: '  ' })).rejects.toThrow(
      /needs at least one of/,
    );
    expect(requested).toEqual([]);
  });

  it('returns the registry’s own envelope', async () => {
    serve(npiFixture);
    const result = (await executeCapability(null, 'search_npi_registry', {
      last_name: 'Doemann',
      mode: 'json',
    })) as { result_count: number; results: Array<{ number: string }> };
    expect(result.result_count).toBe(2);
    expect(result.results.map((r) => r.number)).toEqual(['1234567893', '9876543213']);
  });

  it('passes a refusal through as data rather than throwing', async () => {
    // CMS refuses with HTTP 200 and an `Errors` array. Turning that into a
    // throw here would lose the sentence that says what was wrong.
    serve({ Errors: [{ field: 'state', description: 'Field state requires additional search criteria.', number: '4' }] });
    const result = (await executeCapability(null, 'search_npi_registry', {
      state: 'MA',
      mode: 'json',
    })) as { Errors: Array<{ description: string }> };
    expect(result.Errors[0]?.description).toBe('Field state requires additional search criteria.');
  });
});

describe('search_mycharts', () => {
  it('searches the directory and returns the fields a picker renders', async () => {
    serve(directoryFixture);
    const result = (await executeCapability(null, 'search_mycharts', { query: 'AACI' })) as {
      query: string;
      source: string;
      count: number;
      matches: Array<{ hostname: string; name: string; loginUrl: string }>;
    };

    expect(requested[0]).toContain('/cached-api/help/organizations/');
    expect(result.source).toBe('live');
    expect(result.query).toBe('AACI');
    expect(result.count).toBe(1);
    expect(result.matches[0]).toMatchObject({
      hostname: 'mychart.ochin.org',
      name: 'AACI',
      loginUrl: 'https://mychart.ochin.org/MyChartAACI/',
    });
  });

  it('honours a limit, and defaults to ten without one', async () => {
    serve(directoryFixture);
    const capped = (await executeCapability(null, 'search_mycharts', {
      query: 'mychart',
      limit: 1,
    })) as { matches: unknown[] };
    expect(capped.matches).toHaveLength(1);

    const defaulted = (await executeCapability(null, 'search_mycharts', { query: 'a' })) as {
      matches: unknown[];
    };
    expect(defaulted.matches.length).toBeLessThanOrEqual(10);
  });

  it('requires a query rather than dumping the whole directory', async () => {
    serve(directoryFixture);
    await expect(executeCapability(null, 'search_mycharts', {})).rejects.toThrow(
      /Missing required argument "query"/,
    );
  });

  it('has no `mode`, because it returns a finished object rather than a scrape', async () => {
    const { acceptsModeParam, getCapability } = await import('../capabilities');
    expect(acceptsModeParam(getCapability('search_mycharts')!)).toBe(false);
    expect(acceptsModeParam(getCapability('lookup_npi')!)).toBe(true);
  });
});

describe('the set itself', () => {
  it('is what this file covers, so a new one cannot arrive untested', () => {
    expect([...PUBLIC_CAPABILITY_IDS].sort()).toEqual([
      'lookup_npi',
      'search_mycharts',
      'search_npi_registry',
    ]);
  });
});
