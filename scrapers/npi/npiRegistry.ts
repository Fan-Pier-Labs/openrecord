/**
 * The NPI Registry — CMS's public directory of every US healthcare provider.
 *
 * A National Provider Identifier is the 10-digit number Medicare, insurers and
 * MyChart itself use to name a clinician or an organization. MyChart hands a
 * few of them out (the care team lists each provider's `NationalProviderID`)
 * and names many more providers without one (visits, notes, letters, message
 * senders). This module goes in both directions:
 *
 *  - {@link lookupNpi} — an NPI, to the provider it belongs to.
 *  - {@link searchNpiRegistry} — a name, specialty and/or place, to the
 *    providers that match.
 *
 * ## Where the data comes from
 *
 * The registry's search page is a front end for a public JSON API at
 * `npiregistry.cms.hhs.gov/api/`, so "scraping the site" is calling that
 * endpoint: no key, no login, no cookies. Every request still goes through
 * `scraperFetch`, because that is where the per-host permit lives and the
 * registry is one host shared by every user of every client.
 *
 * The same data is published as a bulk file — about 1.1 GB zipped and ~10 GB
 * of CSV, refreshed monthly with weekly deltas — which is why nothing is
 * bundled: it would not fit in any client, and the API is live where the file
 * is up to a month stale.
 *
 * ## What the API enforces (observed 2026-09, version 2.1)
 *
 *  - At most {@link NPI_REGISTRY_MAX_PAGE_SIZE} results per page. A larger
 *    `limit` is silently clamped, and `0` silently becomes the default 10.
 *  - `skip` pages through further results; the documented ceiling is
 *    {@link NPI_REGISTRY_MAX_SKIP}, so a query can yield 1,200 results at
 *    most. Narrow it rather than paging past that.
 *  - A trailing `*` wildcard is allowed on names after two or more leading
 *    characters (`Jo*` works, `J*` is refused).
 *  - `state` and `enumeration_type` are refused on their own; every other
 *    criterion may stand alone. No criteria at all is refused too.
 *  - Refusals come back as HTTP 200 with an `Errors` array rather than a
 *    non-2xx status, so {@link parseNpiRegistryPayload} turns those into a
 *    thrown {@link NpiRegistryError} instead of an empty result.
 *
 * Field names below were taken from live responses spanning individual
 * providers, organizations, organization subparts, and populated
 * `other_names` / `identifiers` / `practiceLocations` arrays. Only fields a
 * response was seen to carry are mapped; `endpoints` (FHIR/Direct addresses)
 * is deliberately not surfaced because nothing in the product reads it.
 */

import { scraperFetch } from '../http';

/** The registry's JSON API. Overridable so a fake can stand in for it. */
export const NPI_REGISTRY_API_URL = 'https://npiregistry.cms.hhs.gov/api/';

/** The only API version the registry currently serves. */
export const NPI_REGISTRY_API_VERSION = '2.1';

/** The largest page the API will return; anything higher is clamped to this. */
export const NPI_REGISTRY_MAX_PAGE_SIZE = 200;

/** The documented ceiling on `skip`. */
export const NPI_REGISTRY_MAX_SKIP = 1000;

/** The API's default page size, used when a caller asks for none. */
export const NPI_REGISTRY_DEFAULT_PAGE_SIZE = 10;

// ── Types ───────────────────────────────────────────────────────────────────

/** `NPI-1` is a person; `NPI-2` is an organization or one of its subparts. */
export type NpiProviderType = 'individual' | 'organization';

export interface NpiTaxonomy {
  /** The taxonomy code, e.g. `207RC0000X`. */
  code: string;
  /** The human description, e.g. "Internal Medicine, Cardiovascular Disease". */
  description: string;
  primary: boolean;
  /** State license number, if the provider listed one for this taxonomy. */
  license: string;
  /** Two-letter state the license was issued in. */
  state: string;
  /** The registry's coarser grouping, empty for most entries. */
  group: string;
}

export interface NpiAddress {
  /** `location` (where care is delivered) or `mailing`, lowercased from the API. */
  purpose: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  countryCode: string;
  phone: string;
  fax: string;
}

/** Another identifier the provider holds — a Medicaid number, a payer id. */
export interface NpiIdentifier {
  identifier: string;
  /** What kind of identifier, e.g. "MEDICAID" or "Other". */
  description: string;
  issuer: string;
  state: string;
}

/** A former or alternate name, formatted the same way as {@link NpiProvider.name}. */
export interface NpiOtherName {
  /** The registry's label, e.g. "Former Name" or "Doing Business As". */
  type: string;
  name: string;
}

