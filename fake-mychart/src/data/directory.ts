/**
 * The mychart.org organization directory, as this instance would appear in it.
 *
 * A different Epic surface from everything else in here: `mychart.org` is the
 * public "find your MyChart" site, not a portal, and it is where every client
 * gets its list of instances. The fake serves it for the same reason it serves
 * the portal — so the directory scraper and the mobile app's first-boot refresh
 * have a target that isn't Epic's production site.
 *
 * The entries deliberately cover all three logo cases the real payload has
 * (own image, no image, and an organization the scraper has to fall back on),
 * because the fallbacks are the part a happy-path fixture would never reach.
 */

export const DIRECTORY_LOGO = {
  imageId: 'B7A4E1C0-0000-4000-9000-5F1E2D3C4B5A',
  fileName: '5f1e2d3c4b5a69788796a5b4c3d2e1f0.png',
  subAreaName: 'organizations',
} as const;

export interface FakeDirectoryOrganization {
  slgId: string;
  name: string;
  loginUrl: string;
  logo?: { imageId: string; fileName: string; subAreaName: string };
  states: string[];
  countries: string[];
  brandName: string;
  liveOnCentral: boolean;
  aliases: string[];
}

/**
 * Build the directory as served from `origin`. Login URLs point back at this
 * server — including its current mount mode — so a client that picks an entry
 * out of the directory can go straight on to log in to it.
 */
export function fakeDirectoryOrganizations(
  origin: string,
  mountPrefix: string,
): FakeDirectoryOrganization[] {
  const base = `${origin}${mountPrefix}`;
  return [
    {
      slgId: '9001',
      name: 'Springfield General Hospital',
      loginUrl: base,
      logo: { ...DIRECTORY_LOGO },
      states: ['OR'],
      countries: ['US'],
      brandName: 'MyChart',
      liveOnCentral: true,
      aliases: ['Springfield Nuclear Plant Occupational Health'],
    },
    {
      slgId: '9002',
      name: 'Shelbyville Medical Group',
      loginUrl: `${base}?org=shelbyville`,
      states: ['OR'],
      countries: ['US'],
      brandName: 'ShelbyChart',
      liveOnCentral: false,
      aliases: [],
    },
    {
      // No login URL at all — three real entries look like this, and the
      // scraper is expected to drop them rather than offer a dead row.
      slgId: '9003',
      name: 'Ogdenville Health (no portal)',
      loginUrl: '',
      states: [],
      countries: ['US'],
      brandName: '',
      liveOnCentral: false,
      aliases: [],
    },
  ];
}
