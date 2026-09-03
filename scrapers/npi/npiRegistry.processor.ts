/**
 * NPI Registry processors. Field decisions: `scrapers/npi/README.md`.
 *
 * The registry is not MyChart, but the processor-layer rules
 * (`docs/processor-layer-proposal.md`) are about a source's fields rather than
 * about Epic, so they apply unchanged: every field that passes through keeps
 * CMS's own snake_case name and value (rule 2), the four derived fields carry
 * new camelCase names no CMS field uses (rule 3), and membership is by field
 * name rather than by value (rule 6) — so `basic` carries the union of the
 * individual and organization key sets on every provider, and a reader never
 * has to know which of the two shapes came back.
 *
 * Rule 7 is the one that shows up most here: the API answers a refused query
 * with HTTP 200 and an `Errors` array, so that body is returned unchanged in
 * every mode rather than being turned into an empty result set. An unknown but
 * well-formed NPI comes back as zero results, which {@link npiLookupProcessor}
 * passes through as `null` for the same reason.
 *
 * Nothing is dropped for being uninteresting. `endpoints` (a provider's
 * Direct/FHIR addresses) and `other_names` pass through whole because their
 * element key sets vary between records (rule 10), and the two `*_epoch`
 * fields stay because they are NOT duplicates of the date strings beside
 * them — they disagreed on 102 of 883 sampled records, so collapsing them
 * would silently pick a day.
 */

import { unwrapRaw, type RawResponse } from '../myChart/core/rawResponse';
import type { Processor } from '../myChart/processors/processor';
import { bool, list, num, rec, textOrNull } from '../myChart/processors/read';

// ── The standard object ─────────────────────────────────────────────────────

/**
 * `basic`, as the union of the two record types' key sets. Rule 6: every name
 * is emitted on every provider, `null` where that record type has no such
 * field, so "this organization named no authorized official" and "this is a
 * person" are both readable without inspecting `enumeration_type` first.
 */
export interface NpiBasicStandard {
  /** `A` on all 883 records sampled; a non-active provider would show here. */
  status: string | null;
  enumeration_date: string | null;
  last_updated: string | null;
  certification_date: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  name_prefix: string | null;
  name_suffix: string | null;
  credential: string | null;
  sex: string | null;
  sole_proprietor: string | null;
  organization_name: string | null;
  organizational_subpart: string | null;
  parent_organization_legal_business_name: string | null;
  authorized_official_first_name: string | null;
  authorized_official_middle_name: string | null;
  authorized_official_last_name: string | null;
  authorized_official_name_prefix: string | null;
  authorized_official_name_suffix: string | null;
  authorized_official_credential: string | null;
  authorized_official_title_or_position: string | null;
  authorized_official_telephone_number: string | null;
}

export interface NpiTaxonomyStandard {
  code: string | null;
  desc: string | null;
  primary: boolean;
  license: string | null;
  state: string | null;
  /** Populated on 323 of 1368 sampled taxonomies, so not an always-empty field. */
  taxonomy_group: string | null;
}

export interface NpiAddressStandard {
  address_purpose: string | null;
  address_type: string | null;
  address_1: string | null;
  address_2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country_code: string | null;
  country_name: string | null;
  telephone_number: string | null;
  fax_number: string | null;
}

export interface NpiIdentifierStandard {
  identifier: string | null;
  code: string | null;
  desc: string | null;
  issuer: string | null;
  state: string | null;
}

export interface NpiProviderStandard {
  /** The handle every other lookup takes as input (rule 5). */
  number: string | null;
  /** `NPI-1` for a person, `NPI-2` for an organization or a subpart. */
  enumeration_type: string | null;
  /** Derived: the display name. CMS stores a person's in parts and no whole. */
  providerName: string;
  /** Derived: the primary taxonomy's `desc` — "what kind of provider". */
  primarySpecialty: string;
  /** Derived: the practice address on one line. */
  primaryAddress: string;
  /** Derived: that address's phone number. */
  primaryPhone: string;
  basic: NpiBasicStandard;
  taxonomies: NpiTaxonomyStandard[];
  addresses: NpiAddressStandard[];
  practiceLocations: NpiAddressStandard[];
  identifiers: NpiIdentifierStandard[];
  /** Uncaptured element shape (person and organization keys differ); whole. */
  other_names: unknown[];
  /** Uncaptured element shape (14–18 keys across sampled records); whole. */
  endpoints: unknown[];
  /** Not a duplicate of `enumeration_date`: the two disagreed on 102/883. */
  created_epoch: string | null;
  last_updated_epoch: string | null;
}

