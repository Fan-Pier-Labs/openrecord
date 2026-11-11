// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { LAUNCHER_ABI, markBad, payloadOrder, type Payload } from '../payloads';
import { tempDir } from './fixtures';

const BUNDLED: Payload = { version: '2.4.0', dir: '/install/dist', bundled: true };

function downloaded(versionsDir: string, version: string, launcherAbi = LAUNCHER_ABI): Payload {
  const dir = path.join(versionsDir, version);
  fs.mkdirSync(dir, { recursive: true });
  const files = { 'server.cjs': 'a'.repeat(64) };
  fs.writeFileSync(path.join(dir, 'payload.json'), JSON.stringify({ version, launcherAbi, files }));
  return { version, dir, bundled: false };
}

describe('payloadOrder', () => {
  it('puts newer good downloads first, newest first, and always ends with the bundled copy', () => {
    const versionsDir = tempDir();
    downloaded(versionsDir, '2.5.0');
    downloaded(versionsDir, '2.10.0');
    expect(payloadOrder(BUNDLED, versionsDir).map((p) => p.version)).toEqual(['2.10.0', '2.5.0', '2.4.0']);
  });

  it('skips downloads that are older, marked bad, incomplete, or need a newer launcher', () => {
    const versionsDir = tempDir();
    downloaded(versionsDir, '2.3.0');
    markBad(downloaded(versionsDir, '2.5.0'));
    fs.mkdirSync(path.join(versionsDir, '2.6.0'));
    downloaded(versionsDir, '2.7.0', LAUNCHER_ABI + 1);
    fs.mkdirSync(path.join(versionsDir, '.download-abc'));
    expect(payloadOrder(BUNDLED, versionsDir)).toEqual([BUNDLED]);
  });

  it('runs the bundled copy when nothing was ever downloaded', () => {
    expect(payloadOrder(BUNDLED, path.join(tempDir(), 'missing'))).toEqual([BUNDLED]);
  });
});