export interface NpiProvider {
  npi: string;
  type: NpiProviderType;
  /**
   * A display name: "FIRST MIDDLE LAST SUFFIX, CREDENTIAL" for a person, the
   * legal business name for an organization. Casing is the registry's own,
   * which is usually upper.
   */
  name: string;
  firstName: string;
  middleName: string;
  lastName: string;
  namePrefix: string;
  nameSuffix: string;
  /** Free text the provider entered, e.g. "M.D." or "MD, PhD". */
  credential: string;
  /** `M`, `F`, or empty. Individuals only. */
  sex: string;
  /** Organizations only. */
  organizationName: string;
  /** Set when the organization is a subpart of a larger one. */
  parentOrganizationName: string;
  /** Organizations only: "FIRST LAST, TITLE". */
  authorizedOfficial: string;
  /** The registry's status code; `A` is active. */
  status: string;
  active: boolean;
  soleProprietor: boolean;
  /** ISO dates, as the registry reports them. */
  enumerationDate: string;
  lastUpdated: string;
  /** The primary taxonomy's description — the answer to "what kind of doctor". */
  specialty: string;
  taxonomies: NpiTaxonomy[];
  /** The mailing and primary practice addresses. */
  addresses: NpiAddress[];
  /** Additional practice locations beyond the primary one. */
  practiceLocations: NpiAddress[];
  otherNames: NpiOtherName[];
  identifiers: NpiIdentifier[];
}

export interface NpiSearchQuery {
  /** Exact, or a trailing `*` after two or more characters. Individuals only. */
  firstName?: string;
  /** Exact, or a trailing `*` after two or more characters. Individuals only. */
  lastName?: string;
  /** Exact, or a trailing `*` after two or more characters. Organizations only. */
  organizationName?: string;
  /** Matched against taxonomy descriptions, e.g. "Cardiology" or "Dentist". */
  specialty?: string;
  city?: string;
  /** Two-letter code. The API refuses it without another criterion. */
  state?: string;
  /** Five or nine digits; a trailing `*` works here too. */
  postalCode?: string;
  /** Restrict to people or to organizations. Refused on its own by the API. */
  type?: NpiProviderType;
  /** 1–{@link NPI_REGISTRY_MAX_PAGE_SIZE}; defaults to the API's 10. */
  limit?: number;
  /** Offset into the results, for paging. */
  skip?: number;
}

export interface NpiRegistryOptions {
  /** Where the API lives. Defaults to {@link NPI_REGISTRY_API_URL}. */
  apiUrl?: string;
}

/** One entry of the API's `Errors` array. */
export interface NpiRegistryApiError {
  field: string;
  description: string;
  number: string;
}

/**
 * A refusal from the registry, carrying its own explanation.
 *
 * Refusals arrive as HTTP 200 with an `Errors` array, so this is what a caller
 * sees instead of a status code. Every description observed is a complete
 * sentence about the request ("Wildcards require at least two leading
 * characters", "Field state requires additional search criteria"), so the
 * message repeats them verbatim.
 */
export class NpiRegistryError extends Error {
  readonly errors: readonly NpiRegistryApiError[];

  constructor(errors: readonly NpiRegistryApiError[]) {
    super(`NPI Registry refused the request: ${errors.map((e) => e.description).join('; ')}`);
    this.name = 'NpiRegistryError';
    this.errors = errors;
  }
}

// ── NPI validation ──────────────────────────────────────────────────────────

/**
 * Whether a string is a well-formed NPI: ten digits whose last one is the
 * right Luhn check digit.
 *
 * The check digit is computed over the number with the constant prefix
 * `80840` in front (the ISO card-issuer identifier assigned to CMS), which is
 * what makes an NPI verifiable offline. A typo or a transposed pair fails
 * this, so a caller can refuse a bad number before spending a request on it.
 */
