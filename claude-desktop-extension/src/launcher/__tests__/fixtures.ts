// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { setTestTransport } from '../../../../scrapers/http';
import { buildPayload } from '../../../scripts/build-payload';

export const BASE_URL = 'https://example.test/mcpb-payload';
export const MANIFEST_URL = 'https://example.test/mcpb_version.json';

export function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'openrecord-launcher-'));
}

/** A payload for `version`, as `deploy.sh` would upload it: published path → bytes. */
export function payload(version: string, serverSource = 'process.exit(0)'): Map<string, Buffer> {
  const ext = tempDir();
  fs.mkdirSync(path.join(ext, 'dist'));
  fs.mkdirSync(path.join(ext, 'applet'));
  fs.writeFileSync(path.join(ext, 'dist', 'server.cjs'), serverSource);
  fs.writeFileSync(path.join(ext, 'dist', 'node-sqlite3-wasm.wasm'), Buffer.from([0, 97, 115, 109]));
  fs.writeFileSync(path.join(ext, 'applet', 'calendar-binaries.json'), '{}');
  const out = tempDir();
  buildPayload(ext, out, version);
  const site = new Map<string, Buffer>();
  for (const name of fs.readdirSync(out, { recursive: true, encoding: 'utf8' })) {
    if (fs.statSync(path.join(out, name)).isFile()) site.set(`${BASE_URL}/${version}/${name}`, fs.readFileSync(path.join(out, name)));
  }
  return site;
}

export function versionManifest(mcpb: string): Buffer {
  const urls = { scrapers: 'u', cli: 'u', mcpb: 'https://example.test/', app: 'u' };
  return Buffer.from(JSON.stringify({ versions: { scrapers: '1.0.0', cli: '1.0.0', mcpb, app: '1.0.0' }, updateUrls: urls }));
}

/** Serve `site` through scraperFetch; anything else is a 404. */
export function serve(site: Map<string, Buffer>): void {
  setTestTransport((url) => {
    const body = site.get(url);
    return Promise.resolve(body ? new Response(new Uint8Array(body)) : new Response('Not Found', { status: 404 }));
  });
}
