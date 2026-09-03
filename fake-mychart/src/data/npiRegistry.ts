/**
 * CMS's NPI Registry, as this instance's providers would appear in it.
 *
 * The third non-MyChart surface this server stands in for, after mychart.org's
 * organization directory and Epic's media host. The registry is a public JSON
 * API with no key and no login, and the scraper that reads it is
 * `scrapers/npi/npiRegistry.ts`; without a fake, testing it over a real socket
 * means querying CMS about real, named clinicians on every CI run.
 *
 * ## Shape
 *
 * {@link npiPersonShape} and {@link npiOrganizationShape} are the two field
 * sets observed on the live API, taken from the same capture as
 * `scrapers/npi/__tests__/fixtures/npi-search-response.json` (883 records
 * across six queries; see `scrapers/npi/README.md`). They are used with
 * `conformToShape` exactly like the skeletons in `realShapes.ts`, so a fixture
 * here that omits `endpoints` or `other_names` still answers with them present
 * and empty — as the real API does.
 *
 * It lives here rather than in `realShapes.ts` because that file is generated
 * from captures of real *MyChart* instances, and a regeneration of it must not
 * have to know about CMS.
 */

const addressShape = {
  address_purpose: '',
  address_type: '',
  address_1: '',
  address_2: '',
  city: '',
  state: '',
  postal_code: '',
  country_code: '',
  country_name: '',
  telephone_number: '',
  fax_number: '',
} as const;

/**
 * The two `basic` key sets are **disjoint**, and that is deliberate.
 *
 * A person's record carries no `organization_name`; an organization's carries
 * no `first_name`. Not empty — absent. Unioning them would make every record
 * from this fake answer questions the live API leaves unanswered, and a client
 * that read `basic.first_name` on an organization would look correct here and
 * return an empty string in production.
 */
const personBasicShape = {
  status: '',
  enumeration_date: '',
  last_updated: '',
  certification_date: '',
  first_name: '',
  middle_name: '',
  last_name: '',
  name_prefix: '',
  name_suffix: '',
  credential: '',
  sex: '',
  sole_proprietor: '',
} as const;

const organizationBasicShape = {
  status: '',
  enumeration_date: '',
  last_updated: '',
  certification_date: '',
  organization_name: '',
  organizational_subpart: '',
  parent_organization_legal_business_name: '',
  authorized_official_first_name: '',
  authorized_official_middle_name: '',
  authorized_official_last_name: '',
  authorized_official_name_prefix: '',
  authorized_official_name_suffix: '',
  authorized_official_credential: '',
  authorized_official_title_or_position: '',
  authorized_official_telephone_number: '',
} as const;

const commonProviderShape = {
  number: '',
  enumeration_type: '',
  created_epoch: '',
  last_updated_epoch: '',
  taxonomies: [
    { code: '', desc: '', primary: false, license: '', state: '', taxonomy_group: '' },
  ],
  addresses: [addressShape],
  practiceLocations: [addressShape],
  identifiers: [{ code: '', desc: '', identifier: '', issuer: '', state: '' }],
  // `other_names` and `endpoints` keep no element shape: their keys differ
  // record to record (a former *person* name and a doing-business-as name have
  // different fields; endpoints ranged over 14–18 keys in the capture), so
  // rule 10 applies and the element passes through whole.
  other_names: [],
  endpoints: [],
} as const;

/** One person's record — `NPI-1`. */
export const npiPersonShape = { ...commonProviderShape, basic: personBasicShape } as const;

/** One organization's record — `NPI-2`, including a subpart. */
export const npiOrganizationShape = { ...commonProviderShape, basic: organizationBasicShape } as const;

export interface FakeNpiProvider {
  number: string;
  enumeration_type: 'NPI-1' | 'NPI-2';
  created_epoch: string;
  last_updated_epoch: string;
  basic: Record<string, string>;
  taxonomies: Array<{ code: string; desc: string; primary: boolean; license: string; state: string; taxonomy_group: string }>;
  addresses: Array<Record<string, string>>;
  /** Omitted entries answer as empty arrays, which is what the live API sends. */
  practiceLocations?: Array<Record<string, string>>;
  identifiers?: Array<Record<string, string>>;
  other_names?: Array<Record<string, string>>;
}

/**
 * The providers this registry holds — the same cast as the portal's care team,
 * so a test can go from `get_care_team` to `lookup_npi` the way a caller does.
 *
 * Every `number` is a well-formed NPI: ten digits whose last one is the right
 * Luhn check digit over `80840` + the number. The scraper refuses a malformed
 * NPI before making a request, so a fixture with an invented number would be
 * unreachable through it.
 */
