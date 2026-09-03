/**
 * The NPI Registry scraper and its processors, against a fixture in the live
 * API's shape.
 *
 * The fixture is synthetic — every name, address and phone number is made up —
 * but its key set was taken field-for-field from live responses: an individual
 * with a former name, a Medicaid identifier, a Direct endpoint, a second
 * practice location and two taxonomies, and an organization subpart with an
 * authorized official and a doing-business-as name. Those are the cases the
 * mapping has branches for.
 */
import { afterEach, describe, expect, it } from 'bun:test';

import { setTestTransport } from '../../http';
import type { RawResponse } from '../../myChart/core/rawResponse';
import { renderOutput } from '../../myChart/processors/processor';
import {
  NPI_REGISTRY_API_URL,
  NPI_REGISTRY_MAX_PAGE_SIZE,
  buildNpiSearchUrl,
  fetchNpiLookupRaw,
  fetchNpiSearchRaw,
  isNpiRegistryErrors,
  isValidNpi,
  lookupNpi,
  npiLookupProcessor,
  npiSearchProcessor,
  searchNpiRegistry,
  type NpiSearchStandard,
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

/** The envelope the scraper builds: one GET, the parsed body. */
function envelope(body: unknown): RawResponse {
  return {
    requests: [
      { path: `${NPI_REGISTRY_API_URL}?version=2.1`, method: 'GET', status: 200, contentType: 'application/json', body },
    ],
  };
}

const INDIVIDUAL = fixture.results[0]!;
const ORGANIZATION = fixture.results[1]!;

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
    expect(params(buildNpiSearchUrl({ lastName: '  Doemann ', firstName: '   ', city: '' }))).toEqual({
      version: '2.1',
      last_name: 'Doemann',
      limit: '10',
    });
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
    expect(buildNpiSearchUrl({ lastName: 'X' }, 'http://localhost:4000/npi/api/')).toStartWith(
      'http://localhost:4000/npi/api/?',
    );
  });
});

describe('fetchNpiSearchRaw', () => {
  it('records the one GET and the body exactly as the registry sent it', async () => {
    const { requests } = serve(fixture);
    const raw = await fetchNpiSearchRaw({ lastName: 'Doemann', state: 'MA', limit: 2 });
    expect(requests).toEqual([buildNpiSearchUrl({ lastName: 'Doemann', state: 'MA', limit: 2 })]);
    expect(raw.requests).toHaveLength(1);
    expect(raw.requests[0]).toMatchObject({ method: 'GET', status: 200, contentType: 'application/json' });
    expect(raw.requests[0]!.body).toEqual(fixture);
  });

  it('records a refusal body untouched rather than throwing', async () => {
    serve(REFUSAL);
    const raw = await fetchNpiSearchRaw({ firstName: 'J*', lastName: 'Doemann' });
    expect(raw.requests[0]!.body).toEqual(REFUSAL);
  });

  it('makes no request for a query that names nothing', async () => {
    const { requests } = serve(fixture);
    await expect(fetchNpiSearchRaw({})).rejects.toThrow(/at least one of/);
    expect(requests).toEqual([]);
  });

  it('throws on a non-OK response and on a non-JSON body instead of returning nothing', async () => {
    serve('down', 503);
    await expect(fetchNpiSearchRaw({ lastName: 'Doemann' })).rejects.toThrow(/503/);

    serve('<html>maintenance</html>');
    await expect(fetchNpiSearchRaw({ lastName: 'Doemann' })).rejects.toThrow(/not JSON/);
  });

  it('points at another API base when given one', async () => {
    const { requests } = serve(fixture);
    await fetchNpiSearchRaw({ lastName: 'Doemann' }, { apiUrl: 'http://localhost:4000/npi/api/' });
    expect(requests[0]).toStartWith('http://localhost:4000/npi/api/?');
  });
});