export interface NpiSearchStandard {
  result_count: number | null;
  results: NpiProviderStandard[];
}

/** One entry of the API's `Errors` array. */
export interface NpiRegistryApiError {
  field?: unknown;
  description?: unknown;
  number?: unknown;
}

/** A refused query, passed through unchanged in every mode (rule 7). */
export interface NpiRegistryErrors {
  Errors: NpiRegistryApiError[];
}

export function isNpiRegistryErrors(value: unknown): value is NpiRegistryErrors {
  return typeof value === 'object' && value !== null && Array.isArray((value as NpiRegistryErrors).Errors);
}

// ── Field mapping ───────────────────────────────────────────────────────────

function joinWords(parts: Array<string | null>): string {
  return parts.filter((p): p is string => typeof p === 'string' && p.trim() !== '').join(' ');
}

function toBasic(value: unknown): NpiBasicStandard {
  const b = rec(value);
  return {
    status: textOrNull(b.status),
    enumeration_date: textOrNull(b.enumeration_date),
    last_updated: textOrNull(b.last_updated),
    certification_date: textOrNull(b.certification_date),
    first_name: textOrNull(b.first_name),
    middle_name: textOrNull(b.middle_name),
    last_name: textOrNull(b.last_name),
    name_prefix: textOrNull(b.name_prefix),
    name_suffix: textOrNull(b.name_suffix),
    credential: textOrNull(b.credential),
    sex: textOrNull(b.sex),
    sole_proprietor: textOrNull(b.sole_proprietor),
    organization_name: textOrNull(b.organization_name),
    organizational_subpart: textOrNull(b.organizational_subpart),
    parent_organization_legal_business_name: textOrNull(b.parent_organization_legal_business_name),
    authorized_official_first_name: textOrNull(b.authorized_official_first_name),
    authorized_official_middle_name: textOrNull(b.authorized_official_middle_name),
    authorized_official_last_name: textOrNull(b.authorized_official_last_name),
    authorized_official_name_prefix: textOrNull(b.authorized_official_name_prefix),
    authorized_official_name_suffix: textOrNull(b.authorized_official_name_suffix),
    authorized_official_credential: textOrNull(b.authorized_official_credential),
    authorized_official_title_or_position: textOrNull(b.authorized_official_title_or_position),
    authorized_official_telephone_number: textOrNull(b.authorized_official_telephone_number),
  };
}

function toTaxonomy(value: unknown): NpiTaxonomyStandard {
  const t = rec(value);
  return {
    code: textOrNull(t.code),
    desc: textOrNull(t.desc),
    primary: bool(t.primary),
    license: textOrNull(t.license),
    state: textOrNull(t.state),
    taxonomy_group: textOrNull(t.taxonomy_group),
  };
}

function toAddress(value: unknown): NpiAddressStandard {
  const a = rec(value);
  return {
    address_purpose: textOrNull(a.address_purpose),
    address_type: textOrNull(a.address_type),
    address_1: textOrNull(a.address_1),
    address_2: textOrNull(a.address_2),
    city: textOrNull(a.city),
    state: textOrNull(a.state),
    postal_code: textOrNull(a.postal_code),
    country_code: textOrNull(a.country_code),
    country_name: textOrNull(a.country_name),
    telephone_number: textOrNull(a.telephone_number),
    fax_number: textOrNull(a.fax_number),
  };
}

function toIdentifier(value: unknown): NpiIdentifierStandard {
  const i = rec(value);
  return {
    identifier: textOrNull(i.identifier),
    code: textOrNull(i.code),
    desc: textOrNull(i.desc),
    issuer: textOrNull(i.issuer),
    state: textOrNull(i.state),
  };
}

/**
 * The display name. An organization has one already; a person is stored in
 * parts and never as a whole, so this is the one place the parts are joined.
 * The credential trails after a comma, the way the registry's own result page
 * renders it.
 */
