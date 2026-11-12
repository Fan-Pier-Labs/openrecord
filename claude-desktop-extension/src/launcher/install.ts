// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * Downloads one release's payload into its own versions folder.
 *
 * Unsigned: the site's bucket is trusted, and HTTPS covers the trip. Every file
 * must still match the sha256 `payload.json` gives it, which catches a release
 * caught mid-upload or a CDN serving one file from the previous release.
 *
 * Files land in a temporary folder that is renamed into place only once all of
 * them check out, so a folder named for a version is always complete.
 */

import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { scraperFetch } from '../../../scrapers/http';
import {
  DOWNLOAD_PREFIX,
  LAUNCHER_ABI,
  PAYLOAD_MANIFEST,
  VERSIONS_DIR,
  installState,
  parsePayloadManifest,
} from './payloads';

const PAYLOAD_BASE_URL = 'https://openrecord.fanpierlabs.com/mcpb-payload';

async function download(url: string): Promise<Buffer> {
  const response = await scraperFetch(url, { headers: { Accept: '*/*' } });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function installPayload(
  version: string,
  { versionsDir = VERSIONS_DIR, baseUrl = PAYLOAD_BASE_URL } = {},
): Promise<void> {
  const base = `${baseUrl}/${version}/`;
  const manifestBytes = await download(base + PAYLOAD_MANIFEST);
  const manifest = parsePayloadManifest(manifestBytes.toString('utf8'));
  if (manifest?.version !== version) throw new Error(`payload ${version}: malformed payload.json`);
  if (manifest.launcherAbi > LAUNCHER_ABI) {
    throw new Error(`payload ${version} needs launcher ABI ${manifest.launcherAbi}, this is ${LAUNCHER_ABI}`);
  }

  fs.mkdirSync(versionsDir, { recursive: true });
  const staging = fs.mkdtempSync(path.join(versionsDir, DOWNLOAD_PREFIX));
  try {
    for (const [name, expected] of Object.entries(manifest.files)) {
      const bytes = await download(base + name);
      if (sha256(bytes) !== expected) throw new Error(`payload ${version}: ${name} does not match its hash`);
      fs.mkdirSync(path.dirname(path.join(staging, name)), { recursive: true });
      fs.writeFileSync(path.join(staging, name), bytes);
    }
    fs.writeFileSync(path.join(staging, PAYLOAD_MANIFEST), manifestBytes);
    try {
      fs.renameSync(staging, path.join(versionsDir, version));
    } catch (err) {
      // Another launcher (a second Claude Desktop profile) finished first.
      if (installState(version, versionsDir) !== 'ready') throw err;
    }
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}