export const fakeNpiProviders: FakeNpiProvider[] = [
  {
    number: '1234567893',
    enumeration_type: 'NPI-1',
    created_epoch: '1156343752000',
    last_updated_epoch: '1705276800000',
    basic: {
      status: 'A',
      enumeration_date: '2006-08-23',
      last_updated: '2024-01-15',
      certification_date: '2024-01-15',
      first_name: 'JULIUS',
      middle_name: 'M',
      last_name: 'HIBBERT',
      credential: 'M.D.',
      sex: 'M',
      sole_proprietor: 'NO',
    },
    taxonomies: [
      { code: '207R00000X', desc: 'Internal Medicine', primary: true, license: '100001', state: 'OR', taxonomy_group: '' },
      { code: '207Q00000X', desc: 'Family Medicine', primary: false, license: '100001', state: 'OR', taxonomy_group: '' },
    ],
    addresses: [
      {
        address_purpose: 'LOCATION',
        address_type: 'DOM',
        address_1: '742 EVERGREEN MEDICAL PLAZA',
        address_2: 'SUITE 400',
        city: 'SPRINGFIELD',
        state: 'OR',
        postal_code: '974750000',
        country_code: 'US',
        country_name: 'United States',
        telephone_number: '555-010-0100',
        fax_number: '555-010-0101',
      },
      {
        address_purpose: 'MAILING',
        address_type: 'DOM',
        address_1: 'PO BOX 1',
        city: 'SPRINGFIELD',
        state: 'OR',
        postal_code: '97475',
        country_code: 'US',
        country_name: 'United States',
        telephone_number: '555-010-0100',
      },
    ],
  },
  {
    number: '1053380212',
    enumeration_type: 'NPI-1',
    created_epoch: '1172620800000',
    last_updated_epoch: '1699920000000',
    basic: {
      status: 'A',
      enumeration_date: '2007-02-28',
      last_updated: '2023-11-14',
      first_name: 'NICK',
      last_name: 'RIVIERA',
      credential: 'M.D.',
      sex: 'M',
      sole_proprietor: 'YES',
    },
    taxonomies: [
      { code: '208600000X', desc: 'Surgery', primary: true, license: '100002', state: 'OR', taxonomy_group: '' },
    ],
    addresses: [
      {
        address_purpose: 'LOCATION',
        address_type: 'DOM',
        address_1: '1 RIVIERA WAY',
        city: 'SPRINGFIELD',
        state: 'OR',
        postal_code: '97475',
        country_code: 'US',
        country_name: 'United States',
        telephone_number: '555-010-0200',
      },
    ],
  },
  {
    // An organization: `basic` carries an entirely different key set from a
    // person's, which is the case a one-record fixture would never reach.
    number: '1073666061',
    enumeration_type: 'NPI-2',
    created_epoch: '1085270400000',
    last_updated_epoch: '1710288000000',
    basic: {
      status: 'A',
      enumeration_date: '2004-05-23',
      last_updated: '2024-03-13',
      organization_name: 'SPRINGFIELD GENERAL HOSPITAL',
      organizational_subpart: 'NO',
      authorized_official_first_name: 'MONTGOMERY',
      authorized_official_last_name: 'BURNS',
      authorized_official_title_or_position: 'CHAIR',
      authorized_official_telephone_number: '555-010-0300',
    },
    taxonomies: [
      { code: '282N00000X', desc: 'General Acute Care Hospital', primary: true, license: '', state: 'OR', taxonomy_group: '' },
    ],
    addresses: [
      {
        address_purpose: 'LOCATION',
        address_type: 'DOM',
        address_1: '742 EVERGREEN MEDICAL PLAZA',
        city: 'SPRINGFIELD',
        state: 'OR',
        postal_code: '974750000',
        country_code: 'US',
        country_name: 'United States',
        telephone_number: '555-010-0300',
      },
    ],
    // Populated where the two people leave them empty, so both sides of every
    // "present and empty vs present and full" branch are reachable.
    practiceLocations: [
      {
        address_purpose: 'LOCATION',
        address_type: 'DOM',
        address_1: '400 SHELBYVILLE RD',
        city: 'SHELBYVILLE',
        state: 'OR',
        postal_code: '97162',
        country_code: 'US',
        country_name: 'United States',
        telephone_number: '555-010-0400',
      },
    ],
    identifiers: [
      { code: '05', desc: 'MEDICAID', identifier: 'OR000001', issuer: '', state: 'OR' },
    ],
    other_names: [
      { code: '3', type: 'Doing Business As', organization_name: 'SPRINGFIELD GENERAL' },
    ],
  },
];
