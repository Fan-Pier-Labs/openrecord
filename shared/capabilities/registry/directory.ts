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
import { num, requireStr } from '../args';
import type { CapabilityImpl } from '../types';

export const DIRECTORY_CAPABILITIES: readonly CapabilityImpl[] = [
  {
    id: 'search_mycharts',
    title: 'Search the MyChart directory',
    description:
      "Look up a MyChart hostname for setup. Type a few letters of the user's health system name (e.g. \"uchealth\", \"mass general\"). Returns matching entries with their hostname, display name, login URL and logo. Pass the chosen `hostname` on to whatever this client uses to connect an account.",
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
];