function providerNameOf(basic: NpiBasicStandard, enumerationType: string | null): string {
  if (enumerationType === 'NPI-2') return basic.organization_name ?? '';
  const name = joinWords([basic.first_name, basic.middle_name, basic.last_name, basic.name_suffix]);
  return basic.credential ? `${name}, ${basic.credential}` : name;
}

/**
 * The address a patient would go to: the `LOCATION` one, falling back to
 * whatever came first when a record has no `LOCATION` entry.
 */
function primaryAddressOf(addresses: NpiAddressStandard[]): NpiAddressStandard | undefined {
  return addresses.find((a) => a.address_purpose?.toUpperCase() === 'LOCATION') ?? addresses[0];
}

function addressLine(address: NpiAddressStandard | undefined): string {
  if (!address) return '';
  const street = joinWords([address.address_1, address.address_2]);
  const region = joinWords([address.state, address.postal_code]);
  return [street, address.city, region].filter((p) => p !== '').join(', ');
}

export function toProviderStandard(value: unknown): NpiProviderStandard {
  const r = rec(value);
  const basic = toBasic(r.basic);
  const enumerationType = textOrNull(r.enumeration_type);
  const taxonomies = list(r.taxonomies).map(toTaxonomy);
  const addresses = list(r.addresses).map(toAddress);
  const primary = primaryAddressOf(addresses);

  return {
    number: textOrNull(r.number),
    enumeration_type: enumerationType,
    providerName: providerNameOf(basic, enumerationType),
    primarySpecialty: (taxonomies.find((t) => t.primary) ?? taxonomies[0])?.desc ?? '',
    primaryAddress: addressLine(primary),
    primaryPhone: primary?.telephone_number ?? '',
    basic,
    taxonomies,
    addresses,
    practiceLocations: list(r.practiceLocations).map(toAddress),
    identifiers: list(r.identifiers).map(toIdentifier),
    other_names: list(r.other_names),
    endpoints: list(r.endpoints),
    created_epoch: textOrNull(r.created_epoch),
    last_updated_epoch: textOrNull(r.last_updated_epoch),
  };
}

/** The concise row: who, what kind, where, and the handle to look them up by. */
function conciseProvider(provider: NpiProviderStandard) {
  return {
    number: provider.number,
    providerName: provider.providerName,
    enumeration_type: provider.enumeration_type,
    primarySpecialty: provider.primarySpecialty,
    primaryAddress: provider.primaryAddress,
    primaryPhone: provider.primaryPhone,
  };
}

// ── Processors ──────────────────────────────────────────────────────────────

/**
 * The search payload. A refusal (`Errors`) passes through untouched in every
 * mode — its `description` is a complete sentence about what was wrong with
 * the query, which is worth far more to the caller than an empty result set.
 */
export const npiSearchProcessor: Processor<NpiSearchStandard | NpiRegistryErrors> = {
  standard(raw: RawResponse): NpiSearchStandard | NpiRegistryErrors {
    const body = unwrapRaw(raw);
    if (isNpiRegistryErrors(body)) return body;
    const b = rec(body);
    return {
      result_count: num(b.result_count),
      results: list(b.results).map(toProviderStandard),
    };
  },
  concise(standard) {
    if (isNpiRegistryErrors(standard)) return standard;
    return {
      result_count: standard.result_count,
      results: standard.results.map(conciseProvider),
    };
  },
};

/**
 * One NPI's provider, or `null` when the registry has nobody by that number.
 * A well-formed unknown NPI is answered with zero results rather than an
 * error, and `null` is how that reaches the caller in every mode (rule 7).
 */
export const npiLookupProcessor: Processor<NpiProviderStandard | NpiRegistryErrors | null> = {
  standard(raw: RawResponse): NpiProviderStandard | NpiRegistryErrors | null {
    const body = unwrapRaw(raw);
    if (isNpiRegistryErrors(body)) return body;
    const first = list(rec(body).results)[0];
    return first === undefined ? null : toProviderStandard(first);
  },
  concise(standard) {
    if (standard === null || isNpiRegistryErrors(standard)) return standard;
    return conciseProvider(standard);
  },
};