describe('fetchNpiLookupRaw', () => {
  it('asks the registry for the number alone', async () => {
    const { requests } = serve(fixture);
    await fetchNpiLookupRaw(' 9876543213 ');
    expect(Object.fromEntries(new URL(requests[0]!).searchParams)).toEqual({
      version: '2.1',
      number: '9876543213',
    });
  });

  it('rejects a malformed NPI without making a request', async () => {
    const { requests } = serve(fixture);
    await expect(fetchNpiLookupRaw('1234567890')).rejects.toThrow(/not a valid NPI/);
    await expect(fetchNpiLookupRaw('12345')).rejects.toThrow(/not a valid NPI/);
    expect(requests).toEqual([]);
  });
});

describe('npiSearchProcessor', () => {
  const standard = npiSearchProcessor.standard(envelope(fixture)) as NpiSearchStandard;

  it('keeps the result count and one entry per provider', () => {
    expect(standard.result_count).toBe(2);
    expect(standard.results.map((p) => p.number)).toEqual(['1234567893', '9876543213']);
  });

  it('derives the display name, specialty, address and phone for an individual', () => {
    const jane = standard.results[0]!;
    expect(jane.enumeration_type).toBe('NPI-1');
    expect(jane.providerName).toBe('JANE Q DOEMANN Jr., M.D.');
    // The primary taxonomy is listed second; the first one must not win.
    expect(jane.primarySpecialty).toBe('Internal Medicine, Cardiovascular Disease');
    // The LOCATION address, not the MAILING one that follows it.
    expect(jane.primaryAddress).toBe('123 EXAMPLE ST SUITE 400, SPRINGFIELD, MA 011010000');
    expect(jane.primaryPhone).toBe('555-010-0100');
  });

  it('derives the organization\'s name from its own field', () => {
    const org = standard.results[1]!;
    expect(org.enumeration_type).toBe('NPI-2');
    expect(org.providerName).toBe('SPRINGFIELD GENERAL HOSPITAL CARDIOLOGY');
    expect(org.primarySpecialty).toBe('Clinic/Center, Multi-Specialty');
    expect(org.primaryAddress).toBe('1 HOSPITAL WAY, SPRINGFIELD, MA 01101');
  });

  it('keeps every captured basic field under CMS\'s own name, as one union of both record types', () => {
    expect(standard.results[0]!.basic).toEqual({
      status: 'A',
      enumeration_date: '2006-08-23',
      last_updated: '2024-01-15',
      certification_date: '2024-01-15',
      first_name: 'JANE',
      middle_name: 'Q',
      last_name: 'DOEMANN',
      name_prefix: 'Dr.',
      name_suffix: 'Jr.',
      credential: 'M.D.',
      sex: 'F',
      sole_proprietor: 'NO',
      // Rule 6: the organization names are on the list for every provider.
      organization_name: null,
      organizational_subpart: null,
      parent_organization_legal_business_name: null,
      authorized_official_first_name: null,
      authorized_official_middle_name: null,
      authorized_official_last_name: null,
      authorized_official_name_prefix: null,
      authorized_official_name_suffix: null,
      authorized_official_credential: null,
      authorized_official_title_or_position: null,
      authorized_official_telephone_number: null,
    });

    const org = standard.results[1]!.basic;
    expect(org.organization_name).toBe('SPRINGFIELD GENERAL HOSPITAL CARDIOLOGY');
    expect(org.organizational_subpart).toBe('YES');
    expect(org.parent_organization_legal_business_name).toBe('SPRINGFIELD GENERAL HOSPITAL');
    expect(org.authorized_official_last_name).toBe('EXAMPLE');
    expect(org.authorized_official_title_or_position).toBe('Chief Financial Officer');
    // And the person's names are on the list for the organization.
    expect(org.first_name).toBeNull();
    expect(org.credential).toBeNull();
  });

  it('keeps taxonomies, addresses, practice locations and identifiers under their own names', () => {
    const jane = standard.results[0]!;
    expect(jane.taxonomies).toEqual([
      { code: '207R00000X', desc: 'Internal Medicine', primary: false, license: '100001', state: 'MA', taxonomy_group: '' },
      {
        code: '207RC0000X',
        desc: 'Internal Medicine, Cardiovascular Disease',
        primary: true,
        license: '100001',
        state: 'MA',
        taxonomy_group: '',
      },
    ]);
    expect(jane.addresses[0]).toEqual({
      address_purpose: 'LOCATION',
      address_type: 'DOM',
      address_1: '123 EXAMPLE ST',
      address_2: 'SUITE 400',
      city: 'SPRINGFIELD',
      state: 'MA',
      postal_code: '011010000',
      country_code: 'US',
      country_name: 'United States',
      telephone_number: '555-010-0100',
      fax_number: '555-010-0101',
    });
    // Rule 6: a field absent from this address is still on the row, as null.
    expect(jane.addresses[1]!.address_2).toBeNull();
    expect(jane.addresses[1]!.fax_number).toBeNull();
    expect(jane.practiceLocations[0]!.city).toBe('SHELBYVILLE');
    expect(jane.identifiers).toEqual([
      { identifier: 'MA000001', code: '05', desc: 'MEDICAID', issuer: '', state: 'MA' },
    ]);
  });

  it('passes the uncaptured arrays through whole and keeps both epoch fields', () => {
    const jane = standard.results[0]!;
    expect(jane.other_names).toEqual(INDIVIDUAL.other_names);
    expect(jane.endpoints).toEqual(INDIVIDUAL.endpoints);
    expect(standard.results[1]!.other_names).toEqual(ORGANIZATION.other_names);
    // Kept because they disagree with the date strings on ~12% of real records.
    expect(jane.created_epoch).toBe('1156343752000');
    expect(jane.last_updated_epoch).toBe('1705276800000');
  });

  it('emits every field on a provider with nothing in it', () => {
    const bare = npiSearchProcessor.standard(envelope({ result_count: 1, results: [{}] })) as NpiSearchStandard;
    const provider = bare.results[0]!;
    expect(provider.number).toBeNull();
    expect(provider.providerName).toBe('');
    expect(provider.primarySpecialty).toBe('');
    expect(provider.primaryAddress).toBe('');
    expect(provider.primaryPhone).toBe('');
    expect(Object.values(provider.basic).every((v) => v === null)).toBe(true);
    expect(provider.taxonomies).toEqual([]);
    expect(provider.addresses).toEqual([]);
  });

  it('reports no matches as no matches', () => {
    const empty = npiSearchProcessor.standard(envelope({ result_count: 0, results: [] })) as NpiSearchStandard;
    expect(empty).toEqual({ result_count: 0, results: [] });
  });

  it('falls back to the first taxonomy when none is primary, and to the first address with no LOCATION', () => {
    const standardNoPrimary = npiSearchProcessor.standard(
      envelope({
        results: [
          {
            taxonomies: [{ desc: 'First' }, { desc: 'Second' }],
            addresses: [{ address_purpose: 'MAILING', address_1: 'PO BOX 9', city: 'SPRINGFIELD', state: 'MA' }],
          },
        ],
      }),
    ) as NpiSearchStandard;
    expect(standardNoPrimary.results[0]!.primarySpecialty).toBe('First');
    expect(standardNoPrimary.results[0]!.primaryAddress).toBe('PO BOX 9, SPRINGFIELD, MA');
  });

  it('passes a refusal through unchanged in every mode (rule 7)', () => {
    const refusal = npiSearchProcessor.standard(envelope(REFUSAL));
    expect(refusal).toEqual(REFUSAL);
    expect(isNpiRegistryErrors(refusal)).toBe(true);
    expect(npiSearchProcessor.concise(refusal)).toEqual(REFUSAL);
    expect(renderOutput(npiSearchProcessor, envelope(REFUSAL), 'json')).toEqual(REFUSAL);
    expect(renderOutput(npiSearchProcessor, envelope(REFUSAL), 'concise')).toContain(
      'Wildcards require at least two leading characters',
    );
  });

  it('projects concise to who, what kind, where and the NPI to follow up with', () => {
    expect(npiSearchProcessor.concise(standard)).toEqual({
      result_count: 2,
      results: [
        {
          number: '1234567893',
          providerName: 'JANE Q DOEMANN Jr., M.D.',
          enumeration_type: 'NPI-1',
          primarySpecialty: 'Internal Medicine, Cardiovascular Disease',
          primaryAddress: '123 EXAMPLE ST SUITE 400, SPRINGFIELD, MA 011010000',
          primaryPhone: '555-010-0100',
        },
        {
          number: '9876543213',
          providerName: 'SPRINGFIELD GENERAL HOSPITAL CARDIOLOGY',
          enumeration_type: 'NPI-2',
          primarySpecialty: 'Clinic/Center, Multi-Specialty',
          primaryAddress: '1 HOSPITAL WAY, SPRINGFIELD, MA 01101',
          primaryPhone: '555-010-0300',
        },
      ],
    });
  });
});

