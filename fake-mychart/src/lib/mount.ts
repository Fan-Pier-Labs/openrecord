/**
 * Real MyChart instances are deployed one of two ways, and the scraper has to
 * discover which before it can build any URL:
 *
 *   - **Path-prefixed** (the common case): `mychart.uhhospitals.org/` redirects
 *     to `/MyChart/`, UCSF to `/UCSFMyChart/`. Every route lives under that
 *     prefix.
 *   - **Root-mounted**: `mychart.clevelandclinic.org/` redirects straight to
 *     `./Authentication/Login?`. There is no prefix — the controller name *is*
 *     the first path segment.
 *
 * Set `FAKE_MYCHART_ROOT_MOUNT=true` to model the root-mounted deployment.
 * The fake defaults to path-prefixed so existing tests are unaffected.
 */
export function isRootMount(): boolean {
  return process.env.FAKE_MYCHART_ROOT_MOUNT === 'true';
}

/**
 * Path prefix to put in front of MyChart routes: `/MyChart` normally, empty
 * for a root-mounted instance.
 */
export function mountPrefix(): string {
  return isRootMount() ? '' : '/MyChart';
}
