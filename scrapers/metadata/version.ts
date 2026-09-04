/**
 * Whether this client is on the version we publish.
 *
 * Reads a small JSON manifest from our own site — `versions` and `updateUrls`,
 * keyed by the things that ship. Four keys because they version separately: the
 * extension is on 2.x while the CLI is on 1.x, so a single "the version" would
 * be wrong for someone. The update URL travels in the document so an installed
 * client can be sent somewhere new without needing the update it is announcing.
 *
 * Best-effort throughout: unreachable, 404, not JSON, malformed, not semver —
 * all `null`, meaning "couldn't tell". Never a throw, and never a claim of
 * being up to date, which is a different fact.
 */

import { compareVersions, validate } from 'compare-versions';

import { isTelemetryDisabled } from '../../shared/telemetry';
import { scraperFetch } from '../http';

export const VERSION_MANIFEST_URL = 'https://openrecord.fanpierlabs.com/mcpb_version.json';

export const VERSION_TARGETS = ['scrapers', 'cli', 'mcpb', 'app'] as const;
export type VersionTarget = (typeof VERSION_TARGETS)[number];

export interface VersionManifest {
  versions: Record<VersionTarget, string>;
  updateUrls: Record<VersionTarget, string>;
}

export interface VersionCheck {
  target: VersionTarget;
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  updateUrl: string;
}

function hasEveryTarget(value: unknown): value is Record<VersionTarget, string> {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return VERSION_TARGETS.every((t) => typeof record[t] === 'string' && record[t] !== '');
}

/**
 * Validate a parsed document, or return null. Exported because the generator's
 * test checks the committed file with it — the document a client will accept is
 * the one this accepts, and a copy of these rules in a test would only prove
 * the copy agrees with itself.
 */
export function parseVersionManifest(value: unknown): VersionManifest | null {
  if (typeof value !== 'object' || value === null) return null;
  const doc = value as Record<string, unknown>;
  if (!hasEveryTarget(doc.versions) || !hasEveryTarget(doc.updateUrls)) return null;
  return { versions: doc.versions, updateUrls: doc.updateUrls };
}

export async function fetchVersionManifest(
  url: string = VERSION_MANIFEST_URL,
): Promise<VersionManifest | null> {
  try {
    const response = await scraperFetch(url, { headers: { Accept: 'application/json' } });
    return response.ok ? parseVersionManifest(await response.json()) : null;
  } catch {
    return null;
  }
}

/**
 * Whether `currentVersion` is behind what we publish for `target`.
 *
 * Opting out of telemetry opts out of this too. It is a request to our own
 * server on every run, so it puts the caller's IP and cadence in our logs the
 * same way an event does; someone who said "stop phoning home" meant this.
 */
export async function checkVersion(options: {
  currentVersion: string;
  target: VersionTarget;
  /** Skip the fetch and check against a manifest already in hand. */
  manifest?: VersionManifest;
  /** Override the manifest location. Tests and staging only. */
  url?: string;
}): Promise<VersionCheck | null> {
  if (!options.manifest && isTelemetryDisabled()) return null;

  const manifest = options.manifest ?? (await fetchVersionManifest(options.url));
  if (!manifest) return null;

  const latestVersion = manifest.versions[options.target];
  // `compareVersions` throws on anything that isn't semver, and both sides can
  // be — a local build stamped `dev`, a manifest field that is a string but not
  // a version. The call site is `void checkVersion(...)`, so that would be an
  // unhandled rejection.
  if (!validate(options.currentVersion) || !validate(latestVersion)) return null;

  return {
    target: options.target,
    currentVersion: options.currentVersion,
    latestVersion,
    updateAvailable: compareVersions(options.currentVersion, latestVersion) < 0,
    updateUrl: manifest.updateUrls[options.target],
  };
}

/** The one-line notice a client prints, so no two clients word it differently. */
export function formatUpdateNotice(check: VersionCheck): string {
  return `Update available: v${check.currentVersion} → v${check.latestVersion} — ${check.updateUrl}`;
}