export function isValidNpi(value: string): boolean {
  if (!/^\d{10}$/.test(value)) return false;
  const digits = `80840${value}`;
  let sum = 0;
  for (let i = digits.length - 1, position = 0; i >= 0; i--, position++) {
    let d = Number(digits[i]);
    if (position % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

// ── Response parsing ────────────────────────────────────────────────────────

type RawRecord = Record<string, unknown>;

function text(record: RawRecord | undefined, key: string): string {
  const v = record?.[key];
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  return '';
}

function records(value: unknown): RawRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is RawRecord => typeof v === 'object' && v !== null);
}

function joinName(parts: string[]): string {
  return parts.filter((p) => p.length > 0).join(' ');
}

function personName(first: string, middle: string, last: string, suffix: string, credential: string): string {
  const base = joinName([first, middle, last, suffix]);
  return credential ? `${base}, ${credential}` : base;
}

function toAddress(raw: RawRecord): NpiAddress {
  return {
    purpose: text(raw, 'address_purpose').toLowerCase(),
    line1: text(raw, 'address_1'),
    line2: text(raw, 'address_2'),
    city: text(raw, 'city'),
    state: text(raw, 'state'),
    postalCode: text(raw, 'postal_code'),
    countryCode: text(raw, 'country_code'),
    phone: text(raw, 'telephone_number'),
    fax: text(raw, 'fax_number'),
  };
}

function toTaxonomy(raw: RawRecord): NpiTaxonomy {
  return {
    code: text(raw, 'code'),
    description: text(raw, 'desc'),
    primary: raw.primary === true,
    license: text(raw, 'license'),
    state: text(raw, 'state'),
    group: text(raw, 'taxonomy_group'),
  };
}

function toIdentifier(raw: RawRecord): NpiIdentifier {
  return {
    identifier: text(raw, 'identifier'),
    description: text(raw, 'desc'),
    issuer: text(raw, 'issuer'),
    state: text(raw, 'state'),
  };
}

/**
 * An `other_names` entry is a person's name or an organization's, and the two
 * carry different keys — the same split as `basic` itself.
 */
function toOtherName(raw: RawRecord): NpiOtherName {
  const organization = text(raw, 'organization_name');
  return {
    type: text(raw, 'type'),
    name:
      organization ||
      personName(
        text(raw, 'first_name'),
        text(raw, 'middle_name'),
        text(raw, 'last_name'),
        text(raw, 'suffix'),
        text(raw, 'credential'),
      ),
  };
}

function toProvider(raw: RawRecord): NpiProvider | null {
  const npi = text(raw, 'number');
  if (!npi) return null;

  const basic = (typeof raw.basic === 'object' && raw.basic !== null ? raw.basic : {}) as RawRecord;
  const type: NpiProviderType = text(raw, 'enumeration_type') === 'NPI-2' ? 'organization' : 'individual';

  const firstName = text(basic, 'first_name');
  const middleName = text(basic, 'middle_name');
  const lastName = text(basic, 'last_name');
  const nameSuffix = text(basic, 'name_suffix');
  const credential = text(basic, 'credential');
  const organizationName = text(basic, 'organization_name');

  const officialName = joinName([
    text(basic, 'authorized_official_first_name'),
    text(basic, 'authorized_official_last_name'),
  ]);
  const officialTitle = text(basic, 'authorized_official_title_or_position');

  const taxonomies = records(raw.taxonomies).map(toTaxonomy);
  const status = text(basic, 'status');

  return {
    npi,
    type,
    name:
      type === 'organization'
        ? organizationName
        : personName(firstName, middleName, lastName, nameSuffix, credential),
    firstName,
    middleName,
    lastName,
    namePrefix: text(basic, 'name_prefix'),
    nameSuffix,
    credential,
    sex: text(basic, 'sex'),
    organizationName,
    parentOrganizationName: text(basic, 'parent_organization_legal_business_name'),
    authorizedOfficial: officialName && officialTitle ? `${officialName}, ${officialTitle}` : officialName,
    status,
    active: status === 'A',
    soleProprietor: text(basic, 'sole_proprietor').toUpperCase() === 'YES',
    enumerationDate: text(basic, 'enumeration_date'),
    lastUpdated: text(basic, 'last_updated'),
    specialty: (taxonomies.find((t) => t.primary) ?? taxonomies[0])?.description ?? '',
    taxonomies,
    addresses: records(raw.addresses).map(toAddress),
    practiceLocations: records(raw.practiceLocations).map(toAddress),
    otherNames: records(raw.other_names).map(toOtherName),
    identifiers: records(raw.identifiers).map(toIdentifier),
  };
}

/**
 * Parse one API response body into providers.
 *
 * Throws an {@link NpiRegistryError} when the body is a refusal, and a plain
 * error when it is neither a refusal nor a result list — an HTML error page,
 * a changed shape. Neither may become an empty list: "no provider by that
 * name" is an answer a caller acts on, and this must not fake it.
 */
export function parseNpiRegistryPayload(payload: unknown): NpiProvider[] {
  const body = (typeof payload === 'object' && payload !== null ? payload : {}) as RawRecord;

  if (Array.isArray(body.Errors)) {
    const errors = records(body.Errors).map((e) => ({
      field: text(e, 'field'),
      description: text(e, 'description'),
      number: text(e, 'number'),
    }));
    throw new NpiRegistryError(errors.length ? errors : [{ field: '', description: 'unknown error', number: '' }]);
  }

  if (!Array.isArray(body.results)) {
    throw new Error('NPI Registry response has no "results" array — the endpoint shape changed.');
  }
  return records(body.results)
    .map(toProvider)
    .filter((p): p is NpiProvider => p !== null);
}

// ── Requests ────────────────────────────────────────────────────────────────

/**
 * The query-string parameter for each field of {@link NpiSearchQuery}, in the
 * registry's own names.
 */
const QUERY_PARAMS: ReadonlyArray<readonly [keyof NpiSearchQuery, string]> = [
  ['firstName', 'first_name'],
  ['lastName', 'last_name'],
  ['organizationName', 'organization_name'],
  ['specialty', 'taxonomy_description'],
  ['city', 'city'],
  ['state', 'state'],
  ['postalCode', 'postal_code'],
];

function clampPageSize(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return NPI_REGISTRY_DEFAULT_PAGE_SIZE;
  return Math.min(NPI_REGISTRY_MAX_PAGE_SIZE, Math.max(1, Math.floor(limit)));
}

/**
 * Build the search URL for a query. Exported so a test can check the mapping
 * without a transport, and so a caller can see exactly what will be sent.
 *
 * Throws before any request when the query names nothing to search for, so a
 * caller gets the same refusal the API would give without the round trip.
 * The API's other rules (state alone, wildcard length) are left to the API,
 * whose wording is the authority on them.
 */
export function buildNpiSearchUrl(query: NpiSearchQuery, apiUrl: string = NPI_REGISTRY_API_URL): string {
  const url = new URL(apiUrl);
  url.searchParams.set('version', NPI_REGISTRY_API_VERSION);

  let criteria = 0;
  for (const [field, param] of QUERY_PARAMS) {
    const value = query[field];
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    url.searchParams.set(param, trimmed);
    criteria++;
  }
  if (query.type) {
    url.searchParams.set('enumeration_type', query.type === 'organization' ? 'NPI-2' : 'NPI-1');
  }
  if (criteria === 0) {
    throw new Error(
      'NPI Registry search needs at least one of: firstName, lastName, organizationName, specialty, city, state, postalCode.',
    );
  }

  url.searchParams.set('limit', String(clampPageSize(query.limit)));
  const skip = query.skip !== undefined && Number.isFinite(query.skip) ? Math.max(0, Math.floor(query.skip)) : 0;
  if (skip > 0) url.searchParams.set('skip', String(skip));

  return url.toString();
}

async function fetchProviders(url: string): Promise<NpiProvider[]> {
  const response = await scraperFetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`NPI Registry request failed: ${response.status} ${response.statusText}`);
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error('NPI Registry response was not JSON — the endpoint shape changed.');
  }
  return parseNpiRegistryPayload(payload);
}

