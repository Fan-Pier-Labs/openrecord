// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { afterEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { setTestTransport } from '../../../../scrapers/http';
import { installState, markBad } from '../payloads';
import { checkForUpdate, reportStartupFailure, updateNotice } from '../updater';
import { BASE_URL, MANIFEST_URL, keyPair, serve, signedPayload, tempDir, versionManifest } from './fixtures';

const { publicKey, privateKey } = keyPair();

function check(versionsDir: string, running = '2.4.0') {
  return checkForUpdate(running, { versionsDir, baseUrl: BASE_URL, publicKey, manifestUrl: MANIFEST_URL });
}

afterEach(async () => {
  // Leave the module with no notice for whichever test runs next.
  serve(new Map([[MANIFEST_URL, versionManifest('2.4.0')]]));
  await check(tempDir());
  setTestTransport(null);
});

describe('checkForUpdate', () => {
  it('downloads a newer release silently and prunes what it replaces', async () => {
    const versionsDir = tempDir();
    fs.mkdirSync(path.join(versionsDir, '2.3.0'));
    const site = signedPayload('2.5.0', privateKey);
    site.set(MANIFEST_URL, versionManifest('2.5.0'));
    serve(site);
    await check(versionsDir);
    expect(installState('2.5.0', versionsDir)).toBe('ready');
    expect(fs.readdirSync(versionsDir)).toEqual(['2.5.0']);
    expect(updateNotice()).toBeNull();
  });

  it('tells the user to reinstall from the site when the update cannot be installed', async () => {
    serve(new Map([[MANIFEST_URL, versionManifest('2.5.0')]]));
    await check(tempDir());
    expect(updateNotice()).toContain('could not update itself to v2.5.0');
    expect(updateNotice()).toContain('reinstall');
    expect(updateNotice()).toContain('https://example.test/');
  });

  it('does not download a release again after it failed to start', async () => {
    const versionsDir = tempDir();
    const site = signedPayload('2.5.0', privateKey);
    site.set(MANIFEST_URL, versionManifest('2.5.0'));
    serve(site);
    await check(versionsDir);
    markBad({ version: '2.5.0', dir: path.join(versionsDir, '2.5.0'), bundled: false });
    reportStartupFailure('2.5.0');
    await check(versionsDir);
    expect(installState('2.5.0', versionsDir)).toBe('bad');
    expect(updateNotice()).toContain('failed to start');
  });

  it('keeps the last answer when the site cannot be reached, and clears it once up to date', async () => {
    serve(new Map([[MANIFEST_URL, versionManifest('2.5.0')]]));
    await check(tempDir());
    serve(new Map());
    await check(tempDir());
    expect(updateNotice()).not.toBeNull();
    serve(new Map([[MANIFEST_URL, versionManifest('2.5.0')]]));
    await check(tempDir(), '2.5.0');
    expect(updateNotice()).toBeNull();
  });
});
