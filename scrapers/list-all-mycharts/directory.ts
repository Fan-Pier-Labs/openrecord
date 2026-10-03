/**
 * The MyChart directory — every Epic instance in the world, and its logo.
 *
 * Epic publishes the list that powers the org picker on mychart.org. Three
 * functions live here:
 *
 *  - {@link fetchMyChartDirectory} — Epic's live list, one request, with the
 *    login-URL corrections the last release's refresh recorded applied.
 *    Clients refresh from it about weekly; `fetch-mychart-instances.ts` calls
 *    it to regenerate `mychart-instances.json`.
 *  - {@link listMyCharts} — the checked-in lists, merged: what a client offers
 *    before (or instead of) a refresh. The one scraper that makes no request.
 *    {@link withManualEntries} merges the hand-kept file into a fetched list
 *    the same way.
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
import bundledInstances from './mychart-instances.json';
import manualEntries from './mychart-instances-manual.json';

/** The org-picker's data source. `locale` only changes the localized names. */
export const MYCHART_DIRECTORY_API_URL =
  'https://www.mychart.org/cached-api/help/organizations/?locale=en-us&includeOrganizations=1';

/**
 * Where the directory's images live. A separate host from the directory
 * itself, so it is a separate knob: {@link fetchMyChartDirectory} takes both,
 * and fake-mychart serves both from its own origin.
 */
export const MYCHART_MEDIA_BASE = 'https://media.epic.com/mychartdotorg';

/**
 * The origin every logo is served from. A sandboxed UI (the MCPB setup widget)
 * has to name it in its CSP, or the host serves it `img-src 'none'`.
 */
export const MYCHART_MEDIA_ORIGIN = new URL(MYCHART_MEDIA_BASE).origin;

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

/**
 * Our corrections to Epic's `loginUrl`, keyed by `slgId`: every bundled entry
 * whose `url` was resolved away from the one Epic publishes. See
 * `resolveLoginUrl.ts` for how they are found.
 *
 * Applied to the live directory too, or an online search would hand back the
 * same page the correction exists to avoid — but only while Epic still
 * publishes the URL we corrected. Once Epic changes it, Epic's new one wins.
 */
function bundledCorrections(): Map<string, { directoryUrl: string; url: string }> {
  const corrections = new Map<string, { directoryUrl: string; url: string }>();
  for (const entry of bundledInstances as MyChartInstanceSeed[]) {
    if (entry.directoryUrl) corrections.set(entry.slgId, { directoryUrl: entry.directoryUrl, url: entry.url });
  }
  return corrections;
}

/** An organization's image record, as the directory publishes it. */
interface DirectoryLogo {
  imageId: string;
  fileName: string;
  subAreaName: string;
}

/** One organization, as the directory publishes it. */
export interface DirectoryOrganization {
  slgId: string;
  name: string;
  loginUrl: string;
  // Read as `org.logo?.imageId`, and parsed off a directory entry that may not
  // carry the key at all, so absent and undefined already behaved identically.
  logo?: DirectoryLogo | undefined;
  brandName?: string;
  aliases?: string[];
  states?: string[];
  countries?: string[];
  liveOnCentral?: boolean;
  phone?: string;
  email?: string;
  emailHref?: string;
  faq?: string;
}

/**
 * One MyChart instance, in the shape every client consumes — and the shape of
 * each entry in `mychart-instances.json`.
 */