describe('npiLookupProcessor', () => {
  it('returns the one provider the number belongs to', () => {
    const provider = npiLookupProcessor.standard(envelope({ result_count: 1, results: [ORGANIZATION] }));
    expect(provider).not.toBeNull();
    expect(isNpiRegistryErrors(provider)).toBe(false);
    expect((provider as { providerName: string }).providerName).toBe('SPRINGFIELD GENERAL HOSPITAL CARDIOLOGY');
  });

  it('returns null when the registry has nobody by that number', () => {
    expect(npiLookupProcessor.standard(envelope({ result_count: 0, results: [] }))).toBeNull();
    expect(npiLookupProcessor.concise(null)).toBeNull();
    // Rule 7: null survives rendering rather than becoming an empty page.
    expect(renderOutput(npiLookupProcessor, envelope({ results: [] }), 'json')).toBeNull();
  });

  it('passes a refusal through unchanged', () => {
    const refusal = npiLookupProcessor.standard(envelope(REFUSAL));
    expect(refusal).toEqual(REFUSAL);
    expect(npiLookupProcessor.concise(refusal)).toEqual(REFUSAL);
  });

  it('projects concise to the same row the search does', () => {
    const provider = npiLookupProcessor.standard(envelope({ results: [INDIVIDUAL] }));
    expect(npiLookupProcessor.concise(provider)).toEqual({
      number: '1234567893',
      providerName: 'JANE Q DOEMANN Jr., M.D.',
      enumeration_type: 'NPI-1',
      primarySpecialty: 'Internal Medicine, Cardiovascular Disease',
      primaryAddress: '123 EXAMPLE ST SUITE 400, SPRINGFIELD, MA 011010000',
      primaryPhone: '555-010-0100',
    });
  });
});

