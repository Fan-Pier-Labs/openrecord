import { NextRequest, NextResponse } from 'next/server';
import {
  fakeNpiProviders,
  npiOrganizationShape,
  npiPersonShape,
  type FakeNpiProvider,
} from '@/data/npiRegistry';
import { conformToShape } from '@/lib/shape';

/**
 * `GET /npiregistry/api/?version=2.1&…`
 *
 * CMS's NPI Registry — the public provider directory `scrapers/npi/` reads.
 * The path mirrors the real host's (`npiregistry.cms.hhs.gov/api/`) so a client
 * pointed here with `apiUrl` sends exactly the request it would send CMS.
 *
 * Faithful in the ways the scraper depends on, all of them observed on the
 * live API (2026-09, version 2.1) and documented in `scrapers/npi/README.md`:
 *
 *  - **A refusal is HTTP 200 with an `Errors` array**, not a 4xx. That is the
 *    single most important behavior to copy: a client that treats non-2xx as
 *    the failure path sees a refused query as a *successful empty search*, and
 *    tells a patient their doctor is not in the registry. The processor passes
 *    that array through in every mode (rule 7) precisely because each
 *    `description` is a complete sentence about what was wrong.
 *  - **`state` and `enumeration_type` are refused on their own.** Every other
 *    criterion may stand alone; no criteria at all is refused too.
 *  - **A trailing `*` needs two leading characters.** `Jo*` searches, `J*` is
 *    refused.
 *  - **`limit` is clamped silently** to {@link MAX_LIMIT}, and `0` becomes the
 *    default 10. A caller asking for 500 gets 200 and no warning.
 *  - **`skip` past {@link MAX_SKIP} is refused**, which is what caps a query at
 *    1,200 results.
 *  - **An unheld but well-formed number answers `result_count: 0`**, not an
 *    error — the scraper renders that as `null`, and a fake that 404'd here
 *    would let a wrong `null`-vs-throw contract ship.
 *
 * Matching is case-insensitive and, like the real API, name criteria match the
 * whole field rather than a substring unless the query ends in `*`.
 *
 * One difference, and it is Next's, not a choice: the real path ends in a
 * slash and Next canonicalizes that away, so `/npiregistry/api/?…` answers
 * after one 308 that a client already has to follow. Forcing the real
 * direction means `trailingSlash: true`, which would change the canonical form
 * of every MyChart route in here — the same trade the organization directory
 * route documents.
 */

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 10;
const MAX_SKIP = 1000;

interface ApiError {
  field: string;
  description: string;
  number: string;
}

function errors(...list: ApiError[]): NextResponse {
  // HTTP 200, deliberately. See the note above.
  return NextResponse.json({ Errors: list });
}

/** Criteria that the real API refuses to search on by themselves. */
const NEEDS_COMPANY = new Set(['state', 'enumeration_type']);

/**
 * Does `value` match `criterion`?
 *
 * Exact, case-insensitive — unless the criterion ends in `*`, which makes it a
 * prefix match. Both are what the live API does; a substring match here would
 * make the fake answer queries CMS returns nothing for.
 */
function matches(value: string | undefined, criterion: string): boolean {
  const field = (value ?? '').toLowerCase();
  const wanted = criterion.toLowerCase();
  if (wanted.endsWith('*')) return field.startsWith(wanted.slice(0, -1));
  return field === wanted;
}

function anyAddress(provider: FakeNpiProvider, test: (address: Record<string, string>) => boolean): boolean {
  return provider.addresses.some(test);
}

export function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const criteria = new Map<string, string>();
  for (const name of [
    'number',
    'first_name',
    'last_name',
    'organization_name',
    'taxonomy_description',
    'city',
    'state',
    'postal_code',
    'enumeration_type',
  ]) {
    const value = params.get(name)?.trim();
    if (value) criteria.set(name, value);
  }

  if (criteria.size === 0) {
    return errors({
      field: 'number',
      description: 'No valid search criteria provided.',
      number: '5',
    });
  }
  if ([...criteria.keys()].every((name) => NEEDS_COMPANY.has(name))) {
    const field = [...criteria.keys()][0]!;
    return errors({
      field,
      description: `Field ${field} requires additional search criteria.`,
      number: '4',
    });
  }
  for (const [field, value] of criteria) {
    if (value.endsWith('*') && value.length < 3) {
      return errors({
        field,
        description: 'Wildcards require at least two leading characters.',
        number: '9',
      });
    }
  }

  const skip = Number(params.get('skip') ?? '0');
  if (Number.isFinite(skip) && skip > MAX_SKIP) {
    return errors({
      field: 'skip',
      description: `Skip value may not exceed ${MAX_SKIP}.`,
      number: '11',
    });
  }

  const requested = Number(params.get('limit') ?? '');
  const limit = !Number.isFinite(requested) || requested <= 0
    ? DEFAULT_LIMIT
    : Math.min(MAX_LIMIT, Math.floor(requested));

  const matched = fakeNpiProviders.filter((provider) => {
    for (const [field, value] of criteria) {
      switch (field) {
        case 'number':
          if (provider.number !== value) return false;
          break;
        case 'enumeration_type':
          if (provider.enumeration_type !== value) return false;
          break;
        case 'first_name':
          if (!matches(provider.basic.first_name, value)) return false;
          break;
        case 'last_name':
          if (!matches(provider.basic.last_name, value)) return false;
          break;
        case 'organization_name':
          if (!matches(provider.basic.organization_name, value)) return false;
          break;
        case 'taxonomy_description':
          // The one substring match the real API does: "Cardiology" finds
          // "Internal Medicine, Cardiovascular Disease".
          if (!provider.taxonomies.some((t) => t.desc.toLowerCase().includes(value.toLowerCase()))) {
            return false;
          }
          break;
        case 'city':
          if (!anyAddress(provider, (a) => matches(a.city, value))) return false;
          break;
        case 'state':
          if (!anyAddress(provider, (a) => matches(a.state, value))) return false;
          break;
        case 'postal_code':
          if (!anyAddress(provider, (a) => matches(a.postal_code, value))) return false;
          break;
        default:
          return false;
      }
    }
    return true;
  });

  const page = matched.slice(Math.max(0, skip), Math.max(0, skip) + limit);
  // Conformed per record, by kind: a person's `basic` and an organization's
  // are disjoint key sets on the live API, so one unioned skeleton would have
  // this server answer with fields CMS never sends.
  const results = page.map((provider) =>
    conformToShape(
      provider.enumeration_type === 'NPI-2' ? npiOrganizationShape : npiPersonShape,
      provider,
    ),
  );
  return NextResponse.json({ result_count: results.length, results });
}
