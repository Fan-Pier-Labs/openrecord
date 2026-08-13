/**
 * The MyChart directory — every Epic instance in the world, and its logo.
 *
 * Epic publishes the list that powers the org picker on mychart.org. Two
 * scrapers live here, both usable from any client (the app calls them on
 * device, `fetch-mychart-instances.ts` calls them to regenerate the checked-in
 * `mychart-instances.json`):
 *
 *  - {@link fetchMyChartDirectory} — one request, the whole list.
 *  - {@link fetchMyChartIcon} — one instance's logo, as bytes and a data URI.
 *
 * ## Where the list comes from
 *
 * It used to be inlined into the HTML of `/LoginSignup` as
 * `window.PageContext = { Directory: JSON.parse('…') }`, and that is what this
 * repo scraped until mychart.org was rebuilt as a Next.js app. The page now
 * ships no organizations at all — the picker fetches
 * `/cached-api/help/organizations/` client-side — so the old regex matched
 * nothing and the scrape threw. Anything reading the HTML is reading a page
 * that no longer contains the answer.
 *
 * The payload also carries `countryData` and `stateData` (name/alias/ZIP
 * dictionaries, together the large majority of its ~1.8 MB). Neither says
 * anything about an instance, so neither is parsed or stored.
 *
 * ## Where the logo comes from
 *
 * Reimplemented from the picker's own render path, in its order, because the
 * fallbacks are not decorative: eight organizations have no `logo` record, and
 * seven of those are large systems (Mayo, Kaiser, HealthPartners, …) whose
 * logo is a hand-placed file keyed by directory id.
 *
 *   1. the organization's own Directus image,
 *   2. else the per-organization override in {@link CUSTOM_LOGOS},
 *   3. else Epic's generic MyChart logo.
 *
 * Every logo in the directory is served by `media.epic.com` — one host, so
 * `scraperFetch`'s per-host permit is what paces a bulk fetch, and fetching
 * all ~1400 of them is 1400 gated round trips. Fetch the ones you are about to
 * show, not the whole set.
 *
 * The directory URL and the media base are both overridable, and both default
 * to Epic's. fake-mychart serves the pair, which is what keeps CI off Epic
 * entirely.
 */

import { scraperFetch } from '../http';

/** The org-picker's data source. `locale` only changes the localized names. */
export const MYCHART_DIRECTORY_API_URL =
  'https://www.mychart.org/cached-api/help/organizations/?locale=en-us&includeOrganizations=1';

/**
 * Where the directory's images live. A separate host from the directory
 * itself, so it is a separate knob: {@link fetchMyChartDirectory} takes both,
 * and fake-mychart serves both from its own origin.
 */
export const MYCHART_MEDIA_BASE = 'https://media.epic.com/mychartdotorg';

/** The generic logo, shown for an organization that has none of its own. */
export function defaultLogoUrl(mediaBase: string = MYCHART_MEDIA_BASE): string {
  return `${mediaBase}/site/en-us/images/login/default.png`;
}

/**
 * Logos Epic ships as site assets rather than directory records, keyed by
 * `slgId`. Lifted verbatim from the picker bundle; every id here belongs to an
 * organization whose directory entry has no `logo`.
 */
const CUSTOM_LOGOS: Readonly<Record<string, string>> = {
  '192': 'login/custom/globalHealth.png',
  '227': 'login/custom/healthPartners.png',
  '338': 'login/custom/northwestern.png',
  '459': 'login/custom/kaiserPermanente.png',
  '580': 'login/custom/myMercy.png',
  '872': 'login/custom/mijnRadboud.png',
  '896': 'login/custom/chi.png',
  '958': 'login/custom/mayoClinic.png',
  '990': 'login/custom/apotti.png',
};

/** An organization's image record, as the directory publishes it. */
export interface DirectoryLogo {
  imageId: string;
  fileName: string;
  subAreaName: string;
}

/** One organization, as the directory publishes it. */
export interface DirectoryOrganization {
  slgId: string;
  name: string;
  loginUrl: string;
  logo?: DirectoryLogo;
  brandName?: string;
  aliases?: string[];
  states?: string[];
  countries?: string[];
  liveOnCentral?: boolean;
}

/**
 * One MyChart instance, in the shape every client consumes — and the shape of
 * each entry in `mychart-instances.json`.
 */
export interface MyChartInstance {
  /** Display name, e.g. "UCHealth". */
  name: string;
  /** The portal's login URL. */
  url: string;
  /** Absolute logo URL, always set — the generic one when unbranded. */
  logoUrl: string;
  /** Epic's directory id, e.g. "432-112". Survives a rename; the name doesn't. */
  slgId: string;
  /** Other names the same organization is searched by. */
  aliases: string[];
  /** Two-letter US state codes the organization operates in. */
  states: string[];
  /** Two-letter country codes. */
  countries: string[];
  /** What the organization calls its portal — "MyChart", "Maisa", "MyUCHealth". */
  brandName: string;
  /** Whether the instance participates in MyChart Central. */
  liveOnCentral: boolean;
}

/**
 * The subset of an instance that ships in `mychart-instances.json`.
 *
 * That file is bundled into two clients, so it carries only fields something
 * actually reads: the picker renders `name`/`logoUrl`, connects to `url`,
 * searches `aliases`, and keys its icon cache on `slgId` (an organization can
 * be renamed; its directory id survives). Everything else stays available from
 * {@link fetchMyChartDirectory} at runtime.
 */
