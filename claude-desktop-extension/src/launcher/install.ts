// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * Downloads one release's payload into its own versions folder.
 *
 * The payload is code that will run with this user's MyChart passwords in
 * reach, so nothing is trusted because of where it came from: `payload.json`
 * must carry an ed25519 signature from the key pinned below, and every file it
 * lists must match its sha256. Without that, whoever got write access to the
 * site's bucket would be running code on every install by the next morning.
 *
 * Files land in a temporary folder that is renamed into place only once all of
 * them check out, so a folder named for a version is always complete.
 */

import { createHash, verify } from 'crypto';
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

/** Its private half signs releases in `deploy.sh` (`scripts/build-payload.ts`). */
const PAYLOAD_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAb8VrPXwfBVxaxnBrVEfTs41CST9Lk7wsxoNsH7SvqdM=
-----END PUBLIC KEY-----`;

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
  { versionsDir = VERSIONS_DIR, baseUrl = PAYLOAD_BASE_URL, publicKey = PAYLOAD_PUBLIC_KEY } = {},
): Promise<void> {
  const base = `${baseUrl}/${version}/`;
  const manifestBytes = await download(base + PAYLOAD_MANIFEST);
  const signature = Buffer.from((await download(`${base}${PAYLOAD_MANIFEST}.sig`)).toString('utf8').trim(), 'base64');
  if (!verify(null, manifestBytes, publicKey, signature)) {
    throw new Error(`payload ${version}: signature does not verify`);
  }
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