export interface MyChartInstance {
  /** Display name, e.g. "UCHealth". */
  name: string;
  /** The portal's login URL — what to connect to. */
  url: string;
  /**
   * The login URL Epic's directory publishes. Usually the same as `url`; it
   * differs when Epic's points somewhere that isn't the portal (UCSF's is an
   * information page) and a refresh found the real one.
   */
  directoryUrl: string;
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
  /**
   * True when the last refresh (`fetchResolvedMyChartDirectory`) found the
   * portal broken in a way that is the same from anywhere — hostname gone,
   * connection refused, TLS failure, a 5xx — twice. A hang is not counted. A
   * snapshot from that refresh, not a live check, and never set by a plain
   * directory fetch.
   */
  down?: boolean;
  /** Whether the instance participates in MyChart Central. */
  liveOnCentral: boolean;
  /**
   * The organization's MyChart support line, as Epic's picker shows it.
   * Present for about two thirds of the directory; null when the entry has
   * none.
   */
  phone: string | null;
  /** The organization's MyChart support email, when the entry has one. */
  email: string | null;
  /** The organization's FAQ page — nearly always its own `stdfile` FAQ. */
  faqUrl: string | null;
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
  'name' | 'url' | 'logoUrl' | 'slgId' | 'aliases' | 'down'
> & {
  /** Stored only when it differs from `url` — it is how a correction is recorded. */
  directoryUrl?: string;
  /**
   * Other hostnames that serve the same portal (Northwestern's `mynm.nm.org`
   * beside Epic's `mychart.cdh.org`), so a password saved against one of them
   * is still recognised. From `mychart-instances-manual.json` only.
   */
  extraHosts?: string[];
};

/** Narrow a full instance to what the checked-in seed stores. */
export function toSeedEntry(instance: MyChartInstance): MyChartInstanceSeed {
  return {
    name: instance.name,
    url: instance.url,
    logoUrl: instance.logoUrl,
    slgId: instance.slgId,
    aliases: instance.aliases,
    ...(instance.directoryUrl !== instance.url ? { directoryUrl: instance.directoryUrl } : {}),
    ...(instance.down ? { down: true } : {}),
  };
}

/** `mychart-instances-manual.json`: what research found that a refresh can't. */
interface ManualEntries {
  corrections: { slgId: string; directoryUrl: string; url: string }[];
  additions: { slgId: string; name: string; url: string; aliases: string[] }[];
  extraHosts: { slgId: string; host: string }[];
}

/**
 * Merge `mychart-instances-manual.json` — what research found that a refresh
 * can't — into a list of entries, either the checked-in one or one just
 * fetched from Epic. Each hand entry carries its source.
 *
 *  - A `correction` replaces an entry's `url`, but only while that entry's Epic
 *    URL is still the one the correction was made against, so Epic changing it
 *    retires the correction.
 *  - An `addition` is an organization Epic doesn't list.
 *  - `extraHosts` are more hostnames for an organization's portal.
 */
export function withManualEntries(entries: readonly MyChartInstanceSeed[]): MyChartInstanceSeed[] {
  const manual = manualEntries as ManualEntries;
  const corrections = new Map(manual.corrections.map((c) => [c.slgId, c]));
  const extraHosts = new Map<string, string[]>();
  for (const { slgId, host } of manual.extraHosts) extraHosts.set(slgId, [...(extraHosts.get(slgId) ?? []), host]);

  const merged = entries.map((entry) => {
    const epicUrl = entry.directoryUrl ?? entry.url;
    const correction = corrections.get(entry.slgId);
    const hosts = extraHosts.get(entry.slgId);
    return {
      ...entry,
      ...(correction?.directoryUrl === epicUrl ? { url: correction.url, directoryUrl: epicUrl } : {}),
      ...(hosts ? { extraHosts: hosts } : {}),
    };
  });
  const known = new Set(entries.map((e) => e.slgId));
  const added = manual.additions
    .filter((a) => !known.has(a.slgId))
    .map(({ slgId, name, url, aliases }) => ({ name, url, logoUrl: defaultLogoUrl(), slgId, aliases }));
  return [...merged, ...added];
}

let checkedIn: MyChartInstanceSeed[] | null = null;

/**
 * Every MyChart the checked-in files know: `mychart-instances.json`
 * (generated — Epic's directory, every login URL checked, as of the last MCPB
 * release) merged with the hand-kept `mychart-instances-manual.json`. Unlike
 * the other scrapers it makes no request; it is what a client offers before
 * its first refresh from {@link fetchMyChartDirectory}, and when that fails.
 */
export function listMyCharts(): MyChartInstanceSeed[] {
  checkedIn ??= withManualEntries(bundledInstances);
  return checkedIn;
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
function toInstance(
  raw: unknown,
  mediaBase: string,
  corrections: Map<string, { directoryUrl: string; url: string }>,
): MyChartInstance | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const org = raw as Record<string, unknown>;

  const name = typeof org.name === 'string' ? org.name.trim() : '';
  const slgId = typeof org.slgId === 'string' ? org.slgId : '';
  const directoryUrl = typeof org.loginUrl === 'string' ? org.loginUrl.trim() : '';
  if (!name || !directoryUrl) return null;
  const correction = corrections.get(slgId);
  const url = correction?.directoryUrl === directoryUrl ? correction.url : directoryUrl;

  const logo = org.logo as DirectoryLogo | undefined;
  return {
    name,
    url,
    directoryUrl,
    logoUrl: logoUrlFor({ slgId, name, loginUrl: directoryUrl, logo }, mediaBase),
    slgId,
    aliases: asStringArray(org.aliases),
    states: asStringArray(org.states),
    countries: asStringArray(org.countries),
    brandName: typeof org.brandName === 'string' ? org.brandName : '',
    liveOnCentral: org.liveOnCentral === true,
    phone: nonEmptyString(org.phone),
    email: nonEmptyString(org.email),
    faqUrl: nonEmptyString(org.faq),
  };
}

/** The directory sends `""` rather than omitting a contact field it lacks. */
function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
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
  const corrections = bundledCorrections();
  return mergeDuplicates(
    organizations
      .map((org) => toInstance(org, mediaBase, corrections))
      .filter((i): i is MyChartInstance => i !== null),
  );
}

