// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * Builds the signed payload installed launchers download (see
 * src/launcher/install.ts): the server bundle and the .wasm beside it, a
 * `payload.json` naming each file's sha256, and `payload.json.sig`, an ed25519
 * signature over that file's exact bytes.
 *
 *   bun scripts/build-payload.ts <private-key.pem> <out-dir>
 *
 * `deploy.sh` runs it after `bun run pack` and uploads <out-dir> to
 * mcpb-payload/<version>/ before publishing the new version number.
 */

import { createHash, sign } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { version } from '../manifest.json';
import { LAUNCHER_ABI, PAYLOAD_MANIFEST, type PayloadManifest } from '../src/launcher/payloads';

/** What a payload carries: everything the server reads from its own folder. */
export const PAYLOAD_FILES = ['server.cjs', 'node-sqlite3-wasm.wasm'];

export function buildPayload(distDir: string, privateKeyPem: string, outDir: string, payloadVersion: string = version): void {
  fs.mkdirSync(outDir, { recursive: true });
  const files: Record<string, string> = {};
  for (const name of PAYLOAD_FILES) {
    const bytes = fs.readFileSync(path.join(distDir, name));
    files[name] = createHash('sha256').update(bytes).digest('hex');
    fs.writeFileSync(path.join(outDir, name), bytes);
  }
  const manifest: PayloadManifest = { version: payloadVersion, launcherAbi: LAUNCHER_ABI, files };
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(outDir, PAYLOAD_MANIFEST), manifestBytes);
  fs.writeFileSync(path.join(outDir, `${PAYLOAD_MANIFEST}.sig`), sign(null, manifestBytes, privateKeyPem).toString('base64'));
}

if (import.meta.main) {
  const [keyPath, outDir] = process.argv.slice(2);
  if (!keyPath || !outDir) throw new Error('usage: bun scripts/build-payload.ts <private-key.pem> <out-dir>');
  buildPayload(path.join(import.meta.dir, '..', 'dist'), fs.readFileSync(keyPath, 'utf8'), outDir);
}
