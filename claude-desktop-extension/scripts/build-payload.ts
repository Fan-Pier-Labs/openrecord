// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * Builds the payload installed launchers download (see
 * src/launcher/install.ts): the server bundle and the .wasm beside it, plus a
 * `payload.json` naming each file's sha256.
 *
 *   bun scripts/build-payload.ts <out-dir>
 *
 * `deploy.sh` runs it after `bun run pack` and uploads <out-dir> to
 * mcpb-payload/<version>/ before publishing the new version number.
 */

import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { version } from '../manifest.json';
import { LAUNCHER_ABI, PAYLOAD_MANIFEST, type PayloadManifest } from '../src/launcher/payloads';

/** What a payload carries: everything the server reads from its own folder. */
const PAYLOAD_FILES = ['server.cjs', 'node-sqlite3-wasm.wasm'];

export function buildPayload(distDir: string, outDir: string, payloadVersion: string = version): void {
  fs.mkdirSync(outDir, { recursive: true });
  const files: Record<string, string> = {};
  for (const name of PAYLOAD_FILES) {
    const bytes = fs.readFileSync(path.join(distDir, name));
    files[name] = createHash('sha256').update(bytes).digest('hex');
    fs.writeFileSync(path.join(outDir, name), bytes);
  }
  const manifest: PayloadManifest = { version: payloadVersion, launcherAbi: LAUNCHER_ABI, files };
  fs.writeFileSync(path.join(outDir, PAYLOAD_MANIFEST), JSON.stringify(manifest, null, 2));
}

if (import.meta.main) {
  const outDir = process.argv[2];
  if (!outDir) throw new Error('usage: bun scripts/build-payload.ts <out-dir>');
  buildPayload(path.join(import.meta.dir, '..', 'dist'), outDir);
}