describe('the standard-object convenience wrappers', () => {
  it('searchNpiRegistry runs the scraper and the processor', async () => {
    serve(fixture);
    const result = await searchNpiRegistry({ lastName: 'Doemann', state: 'MA' });
    expect(isNpiRegistryErrors(result)).toBe(false);
    expect((result as NpiSearchStandard).results.map((p) => p.providerName)).toEqual([
      'JANE Q DOEMANN Jr., M.D.',
      'SPRINGFIELD GENERAL HOSPITAL CARDIOLOGY',
    ]);
  });

  it('lookupNpi returns the provider, and null for an unheld number', async () => {
    serve({ result_count: 1, results: [ORGANIZATION] });
    expect(await lookupNpi('9876543213')).toMatchObject({ number: '9876543213' });

    serve({ result_count: 0, results: [] });
    expect(await lookupNpi('1234567893')).toBeNull();
  });

  it('surfaces a refused query as data rather than as a throw', async () => {
    serve(REFUSAL);
    expect(await searchNpiRegistry({ firstName: 'J*', lastName: 'Doemann' })).toEqual(REFUSAL);
  });
});

describe('raw mode', () => {
  it('returns the registry\'s own body, not the envelope, for the single request', () => {
    expect(renderOutput(npiSearchProcessor, envelope(fixture), 'raw')).toEqual(fixture);
  });

  it('renders the standard object as markdown', () => {
    const markdown = renderOutput(npiSearchProcessor, envelope(fixture), 'standard') as string;
    expect(markdown).toContain('JANE Q DOEMANN Jr., M.D.');
    expect(markdown).toContain('SPRINGFIELD GENERAL HOSPITAL');
    // The uncaptured arrays are still there, so nothing silently vanishes.
    expect(markdown).toContain('endpoints');
  });
});
