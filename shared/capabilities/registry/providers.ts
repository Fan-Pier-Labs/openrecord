/**
 * The `Providers` group — CMS's NPI Registry, in both directions.
 *
 * `public`-kind, and the first group in the registry that is: no MyChart
 * account, no login, no patient. Their `run` takes only arguments — see
 * `PublicCapabilityImpl` — so they are structurally unable to touch a chart,
 * which is why `executeCapability` exempts them from the active-patient
 * assertion rather than trusting each entry not to.
 *
 * Otherwise ordinary reads: the scrapers return a `RawResponse` and the
 * processors give them the same four modes every chart read has.
 */

import {
  fetchNpiLookupRaw,
  fetchNpiSearchRaw,
  npiLookupProcessor,
  npiSearchProcessor,
  NPI_REGISTRY_MAX_PAGE_SIZE,
  NPI_REGISTRY_MAX_SKIP,
  type NpiSearchQuery,
} from '../../../scrapers/npi/npiRegistry';
import { num, optStr, requireStr } from '../args';
import type { CapabilityImpl } from '../types';

export const PROVIDER_CAPABILITIES: readonly CapabilityImpl[] = [
  {
    id: 'lookup_npi',
    title: 'Look up an NPI',
    description:
      'Look up a US healthcare provider by National Provider Identifier — the 10-digit number MyChart, Medicare and insurers use to name a clinician or organization. Public data; no MyChart account needed.',
    kind: 'public',
    group: 'Providers',
    params: [
      {
        name: 'npi',
        type: 'string',
        description:
          'The 10-digit National Provider Identifier, e.g. the NationalProviderID on a get_care_team entry.',
        required: true,
      },
    ],
    run: (args) => fetchNpiLookupRaw(requireStr(args, 'npi')),
    processor: npiLookupProcessor,
  },
  {
    id: 'search_npi_registry',
    title: 'Search the NPI Registry',
    description:
      "Find US healthcare providers by name, specialty and/or place in CMS's public NPI Registry — the way to turn a provider name from a chart into an NPI, an address and a specialty. At least one search criterion is required. Public data; no MyChart account needed.",
    kind: 'public',
    group: 'Providers',
    params: [
      {
        name: 'first_name',
        type: 'string',
        description: "An individual's first name. Exact, or a trailing `*` after two or more characters.",
      },
      {
        name: 'last_name',
        type: 'string',
        description: "An individual's last name. Exact, or a trailing `*` after two or more characters.",
      },
      {
        name: 'organization_name',
        type: 'string',
        description:
          "An organization's legal business name. Exact, or a trailing `*` after two or more characters.",
      },
      {
        name: 'specialty',
        type: 'string',
        description: 'Matched against taxonomy descriptions, e.g. "Cardiology" or "Dentist".',
      },
      { name: 'city', type: 'string', description: 'City of the practice or mailing address.' },
      {
        name: 'state',
        type: 'string',
        description:
          'Two-letter state code. The registry refuses this on its own — pair it with another criterion.',
      },
      {
        name: 'postal_code',
        type: 'string',
        description: 'Five or nine digits; a trailing `*` works here too.',
      },
      {
        name: 'type',
        type: 'string',
        description:
          'Restrict to "individual" (a person) or "organization". Refused on its own by the registry.',
      },
      {
        name: 'limit',
        type: 'number',
        description: `Results per page, 1–${NPI_REGISTRY_MAX_PAGE_SIZE}. Defaults to the registry's 10.`,
        min: 1,
        max: NPI_REGISTRY_MAX_PAGE_SIZE,
      },
      {
        name: 'skip',
        type: 'number',
        description: `Offset into the results, for paging. At most ${NPI_REGISTRY_MAX_SKIP}; narrow the query rather than paging past it.`,
        min: 0,
        max: NPI_REGISTRY_MAX_SKIP,
      },
    ],
    run: (args) => {
      const query: NpiSearchQuery = {};
      // Only the fields the caller actually gave: `buildNpiSearchUrl` counts
      // them to decide whether the query names anything to search for, and an
      // empty string is not a criterion.
      const firstName = optStr(args, 'first_name');
      if (firstName) query.firstName = firstName;
      const lastName = optStr(args, 'last_name');
      if (lastName) query.lastName = lastName;
      const organizationName = optStr(args, 'organization_name');
      if (organizationName) query.organizationName = organizationName;
      const specialty = optStr(args, 'specialty');
      if (specialty) query.specialty = specialty;
      const city = optStr(args, 'city');
      if (city) query.city = city;
      const state = optStr(args, 'state');
      if (state) query.state = state;
      const postalCode = optStr(args, 'postal_code');
      if (postalCode) query.postalCode = postalCode;

      const type = optStr(args, 'type');
      if (type) {
        // A misspelled type is a caller error, not a reason to silently search
        // both: "organisation" would otherwise widen the search rather than
        // narrowing it, and the caller would never know.
        if (type !== 'individual' && type !== 'organization') {
          throw new Error(`Unknown type ${JSON.stringify(type)}. Expected "individual" or "organization".`);
        }
        query.type = type;
      }
      if (optNum(args.limit)) query.limit = num(args, 'limit', NPI_REGISTRY_MAX_PAGE_SIZE);
      if (optNum(args.skip)) query.skip = num(args, 'skip', 0);

      return fetchNpiSearchRaw(query);
    },
    processor: npiSearchProcessor,
  },
];

/**
 * Whether a numeric argument was given at all.
 *
 * `NpiSearchQuery`'s fields are optional and `exactOptionalPropertyTypes` is
 * on, so an omitted `limit` has to stay an absent key rather than becoming
 * `undefined` — and the scraper's own defaults (the registry's 10, skip 0)
 * only apply to a key that isn't there.
 */
function optNum(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}
