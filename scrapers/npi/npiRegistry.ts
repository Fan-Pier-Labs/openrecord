/**
 * The NPI Registry — CMS's public directory of every US healthcare provider.
 *
 * A National Provider Identifier is the 10-digit number Medicare, insurers and
 * MyChart itself use to name a clinician or an organization. MyChart hands a
 * few of them out (the care team lists each provider's `NationalProviderID`)
 * and names many more providers without one (visits, notes, letters, message
 * senders). This scraper goes in both directions:
 *
 *  - {@link fetchNpiLookupRaw} — an NPI, to the provider it belongs to.
 *  - {@link fetchNpiSearchRaw} — a name, specialty and/or place, to the
 *    providers that match.
 *
 * Network only, like every scraper under the processor layer: these return the
 * {@link RawResponse} envelope and `npiRegistry.processor.ts` decides what a
 * caller sees. The envelope type and its helpers live under `myChart/core/`
 * because that is where the processor layer put them; nothing in them is
 * Epic-specific, and reusing them is what lets the registry capabilities take
 * the same `mode` parameter as every MyChart read.
 *
 * `RawCollector` itself is not reused: it wraps `makeAuthenticatedRequest`,
 * whose whole job is MyChart session expiry and the active-patient restore.
 * There is no session here — the registry takes no key, no login and no
 * cookies — so these build the one record they make directly, still through
 * `scraperFetch` so the per-host permit and the test transport apply.
 *
 * ## Where the data comes from
 *
 * The registry's search page is a front end for a public JSON API at
 * `npiregistry.cms.hhs.gov/api/`. The same data is published as a bulk file —
 * about 1.1 GB zipped and ~10 GB of CSV, refreshed monthly with weekly deltas —
 * which is why nothing is bundled: it would not fit in any client, and the API
 * is live where the file is up to a month stale.
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
 *    non-2xx status. That body reaches the caller unchanged — see the
 *    processor's rule 7 note.
 */

import { scraperFetch } from '../http';
import type { RawRequestRecord, RawResponse } from '../myChart/core/rawResponse';
import {
  npiLookupProcessor,
  npiSearchProcessor,
  type NpiProviderStandard,
  type NpiRegistryErrors,
  type NpiSearchStandard,
} from './npiRegistry.processor';

export type {
  NpiAddressStandard,
  NpiBasicStandard,
  NpiIdentifierStandard,
  NpiProviderStandard,
  NpiRegistryApiError,
  NpiRegistryErrors,
  NpiSearchStandard,
  NpiTaxonomyStandard,
} from './npiRegistry.processor';
export { isNpiRegistryErrors, npiLookupProcessor, npiSearchProcessor } from './npiRegistry.processor';

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

/** `NPI-1` is a person; `NPI-2` is an organization or one of its subparts. */
export type NpiProviderType = 'individual' | 'organization';

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

// ── NPI validation ──────────────────────────────────────────────────────────

/**
 * Whether a string is a well-formed NPI: ten digits whose last one is the
 * right Luhn check digit.
 *
 * The check digit is computed over the number with the constant prefix
 * `80840` in front (the ISO card-issuer identifier assigned to CMS), which is
 * what makes an NPI verifiable offline. A typo or a transposed pair fails
 * this, so {@link fetchNpiLookupRaw} refuses a bad number before spending a
 * request on it.
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

// ── The request ─────────────────────────────────────────────────────────────

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
 * whose wording is the authority on them and reaches the caller intact.
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

/**
 * Make the one request and record it into the envelope, the way
 * `RawCollector.send` records a MyChart one: the parsed JSON when the body
 * parses, the text otherwise.
 *
 * Throws on a non-2xx status and on a body that is not JSON at all. Neither is
 * a refusal — the registry refuses with HTTP 200 and an `Errors` array, which
 * is data and passes through — so both mean the endpoint is not answering, and
 * recording an HTML maintenance page as a provider list would show a caller
 * "no such doctor".
 */
async function collect(url: string): Promise<RawResponse> {
  const response = await scraperFetch(url, { headers: { Accept: 'application/json' } });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`NPI Registry request failed: ${response.status} ${response.statusText}`);
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error('NPI Registry response was not JSON — the endpoint shape changed.');
  }

  const record: RawRequestRecord = {
    path: url,
    method: 'GET',
    status: response.status,
    contentType: response.headers.get('content-type') ?? '',
    body,
  };
  return { requests: [record] };
}

/** Search the registry by name, specialty and/or place. One page per call. */
export async function fetchNpiSearchRaw(
  query: NpiSearchQuery,
  options: NpiRegistryOptions = {},
): Promise<RawResponse> {
  return collect(buildNpiSearchUrl(query, options.apiUrl));
}

/**
 * Look up one NPI.
 *
 * Throws on a malformed number without making a request: a wrong length or a
 * failed check digit is a typo, and the registry would only say the same thing
 * more slowly. A well-formed number nobody holds is not an error — it comes
 * back as zero results and the processor renders that as `null`.
 */
export async function fetchNpiLookupRaw(npi: string, options: NpiRegistryOptions = {}): Promise<RawResponse> {
  const number = npi.trim();
  if (!isValidNpi(number)) {
    throw new Error(`"${npi}" is not a valid NPI — expected ten digits with a correct check digit.`);
  }
  const url = new URL(options.apiUrl ?? NPI_REGISTRY_API_URL);
  url.searchParams.set('version', NPI_REGISTRY_API_VERSION);
  url.searchParams.set('number', number);
  return collect(url.toString());
}

// ── The standard object — what `mode: 'json'` returns ───────────────────────

/**
 * Find providers by name, specialty and/or place.
 *
 * Names match exactly unless they end in `*`, and the registry stores most of
 * them in upper case — matching is case-insensitive, so send what the patient
 * wrote. `specialty` matches against taxonomy descriptions, so "Cardiology"
 * finds "Internal Medicine, Cardiovascular Disease" but a made-up label finds
 * nothing. A refused query comes back as {@link NpiRegistryErrors}; narrow
 * with `isNpiRegistryErrors`.
 */
export async function searchNpiRegistry(
  query: NpiSearchQuery,
  options: NpiRegistryOptions = {},
): Promise<NpiSearchStandard | NpiRegistryErrors> {
  return npiSearchProcessor.standard(await fetchNpiSearchRaw(query, options));
}

/** Look up one NPI. `null` when the registry has nobody by that number. */
export async function lookupNpi(
  npi: string,
  options: NpiRegistryOptions = {},
): Promise<NpiProviderStandard | NpiRegistryErrors | null> {
  return npiLookupProcessor.standard(await fetchNpiLookupRaw(npi, options));
}
