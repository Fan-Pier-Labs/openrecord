/**
 * Generates `mcpb_version.json`, which this site publishes at
 * https://openrecord.fanpierlabs.com/mcpb_version.json for already-installed
 * clients to check themselves against.
 *
 *     bun run version:manifest        # from the repo root
 *
 * The name says mcpb, the file covers every target — `scrapers`, `cli`, `mcpb`
 * and `app`. The URL is published and clients are pinned to it, so it stays as
 * it is; read it as "the manifest", not "the extension's manifest".
 *
 * `deploy.sh` runs it immediately before upload, so a deploy cannot ship a
 * stale manifest. The versions are read out of each package rather than typed
 * here: a second copy would drift, and the failure is silent either way — every
 * client told it is out of date, or none told it is.
 *
 * The output is deterministic, so `__tests__/version.unit.test.ts` can diff the
 * committed file against a fresh generation and fail the build when a version
 * bump forgets to regenerate it.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  VERSION_TARGETS,
  type VersionManifest,
  type VersionTarget,
} from '../scrapers/metadata/version';

const REPO_ROOT = join(import.meta.dir, '..');

export const VERSION_MANIFEST_PATH = join(import.meta.dir, 'mcpb_version.json');

/** Which `package.json` states the shipping version of each target. */
const VERSION_SOURCES: Record<VersionTarget, string> = {
  scrapers: 'scrapers/package.json',
  cli: 'npm-package/package.json',
  // manifest.json, not package.json: it is the one Claude Desktop reads.
  // Nothing enforces that the two agree, so the test asserts it.
  mcpb: 'claude-desktop-extension/manifest.json',
  app: 'expo-app/package.json',
};

/**
 * Where someone on an old version goes. In the manifest rather than compiled
 * into each client: the App Store URL doesn't exist yet, and when it does, every
 * already-installed client should start pointing at it without needing the
 * update it is telling people about. The .mcpb is downloaded from this site.
 */
const UPDATE_URLS: Record<VersionTarget, string> = {
  scrapers: 'https://github.com/Fan-Pier-Labs/openrecord/releases/latest',
  cli: 'https://www.npmjs.com/package/mychart-cli',
  mcpb: 'https://openrecord.fanpierlabs.com/',
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
  return { versions, updateUrls: { ...UPDATE_URLS } };
}

/** The exact bytes of the file, so callers can compare without writing. */
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
