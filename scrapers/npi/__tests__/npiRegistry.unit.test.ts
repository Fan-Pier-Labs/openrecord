/**
 * The NPI Registry scraper, against a fixture in the live API's shape.
 *
 * The fixture is synthetic — every name, address and phone number is made up —
 * but its key set was taken field-for-field from live responses: an individual
 * with a former name, a Medicaid identifier, a second practice location and two
 * taxonomies, and an organization subpart with an authorized official and a
 * doing-business-as name. Those are the cases the mapping has branches for.
 */
import { afterEach, describe, expect, it } from 'bun:test';

import { setTestTransport } from '../../http';
import {
  NPI_REGISTRY_API_URL,
  NPI_REGISTRY_MAX_PAGE_SIZE,
  NpiRegistryError,
  buildNpiSearchUrl,
  isValidNpi,
  lookupNpi,
  parseNpiRegistryPayload,
  searchNpiRegistry,
} from '../npiRegistry';
import fixture from './fixtures/npi-search-response.json';

afterEach(() => setTestTransport(null));

/** What the API sends back for a refused request — HTTP 200, an `Errors` array. */
const REFUSAL = {
  Errors: [
    { description: 'Wildcards require at least two leading characters', field: 'first_name', number: '03' },
  ],
};

function serve(body: unknown, status = 200): { requests: string[] } {
  const requests: string[] = [];
  setTestTransport((url) => {
    requests.push(url);
    return Promise.resolve(
      new Response(typeof body === 'string' ? body : JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });
  return { requests };
}

describe('isValidNpi', () => {
  it('accepts a ten-digit number with the right check digit', () => {
    // CMS's own worked example from the check-digit specification.
    expect(isValidNpi('1234567893')).toBe(true);
    expect(isValidNpi('9876543213')).toBe(true);
  });

  it('rejects the wrong length, non-digits, and a failed check digit', () => {
    expect(isValidNpi('123456789')).toBe(false);
    expect(isValidNpi('12345678930')).toBe(false);
    expect(isValidNpi('123456789X')).toBe(false);
    expect(isValidNpi('1234567890')).toBe(false);
    // A transposed pair is the typo the check digit exists to catch.
    expect(isValidNpi('1234567839')).toBe(false);
    expect(isValidNpi('')).toBe(false);
  });
});

describe('parseNpiRegistryPayload', () => {
  const providers = parseNpiRegistryPayload(fixture);

  it('maps an individual provider, formatting the name and picking the primary specialty', () => {
    const jane = providers.find((p) => p.npi === '1234567893')!;
    expect(jane.type).toBe('individual');
    expect(jane.name).toBe('JANE Q DOEMANN Jr., M.D.');
    expect(jane.firstName).toBe('JANE');
    expect(jane.middleName).toBe('Q');
    expect(jane.lastName).toBe('DOEMANN');
    expect(jane.namePrefix).toBe('Dr.');
    expect(jane.nameSuffix).toBe('Jr.');
    expect(jane.credential).toBe('M.D.');
    expect(jane.sex).toBe('F');
    expect(jane.organizationName).toBe('');
    expect(jane.authorizedOfficial).toBe('');
    expect(jane.status).toBe('A');
    expect(jane.active).toBe(true);
    expect(jane.soleProprietor).toBe(false);
    expect(jane.enumerationDate).toBe('2006-08-23');
    expect(jane.lastUpdated).toBe('2024-01-15');
    // The primary taxonomy is listed second; the first one must not win.
    expect(jane.specialty).toBe('Internal Medicine, Cardiovascular Disease');
    expect(jane.taxonomies).toEqual([
      { code: '207R00000X', description: 'Internal Medicine', primary: false, license: '100001', state: 'MA', group: '' },
      {
        code: '207RC0000X',
        description: 'Internal Medicine, Cardiovascular Disease',
        primary: true,
        license: '100001',
        state: 'MA',
        group: '',
      },
    ]);
  });

  it('maps every address kind, lowercasing the purpose and keeping absent lines empty', () => {
    const jane = providers.find((p) => p.npi === '1234567893')!;
    expect(jane.addresses).toEqual([
      {
        purpose: 'location',
        line1: '123 EXAMPLE ST',
        line2: 'SUITE 400',
        city: 'SPRINGFIELD',
        state: 'MA',
        postalCode: '011010000',
        countryCode: 'US',
        phone: '555-010-0100',
        fax: '555-010-0101',
      },
      {
        purpose: 'mailing',
        line1: 'PO BOX 1',
        line2: '',
        city: 'SPRINGFIELD',
        state: 'MA',
        postalCode: '01101',
        countryCode: 'US',
        phone: '555-010-0100',
        fax: '',
      },
    ]);
    expect(jane.practiceLocations).toEqual([
      {
        purpose: 'location',
        line1: '456 SAMPLE AVE',
        line2: '',
        city: 'SHELBYVILLE',
        state: 'MA',
        postalCode: '01102',
        countryCode: 'US',
        phone: '555-010-0200',
        fax: '',
      },
    ]);
  });

  it('maps other names and identifiers', () => {
    const jane = providers.find((p) => p.npi === '1234567893')!;
    expect(jane.otherNames).toEqual([{ type: 'Former Name', name: 'JANE Q ROEBERG' }]);
    expect(jane.identifiers).toEqual([
      { identifier: 'MA000001', description: 'MEDICAID', issuer: '', state: 'MA' },
    ]);
  });

  it('maps an organization subpart with its parent, official and trade name', () => {
    const org = providers.find((p) => p.npi === '9876543213')!;
    expect(org.type).toBe('organization');
    expect(org.name).toBe('SPRINGFIELD GENERAL HOSPITAL CARDIOLOGY');
    expect(org.organizationName).toBe('SPRINGFIELD GENERAL HOSPITAL CARDIOLOGY');
    expect(org.parentOrganizationName).toBe('SPRINGFIELD GENERAL HOSPITAL');
    expect(org.authorizedOfficial).toBe('PAT EXAMPLE, Chief Financial Officer');
    expect(org.firstName).toBe('');
    expect(org.lastName).toBe('');
    expect(org.credential).toBe('');
    expect(org.sex).toBe('');
    expect(org.specialty).toBe('Clinic/Center, Multi-Specialty');
    expect(org.otherNames).toEqual([{ type: 'Doing Business As', name: 'SGH HEART CENTER' }]);
    expect(org.identifiers).toEqual([]);
    expect(org.practiceLocations).toEqual([]);
  });

  it('falls back to the first taxonomy when none is marked primary, and to empty when there are none', () => {
    const [base] = parseNpiRegistryPayload({
      results: [
        {
          number: '1234567893',
          enumeration_type: 'NPI-1',
          basic: { first_name: 'A', last_name: 'B', status: 'A' },
          taxonomies: [{ code: 'X', desc: 'First', primary: false }, { code: 'Y', desc: 'Second', primary: false }],
        },
      ],
    });
    expect(base?.specialty).toBe('First');

    const [bare] = parseNpiRegistryPayload({
      results: [{ number: '1234567893', enumeration_type: 'NPI-1', basic: { status: 'D' } }],
    });
    expect(bare?.specialty).toBe('');
    expect(bare?.active).toBe(false);
    expect(bare?.name).toBe('');
    expect(bare?.addresses).toEqual([]);
  });

  it('drops a result with no NPI', () => {
    expect(parseNpiRegistryPayload({ results: [{ basic: {} }, 'junk', null] })).toEqual([]);
  });

  it('turns the API\'s Errors array into an NpiRegistryError carrying its wording', () => {
    let caught: unknown;
    try {
      parseNpiRegistryPayload(REFUSAL);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(NpiRegistryError);
    const error = caught as NpiRegistryError;
    expect(error.message).toContain('Wildcards require at least two leading characters');
    expect(error.errors).toEqual([
      { field: 'first_name', description: 'Wildcards require at least two leading characters', number: '03' },
    ]);
    expect(() => parseNpiRegistryPayload({ Errors: [] })).toThrow(NpiRegistryError);
  });

  it('throws rather than reporting no providers when the shape changes', () => {
    expect(() => parseNpiRegistryPayload({ result_count: 0 })).toThrow(/results/);
    expect(() => parseNpiRegistryPayload(null)).toThrow(/results/);
    expect(() => parseNpiRegistryPayload('<html>')).toThrow(/results/);
  });
});

describe('buildNpiSearchUrl', () => {
  function params(url: string): Record<string, string> {
    return Object.fromEntries(new URL(url).searchParams);
  }

  it('maps every query field to the registry\'s own parameter name', () => {
    const url = buildNpiSearchUrl({
      firstName: 'Jane',
      lastName: 'Doemann',
      organizationName: 'Springfield*',
      specialty: 'Cardiology',
      city: 'Springfield',
      state: 'MA',
      postalCode: '01101',
      type: 'individual',
      limit: 25,
      skip: 50,
    });
    expect(url.startsWith(NPI_REGISTRY_API_URL)).toBe(true);
    expect(params(url)).toEqual({
      version: '2.1',
      first_name: 'Jane',
      last_name: 'Doemann',
      organization_name: 'Springfield*',
      taxonomy_description: 'Cardiology',
      city: 'Springfield',
      state: 'MA',
      postal_code: '01101',
      enumeration_type: 'NPI-1',
      limit: '25',
      skip: '50',
    });
    expect(params(buildNpiSearchUrl({ lastName: 'X', type: 'organization' })).enumeration_type).toBe('NPI-2');
  });

  it('omits blank fields and a zero skip, and defaults the page size', () => {
    const p = params(buildNpiSearchUrl({ lastName: '  Doemann ', firstName: '   ', city: '' }));
    expect(p).toEqual({ version: '2.1', last_name: 'Doemann', limit: '10' });
  });

  it('clamps the page size to what the API will actually honor', () => {
    expect(params(buildNpiSearchUrl({ lastName: 'X', limit: 999 })).limit).toBe(String(NPI_REGISTRY_MAX_PAGE_SIZE));
    // The API turns limit=0 into its default silently; sending 1 says what we meant.
    expect(params(buildNpiSearchUrl({ lastName: 'X', limit: 0 })).limit).toBe('1');
    expect(params(buildNpiSearchUrl({ lastName: 'X', limit: 7.9 })).limit).toBe('7');
    expect(params(buildNpiSearchUrl({ lastName: 'X', limit: Number.NaN })).limit).toBe('10');
    expect(params(buildNpiSearchUrl({ lastName: 'X', skip: -5 })).skip).toBeUndefined();
  });

  it('refuses a query with nothing to search for, before any request', () => {
    expect(() => buildNpiSearchUrl({})).toThrow(/at least one of/);
    expect(() => buildNpiSearchUrl({ firstName: ' ' })).toThrow(/at least one of/);
    // `type` alone is not a criterion — the API refuses it too.
    expect(() => buildNpiSearchUrl({ type: 'individual', limit: 5 })).toThrow(/at least one of/);
  });

  it('honors an overridden API base', () => {
    const url = buildNpiSearchUrl({ lastName: 'X' }, 'http://localhost:4000/npi/api/');
    expect(url.startsWith('http://localhost:4000/npi/api/?')).toBe(true);
  });
});

describe('searchNpiRegistry', () => {
  it('sends the query to the registry and parses the providers', async () => {
    const { requests } = serve(fixture);
    const providers = await searchNpiRegistry({ lastName: 'Doemann', state: 'MA', limit: 2 });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toBe(buildNpiSearchUrl({ lastName: 'Doemann', state: 'MA', limit: 2 }));
    expect(providers.map((p) => p.npi)).toEqual(['1234567893', '9876543213']);
  });

  it('makes no request for a query that names nothing', async () => {
    const { requests } = serve(fixture);
    await expect(searchNpiRegistry({})).rejects.toThrow(/at least one of/);
    expect(requests).toEqual([]);
  });

  it('surfaces the API\'s own refusal', async () => {
    serve(REFUSAL);
    await expect(searchNpiRegistry({ firstName: 'J*', lastName: 'Doemann' })).rejects.toThrow(NpiRegistryError);
  });

  it('throws on a non-OK response and on a non-JSON body instead of returning nothing', async () => {
    serve('down', 503);
    await expect(searchNpiRegistry({ lastName: 'Doemann' })).rejects.toThrow(/503/);

    serve('<html>maintenance</html>');
    await expect(searchNpiRegistry({ lastName: 'Doemann' })).rejects.toThrow(/not JSON/);
  });

  it('points at another API base when given one', async () => {
    const { requests } = serve(fixture);
    await searchNpiRegistry({ lastName: 'Doemann' }, { apiUrl: 'http://localhost:4000/npi/api/' });
    expect(requests[0]?.startsWith('http://localhost:4000/npi/api/?')).toBe(true);
  });
});

describe('lookupNpi', () => {
  it('asks the registry for the number and returns that provider', async () => {
    const { requests } = serve(fixture);
    const provider = await lookupNpi(' 9876543213 ');
    expect(Object.fromEntries(new URL(requests[0]!).searchParams)).toEqual({
      version: '2.1',
      number: '9876543213',
    });
    expect(provider?.name).toBe('SPRINGFIELD GENERAL HOSPITAL CARDIOLOGY');
  });

  it('returns null when the registry has no provider by that number', async () => {
    serve({ result_count: 0, results: [] });
    expect(await lookupNpi('1234567893')).toBeNull();
  });

  it('rejects a malformed NPI without making a request', async () => {
    const { requests } = serve(fixture);
    await expect(lookupNpi('1234567890')).rejects.toThrow(/not a valid NPI/);
    await expect(lookupNpi('12345')).rejects.toThrow(/not a valid NPI/);
    expect(requests).toEqual([]);
  });

  it('passes the API\'s refusal through', async () => {
    serve({ Errors: [{ description: 'NPI must be 10 digits', field: 'number', number: '06' }] });
    await expect(lookupNpi('1234567893')).rejects.toThrow(/NPI must be 10 digits/);
  });
});
