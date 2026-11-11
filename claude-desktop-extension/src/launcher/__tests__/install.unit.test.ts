// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { afterEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { setTestTransport } from '../../../../scrapers/http';
import { installPayload } from '../install';
import { LAUNCHER_ABI, installState, parsePayloadManifest } from '../payloads';
import { BASE_URL, payload, serve, tempDir } from './fixtures';

afterEach(() => setTestTransport(null));

function install(versionsDir: string) {
  return installPayload('2.5.0', { versionsDir, baseUrl: BASE_URL });
}

/** Nothing but finished version folders: a failed install leaves no staging folder behind. */
function entries(dir: string): string[] {
  return fs.existsSync(dir) ? fs.readdirSync(dir) : [];
}

describe('installPayload', () => {
  it('installs a payload into its own folder', async () => {
    const versionsDir = tempDir();
    serve(payload('2.5.0', '// server'));
    await install(versionsDir);
    expect(installState('2.5.0', versionsDir)).toBe('ready');
    expect(fs.readFileSync(path.join(versionsDir, '2.5.0', 'server.cjs'), 'utf8')).toBe('// server');
    expect(entries(versionsDir)).toEqual(['2.5.0']);
  });

  it('refuses a file that does not match its hash', async () => {
    const versionsDir = tempDir();
    const site = payload('2.5.0');
    site.set(`${BASE_URL}/2.5.0/server.cjs`, Buffer.from('// tampered'));
    serve(site);
    await expect(install(versionsDir)).rejects.toThrow('server.cjs does not match its hash');
    expect(entries(versionsDir)).toEqual([]);
  });

  it('refuses a payload that needs a newer launcher', async () => {
    const versionsDir = tempDir();
    const site = payload('2.5.0');
    const manifest = JSON.parse(site.get(`${BASE_URL}/2.5.0/payload.json`)!.toString()) as { launcherAbi: number };
    manifest.launcherAbi = LAUNCHER_ABI + 1;
    site.set(`${BASE_URL}/2.5.0/payload.json`, Buffer.from(JSON.stringify(manifest)));
    serve(site);
    await expect(install(versionsDir)).rejects.toThrow(`needs launcher ABI ${LAUNCHER_ABI + 1}`);
  });

  it('fails when the payload is not on the site', async () => {
    const versionsDir = tempDir();
    serve(new Map());
    await expect(install(versionsDir)).rejects.toThrow('HTTP 404');
  });
});

describe('parsePayloadManifest', () => {
  const sha = 'a'.repeat(64);
  it('rejects file names that could escape the version folder', () => {
    for (const name of ['../server.cjs', '..', '.hidden', 'a/b', 'payload.json']) {
      expect(parsePayloadManifest(JSON.stringify({ version: '1.0.0', launcherAbi: 1, files: { 'server.cjs': sha, [name]: sha } }))).toBeNull();
    }
  });

  it('requires server.cjs', () => {
    expect(parsePayloadManifest(JSON.stringify({ version: '1.0.0', launcherAbi: 1, files: { 'x.wasm': sha } }))).toBeNull();
  });
});
