// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * The `Directory` group — Epic's list of every MyChart instance in the world.
 *
 * `public`-kind, like `Providers`: this is the lookup a person does *before*
 * they have an account, so requiring one would be a contradiction.
 *
 * It was the Claude Desktop extension's hand-written `search_mycharts` meta
 * tool, over a bundled snapshot, and only that client had it — the CLI, the
 * npm library and the mobile agent could not answer "which MyChart does my
 * health system run?" at all. Same tool name, same result shape; the search
 * itself now lives in `scrapers/list-all-mycharts/searchDirectory.ts` and
 * prefers Epic's live directory over the checked-in seed.
 */

import {
  searchMyChartDirectory,
  MAX_DIRECTORY_SEARCH_LIMIT,
} from '../../../scrapers/list-all-mycharts/searchDirectory';
import { fetchHospitalNetworkProfile } from '../../../scrapers/myChart/prelogin';
import { num, requireStr, strList } from '../args';
import type { CapabilityImpl } from '../types';

export const DIRECTORY_CAPABILITIES: readonly CapabilityImpl[] = [
  {
    id: 'search_mycharts',
    title: 'Search the MyChart directory',
    description:
      "Look up a MyChart hostname for setup. Type a few letters of the user's health system name (e.g. \"uchealth\", \"mass general\"). Returns matching entries with their hostname, display name, login URL and logo. Pass the chosen `hostname` on to whatever this client uses to connect an account — except for an entry carrying `unavailable`, which cannot be connected right now: show the user that message instead of attempting setup.",
    kind: 'public',
    group: 'Directory',
    params: [
      {
        name: 'query',
        type: 'string',
        description:
          'Substring of the health system name, one of its aliases, or its hostname. Case-insensitive.',
        required: true,
      },
      {
        name: 'limit',
        type: 'number',
        description: `Maximum results to return, 1–${MAX_DIRECTORY_SEARCH_LIMIT}. Defaults to 10.`,
        min: 1,
        max: MAX_DIRECTORY_SEARCH_LIMIT,
      },
    ],
    // No processor: the search returns a finished object rather than a scraped
    // response, so there is no raw envelope to project and no `mode` to offer.
    run: (args) => {
      const query = requireStr(args, 'query');
      const given = args.limit;
      const limit =
        given === undefined || given === null || given === ''
          ? undefined
          : num(args, 'limit', MAX_DIRECTORY_SEARCH_LIMIT);
      return searchMyChartDirectory(query, { limit });
    },
  },
  {
    id: 'get_hospital_info',
    title: 'Public profile of a health system',
    description:
      'What a MyChart instance publishes about its health system to anyone, with no account: the ' +
      "organization's support, scheduling and billing phone lines and support email; the \"Find a Doctor\" " +
      'directory of bookable providers (name, credentials, specialties, languages, photo) with every clinic ' +
      'they work at (street address, phone, coordinates, hours); billing entities and their facilities; and ' +
      'which portal features are switched on. Pass the `hostname` from search_mycharts. Slow on large ' +
      'systems — one specialty is 0.6–2 MB and some list twenty — so narrow with `specialties` or skip the ' +
      'crawl with `include_providers: false`. Never returns a fax number or an accepted-insurance list: ' +
      'MyChart publishes neither (the payer list sits behind a reCAPTCHA-protected disclaimer).',
    kind: 'public',
    group: 'Directory',
    params: [
      {
        name: 'hostname',
        type: 'string',
        description: 'The MyChart hostname, e.g. mychart.example.org. A full login URL also works.',
        required: true,
      },
      {
        name: 'specialties',
        type: 'string[]',
        description: 'Only crawl these "Find a Doctor" specialties (by name). Default: all of them.',
      },
      { name: 'max_specialties', type: 'number', description: 'Stop after this many specialties.', min: 0 },
      { name: 'include_providers', type: 'boolean', description: 'Crawl the provider and clinic directory (default true).' },
      { name: 'include_billing', type: 'boolean', description: 'Read the billing entities (default true).' },
    ],
    // No processor, like search_mycharts: the profile is assembled from several
    // anonymous pages, not one scraped response.
    run: (args) => {
      const hostname = requireStr(args, 'hostname');
      const specialties = strList(args, 'specialties');
      return fetchHospitalNetworkProfile(hostname, {
        ...(specialties.length > 0 ? { specialties } : {}),
        ...(args.max_specialties !== undefined ? { maxSpecialties: num(args, 'max_specialties', 0) } : {}),
        ...(args.include_providers !== undefined ? { includeProviders: args.include_providers !== false } : {}),
        ...(args.include_billing !== undefined ? { includeBilling: args.include_billing !== false } : {}),
      });
    },
  },
];
