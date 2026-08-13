import { NextRequest, NextResponse } from 'next/server';
import { fakeDirectoryOrganizations } from '@/data/directory';
import { mountPrefix } from '@/lib/mount';
import * as shapes from '@/data/realShapes';
import { conformToShape } from '@/lib/shape';

/**
 * `GET /cached-api/help/organizations/?locale=…&includeOrganizations=1`
 *
 * mychart.org's organization directory — the endpoint behind Epic's "find your
 * MyChart" picker, and the source every client's instance list comes from.
 * Served here so the directory scraper and the mobile app's first-boot refresh
 * have a target in CI and in dev.
 *
 * Faithful in the two ways that bite:
 *
 *  - **`includeOrganizations` is honored.** Without it the real endpoint
 *    returns the help/country/state data and *no* `organizations` key at all.
 *    A client that forgets the parameter gets the same empty-looking success
 *    from the fake that it would get from Epic.
 *  - **Logo records are ids, not URLs**, exactly as in the real payload — an
 *    `imageId` and a `fileName` that a client resolves against a media base.
 *    This server mirrors Epic's media paths under `/mychartdotorg/…` and
 *    serves checked-in placeholder images from them, so a client pointed at
 *    the fake (`fetchMyChartDirectory({ directoryUrl, mediaBase })`) gets
 *    working logos without a single request leaving for Epic.
 *
 * One difference, and it is Next's, not a choice: mychart.org canonicalizes
 * *to* the trailing slash (`…/organizations?x` 308s to `…/organizations/?x`)
 * and Next canonicalizes away from it, so the fake 308s the other direction.
 * Both forms answer either way, in one redirect a client already has to
 * follow. Forcing the real direction means `trailingSlash: true`, which would
 * change the canonical form of every MyChart route in here — a much bigger lie
 * than this one.
 */
export function GET(request: NextRequest) {
  const url = new URL(request.url);
  const includeOrganizations = url.searchParams.get('includeOrganizations') === '1';

  const base = conformToShape(shapes.helpOrganizations, {
    organizationOptionsByScreenId: {},
    countryData: { alpha_2_index: { US: { name: 'United States', aliases: ['USA'] } } },
    stateData: { abbreviation_index: { OR: { name: 'Oregon', aliases: [], zips: ['97475'] } } },
  }) as Record<string, unknown>;

  const organizations = fakeDirectoryOrganizations(url.origin, `${mountPrefix()}/`).map((org) =>
    conformToShape(shapes.helpOrganization, org),
  );

  return NextResponse.json(includeOrganizations ? { ...base, organizations } : base, {
    headers: { 'Cache-Control': 'max-age=14400, stale-while-revalidate=28800' },
  });
}
