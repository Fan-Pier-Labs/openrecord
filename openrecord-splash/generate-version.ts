/**
 * Generates `version.json` — the file this site publishes at
 * https://openrecord.fanpierlabs.com/version.json so a client already in
 * someone's hands can find out whether it is behind.
 *
 * Run it by hand, or let `deploy.sh` run it (it does, immediately before
 * upload, so a deploy cannot ship a stale manifest):
 *
 *     bun run version:manifest        # from the repo root
 *
 * The versions are not typed in here — they are read out of each package's
 * `package.json`, which is the thing that actually ships. A hand-maintained
 * number here would be a second source of truth, and the failure mode is
 * silent: every client is told it is out of date, or none is told it is.
 *
 * The output is deterministic (no timestamp, sorted keys), so the committed
 * file and a fresh regeneration are byte-identical. `__tests__/version.unit.test.ts`
 * relies on that to fail the build when a package version is bumped and the
 * manifest isn't regenerated.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  VERSION_MANIFEST_SCHEMA,
  VERSION_TARGETS,
  type VersionManifest,
  type VersionTarget,
} from '../scrapers/metadata/version';

const REPO_ROOT = join(import.meta.dir, '..');

export const VERSION_MANIFEST_PATH = join(import.meta.dir, 'version.json');

/** Which `package.json` states the shipping version of each target. */
const VERSION_SOURCES: Record<VersionTarget, string> = {
  scrapers: 'scrapers/package.json',
  cli: 'npm-package/package.json',
  // The extension's manifest.json and package.json are kept in lockstep by its
  // own pack script; manifest.json is the one Claude Desktop reads.
  mcpb: 'claude-desktop-extension/manifest.json',
  app: 'expo-app/package.json',
};

/**
 * Where someone on an old version goes. In the manifest rather than compiled
 * into each client on purpose: the App Store URL doesn't exist yet, and when it
 * does, every already-installed client should start pointing at it without
 * needing the update it is telling people about.
 */
const UPDATE_URLS: Record<VersionTarget, string> = {
  scrapers: 'https://github.com/Fan-Pier-Labs/openrecord/releases/latest',
  cli: 'https://www.npmjs.com/package/mychart-cli',
  mcpb: 'https://github.com/Fan-Pier-Labs/openrecord/releases/latest',
  app: 'https://openrecord.fanpierlabs.com/',
};

function readVersion(relativePath: string): string {
  const raw = readFileSync(join(REPO_ROOT, relativePath), 'utf8');
  const { version } = JSON.parse(raw) as { version?: unknown };
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+/.test(version)) {
    throw new Error(`${relativePath} has no usable "version" field (got ${JSON.stringify(version)})`);
  }
  return version;
}

export function buildVersionManifest(): VersionManifest {
  const versions = {} as Record<VersionTarget, string>;
  for (const target of VERSION_TARGETS) {
    versions[target] = readVersion(VERSION_SOURCES[target]);
  }
  return { schema: VERSION_MANIFEST_SCHEMA, versions, updateUrls: { ...UPDATE_URLS } };
}

/** The exact bytes of `version.json`, so callers can compare without writing. */
export function renderVersionManifest(): string {
  return `${JSON.stringify(buildVersionManifest(), null, 2)}\n`;
}

/** Writes it. The path is a parameter so a test can prove the write without
 *  rewriting the file it is checking. */
export function writeVersionManifest(destination: string = VERSION_MANIFEST_PATH): string {
  const contents = renderVersionManifest();
  writeFileSync(destination, contents);
  return contents;
}

if (import.meta.main) {
  writeVersionManifest();
  console.log(`Wrote ${VERSION_MANIFEST_PATH}`);
  console.log(renderVersionManifest());
}