export type MyChartInstanceSeed = Pick<
  MyChartInstance,
  'name' | 'url' | 'logoUrl' | 'slgId' | 'aliases'
>;

/** Narrow a full instance to what the checked-in seed stores. */
export function toSeedEntry(instance: MyChartInstance): MyChartInstanceSeed {
  return {
    name: instance.name,
    url: instance.url,
    logoUrl: instance.logoUrl,
    slgId: instance.slgId,
    aliases: instance.aliases,
  };
}

/** The logo URL Epic's own picker would render for this organization. */
export function logoUrlFor(
  org: DirectoryOrganization,
  mediaBase: string = MYCHART_MEDIA_BASE,
): string {
  if (org.logo?.imageId && org.logo.fileName) {
    const area = org.logo.subAreaName || 'organizations';
    return `${mediaBase}/directus/${area}/${org.logo.imageId}/${org.logo.fileName}`;
  }
  const custom = CUSTOM_LOGOS[org.slgId];
  if (custom) return `${mediaBase}/site/en-us/images/${custom}`;
  return defaultLogoUrl(mediaBase);
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.length > 0);
}

/**
 * Turn one raw directory entry into an instance, or null if it can't be one.
 *
 * An entry with no `loginUrl` is dropped rather than defaulted: three of them
 * exist, and a picker row that navigates nowhere is worse than a missing row.
 */
function toInstance(raw: unknown, mediaBase: string): MyChartInstance | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const org = raw as Record<string, unknown>;

  const name = typeof org.name === 'string' ? org.name.trim() : '';
  const url = typeof org.loginUrl === 'string' ? org.loginUrl.trim() : '';
  const slgId = typeof org.slgId === 'string' ? org.slgId : '';
  if (!name || !url) return null;

  const logo = org.logo as DirectoryLogo | undefined;
  return {
    name,
    url,
    logoUrl: logoUrlFor({ slgId, name, loginUrl: url, logo }, mediaBase),
    slgId,
    aliases: asStringArray(org.aliases),
    states: asStringArray(org.states),
    countries: asStringArray(org.countries),
    brandName: typeof org.brandName === 'string' ? org.brandName : '',
    liveOnCentral: org.liveOnCentral === true,
  };
}

/**
 * Parse the directory API's response body.
 *
 * Throws when `organizations` is missing entirely — that means the endpoint
 * changed shape, and silently returning an empty list would look to every
 * client exactly like "Epic has no organizations", which is the failure the
 * old HTML scrape spent months in.
 */
export function parseDirectoryPayload(
  payload: unknown,
  mediaBase: string = MYCHART_MEDIA_BASE,
): MyChartInstance[] {
  const organizations = (payload as { organizations?: unknown } | null)?.organizations;
  if (!Array.isArray(organizations)) {
    throw new Error(
      'MyChart directory response has no "organizations" array — the endpoint shape changed.',
    );
  }
  return organizations
    .map((org) => toInstance(org, mediaBase))
    .filter((i): i is MyChartInstance => i !== null);
}

/**
 * Fetch every MyChart instance Epic publishes. One request; ~1400 entries.
 *
 * Both endpoints are overridable, and they move together: an entry's `logo` is
 * an id and a filename, not a URL, so a directory served from somewhere else
 * has its images somewhere else too. Point them at fake-mychart and nothing
 * touches Epic.
 */
export async function fetchMyChartDirectory(
  options: { directoryUrl?: string; mediaBase?: string } = {},
): Promise<MyChartInstance[]> {
  const url = options.directoryUrl ?? MYCHART_DIRECTORY_API_URL;
  const response = await scraperFetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`MyChart directory request failed: ${response.status} ${response.statusText}`);
  }
  return parseDirectoryPayload(await response.json(), options.mediaBase);
}

/** A fetched logo, ready to render or to store. */
export interface MyChartIcon {
  /** Where it came from. */
  url: string;
  /** As reported by the server, defaulted to PNG (what Epic serves). */
  contentType: string;
  bytes: Uint8Array;
  /** `data:<contentType>;base64,…` — renderable directly by an `<Image>`. */
  dataUri: string;
}

function contentTypeFor(response: Response, url: string): string {
  const header = response.headers.get('content-type');
  if (header) {
    const type = header.split(';')[0]?.trim();
    if (type) return type;
  }
  if (/\.svg$/i.test(url)) return 'image/svg+xml';
  if (/\.jpe?g$/i.test(url)) return 'image/jpeg';
  return 'image/png';
}

/**
 * Fetch one instance's logo.
 *
 * Takes the instance itself or a bare logo URL, so a caller holding a whole
 * directory entry doesn't have to reach into it. Returns null when the logo is
 * simply not there (a 404, an unreachable host) — a missing logo is a blank
 * square in a picker, never a reason to fail whatever the caller was doing.
 * A malformed argument still throws, because that is a bug in the caller.
 */
export async function fetchMyChartIcon(
  instanceOrUrl: string | Pick<MyChartInstance, 'logoUrl'>,
): Promise<MyChartIcon | null> {
  const url = typeof instanceOrUrl === 'string' ? instanceOrUrl : instanceOrUrl.logoUrl;
  if (!url) return null;

  let response: Response;
  try {
    response = await scraperFetch(url, {
      headers: { Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8' },
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length === 0) return null;

  const contentType = contentTypeFor(response, url);
  return {
    url,
    contentType,
    bytes,
    dataUri: `data:${contentType};base64,${Buffer.from(bytes).toString('base64')}`,
  };
}