/** A portal's identity for comparison: host and mount, ignoring case and the login route. */
function portalKey(url: string): string {
  try {
    const { host, pathname } = new URL(url);
    const path = pathname.toLowerCase();
    const route = path.indexOf('/authentication/');
    return `${host.toLowerCase()}${(route >= 0 ? path.slice(0, route) : path).replace(/\/+$/, '')}`;
  } catch {
    return url;
  }
}

/**
 * Collapse entries with the same name **and** the same portal into one, which
 * a picker would otherwise show twice: Epic lists Cleveland Clinic once for
 * the US (`320`) and once for Canada (`320-1`). The shortest `slgId` — the
 * parent's — is kept, with every entry's aliases, states and countries.
 *
 * Same name alone is not a duplicate ("Baptist Health" is two systems, in
 * Alabama and Arkansas), and neither is same portal alone (affiliates sharing
 * a parent's MyChart are searched by their own names).
 */
export function mergeDuplicates(instances: MyChartInstance[]): MyChartInstance[] {
  const groups = new Map<string, MyChartInstance[]>();
  for (const instance of instances) {
    const key = `${instance.name.toLowerCase()}|${portalKey(instance.url)}`;
    groups.set(key, [...(groups.get(key) ?? []), instance]);
  }
  const union = (lists: string[][]) => [...new Set(lists.flat())];
  return [...groups.values()].map((group) => {
    if (group.length === 1) return group[0]!;
    const kept = group.reduce((a, b) => (b.slgId.length < a.slgId.length ? b : a));
    return {
      ...kept,
      aliases: union(group.map((i) => i.aliases)),
      states: union(group.map((i) => i.states)),
      countries: union(group.map((i) => i.countries)),
    };
  });
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

/**
 * Every mount prefix the bundled directory publishes for a host, most-listed
 * first. A host that serves several tenants (`mychart.adventhealth.com/gracemedical`,
 * `/shepherdshope`, …) often has no default at its root, so discovery has
 * nowhere to land — but Epic's own picker knows every mount on it.
 */
export function directoryPrefixesFor(hostname: string): string[] {
  const wanted = hostname.toLowerCase();
  const counts = new Map<string, number>();
  for (const instance of listMyCharts()) {
    let url: URL;
    try {
      url = new URL(instance.url);
    } catch {
      continue;
    }
    if (url.host.toLowerCase() !== wanted) continue;
    const prefix = url.pathname.split('/').find(Boolean);
    if (!prefix || prefix.toLowerCase() === 'authentication') continue;
    counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]).map(([prefix]) => prefix);
}
