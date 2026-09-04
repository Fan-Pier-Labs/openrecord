/**
 * "Am I running the current version?" — asked against a file we publish
 * ourselves, not against a third party's API.
 *
 * This replaces a call to `api.github.com/.../releases/latest` that lived in
 * `shared/`. Three things were wrong with it:
 *
 *  - **It answered a different question.** A GitHub release tag is whatever the
 *    last tag happened to be. What a client needs to know is which version of
 *    the scraper core it is expected to be on, and where to go to get it —
 *    which is ours to state, not GitHub's to infer.
 *  - **It went out through a second fetch path.** Every other outbound request
 *    in this repo leaves through {@link scraperFetch}; that one didn't, so it
 *    had none of the deadline, header or limiter behaviour, and re-derived its
 *    own abort timer to compensate.
 *  - **The unauthenticated GitHub API is rate-limited by IP** (60/hour), so the
 *    check silently stopped answering for anyone behind a shared address.
 *
 * The manifest is a static JSON file on the splash site's own S3 bucket,
 * generated from the packages' `package.json` versions at deploy time. See
 * `openrecord-splash/generate-version.ts` and the README there.
 *
 * Everything here is best-effort: a network failure, a rate limit, a malformed
 * document and an offline laptop are all the same answer — `null`, meaning "no
 * idea", never a thrown error and never a blocked caller.
 */

import { compareVersions } from 'compare-versions';

import { scraperFetch } from '../http';

/** Where the manifest is published. */
export const VERSION_MANIFEST_URL = 'https://openrecord.fanpierlabs.com/version.json';

/**
 * How long to wait for it. Two orders of magnitude below the scraper deadline
 * on purpose: nothing depends on the answer, so a slow one is worth less than
 * the delay it would add to a CLI invocation that is otherwise ready to exit.
 */
export const VERSION_CHECK_TIMEOUT_MS = 3_000;

/**
 * The things that ship, and can therefore be out of date.
 *
 * `scrapers` is the core every client embeds; the other three are the shipped
 * clients. They are versioned separately today — the extension is on 2.x while
 * the CLI is on 1.x — so a single "the version" would be wrong for someone.
 */
export const VERSION_TARGETS = ['scrapers', 'cli', 'mcpb', 'app'] as const;
export type VersionTarget = (typeof VERSION_TARGETS)[number];

export interface VersionManifest {
  /**
   * Document schema, so a future shape change can be rolled out without
   * breaking clients already in the wild — an old client reading a `schema: 2`
   * document declines to interpret it rather than guessing.
   */
  schema: 1;
  /** Latest published version of each target, as a bare semver (no `v`). */
  versions: Record<VersionTarget, string>;
  /** Where someone on an older version should go. Keyed the same way. */
  updateUrls: Record<VersionTarget, string>;
}

export const VERSION_MANIFEST_SCHEMA = 1;

export interface VersionCheck {
  target: VersionTarget;
  /** What the caller told us it is running. */
  currentVersion: string;
  /** What the site says is current. */
  latestVersion: string;
  updateAvailable: boolean;
  /** Straight from the manifest, so where to update can change without a release. */
  updateUrl: string;
}

function isVersionRecord(value: unknown): value is Record<VersionTarget, string> {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return VERSION_TARGETS.every((target) => typeof record[target] === 'string' && record[target] !== '');
}

/**
 * Validate a parsed JSON document as a manifest, or return null.
 *
 * Exported because the generator's test checks the committed file with it: the
 * document a client will actually read is the one the reader accepts, and a
 * hand-written duplicate of these rules in a test would only ever assert that
 * the duplicate agrees with itself.
 */
export function parseVersionManifest(value: unknown): VersionManifest | null {
  if (typeof value !== 'object' || value === null) return null;
  const doc = value as Record<string, unknown>;
  if (doc.schema !== VERSION_MANIFEST_SCHEMA) return null;
  if (!isVersionRecord(doc.versions)) return null;
  if (!isVersionRecord(doc.updateUrls)) return null;
  return {
    schema: VERSION_MANIFEST_SCHEMA,
    versions: doc.versions,
    updateUrls: doc.updateUrls,
  };
}

export interface VersionFetchOptions {
  /** Override the manifest location. Tests and staging only. */
  url?: string;
  /** Override the deadline. Clamped by `scraperFetch` to the scraper maximum. */
  timeoutMs?: number;
}

/**
 * Fetch and validate the published manifest. Never throws; `null` means
 * "couldn't tell" — offline, blocked, 404, or a document we don't understand.
 */
export async function fetchVersionManifest(
  options: VersionFetchOptions = {},
): Promise<VersionManifest | null> {
  try {
    const response = await scraperFetch(
      options.url ?? VERSION_MANIFEST_URL,
      { headers: { Accept: 'application/json' } },
      { timeoutMs: options.timeoutMs ?? VERSION_CHECK_TIMEOUT_MS },
    );
    if (!response.ok) return null;
    return parseVersionManifest(await response.json());
  } catch {
    return null;
  }
}

export interface VersionCheckOptions extends VersionFetchOptions {
  /** What this caller is running, e.g. the CLI's own `package.json` version. */
  currentVersion: string;
  /** Which of the shipped things that is. Defaults to the scraper core. */
  target?: VersionTarget;
  /** Skip the network and check against an already-fetched manifest. */
  manifest?: VersionManifest;
}

/**
 * Whether the caller is behind the published version.
 *
 * `null` on any failure — the caller is expected to say nothing in that case
 * rather than claim to be up to date, because "we couldn't reach the site" and
 * "you are current" are different facts.
 */
export async function checkVersion(options: VersionCheckOptions): Promise<VersionCheck | null> {
  const manifest = options.manifest ?? (await fetchVersionManifest(options));
  if (!manifest) return null;

  const target = options.target ?? 'scrapers';
  const latestVersion = manifest.versions[target];

  // `compareVersions` throws on anything that isn't semver, and both sides can
  // be: a local build stamped `dev`, or a manifest field that is a string but
  // not a version. That is a "couldn't tell", the same as an unreachable site —
  // never an unhandled rejection out of a fire-and-forget call.
  let updateAvailable: boolean;
  try {
    updateAvailable = compareVersions(options.currentVersion, latestVersion) < 0;
  } catch {
    return null;
  }

  return {
    target,
    currentVersion: options.currentVersion,
    latestVersion,
    updateAvailable,
    updateUrl: manifest.updateUrls[target],
  };
}

/**
 * The one-line notice a client shows. Here rather than in each client so the
 * CLI, the extension and the app can't drift into saying different things
 * about the same fact.
 */
export function formatUpdateNotice(check: VersionCheck): string {
  return `Update available: v${check.currentVersion} → v${check.latestVersion} — ${check.updateUrl}`;
}