/**
 * Find providers by name, specialty and/or place. One page per call; pass
 * `skip` to see the next one.
 *
 * Names match exactly unless they end in `*`, and the registry stores most of
 * them in upper case — matching is case-insensitive, so send what the patient
 * wrote. `specialty` matches against taxonomy descriptions, so "Cardiology"
 * finds "Internal Medicine, Cardiovascular Disease" but a made-up label finds
 * nothing.
 */
export async function searchNpiRegistry(
  query: NpiSearchQuery,
  options: NpiRegistryOptions = {},
): Promise<NpiProvider[]> {
  return fetchProviders(buildNpiSearchUrl(query, options.apiUrl));
}

/**
 * Look up one NPI. Returns null when no provider has that number — the
 * registry answers a well-formed unknown NPI with zero results, not an error.
 *
 * Throws on a malformed number without making a request: a wrong length or a
 * failed check digit is a typo, and the registry would only say the same
 * thing more slowly.
 */
export async function lookupNpi(npi: string, options: NpiRegistryOptions = {}): Promise<NpiProvider | null> {
  const number = npi.trim();
  if (!isValidNpi(number)) {
    throw new Error(`"${npi}" is not a valid NPI — expected ten digits with a correct check digit.`);
  }
  const url = new URL(options.apiUrl ?? NPI_REGISTRY_API_URL);
  url.searchParams.set('version', NPI_REGISTRY_API_VERSION);
  url.searchParams.set('number', number);
  const providers = await fetchProviders(url.toString());
  return providers.find((p) => p.npi === number) ?? null;
}
