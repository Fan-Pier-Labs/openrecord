// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * Build `applet/OpenRecord Calendar.app`, the menu-bar app the MCPB installs
 * for Google Calendar sync:
 *
 *   Contents/MacOS/openrecord-calendar-sync  src/google-calendar/worker.ts, `bun build --compile --bytecode`
 *   Contents/MacOS/OpenRecordCalendar        calendar-applet/ (Swift), the status item that runs it
 *
 * Apple silicon only: one bun runtime is ~90 MB, and a universal build would
 * ship two. Signed with the Developer ID when this machine has it — the
 * keychain's "Always Allow" for the worker is tied to its signature, and an
 * ad-hoc one changes with every build, so each update would ask again.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import { version } from '../manifest.json';

const EXTENSION_DIR = path.resolve(import.meta.dir, '..');
const PACKAGE_DIR = path.join(EXTENSION_DIR, 'calendar-applet');
const APP = path.join(EXTENSION_DIR, 'applet', 'OpenRecord Calendar.app');
const MACOS = path.join(APP, 'Contents', 'MacOS');

const run = (cmd: string, args: string[], cwd = EXTENSION_DIR) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();

if (process.platform !== 'darwin') {
  console.error('build-calendar-applet: macOS only — skipping. This .mcpb will not offer Google Calendar sync.');
  process.exit(0);
}

fs.rmSync(APP, { recursive: true, force: true });
fs.mkdirSync(MACOS, { recursive: true });

run('bun', [
  'build', '--compile', '--bytecode', '--minify', '--target=bun-darwin-arm64',
  'src/google-calendar/worker.ts', '--outfile', path.join(MACOS, 'openrecord-calendar-sync'),
]);

run('swift', ['build', '-c', 'release', '--arch', 'arm64', '--package-path', PACKAGE_DIR]);
const binPath = run('swift', ['build', '-c', 'release', '--arch', 'arm64', '--package-path', PACKAGE_DIR, '--show-bin-path']);
fs.copyFileSync(path.join(binPath, 'OpenRecordCalendar'), path.join(MACOS, 'OpenRecordCalendar'));
fs.chmodSync(path.join(MACOS, 'OpenRecordCalendar'), 0o755);

fs.writeFileSync(
  path.join(APP, 'Contents', 'Info.plist'),
  fs.readFileSync(path.join(PACKAGE_DIR, 'Info.plist'), 'utf-8').replaceAll('__VERSION__', version),
);

const identity = /"(Developer ID Application: [^"]+)"/.exec(run('security', ['find-identity', '-v', '-p', 'codesigning']))?.[1] ?? '-';
// Worker first: signing the bundle seals the signatures of what is inside it.
run('codesign', ['--force', '--sign', identity, path.join(MACOS, 'openrecord-calendar-sync')]);
run('codesign', ['--force', '--sign', identity, APP]);
run('codesign', ['--verify', '--strict', APP]);

console.log(`Built ${path.relative(EXTENSION_DIR, APP)} (${identity === '-' ? 'ad-hoc signed' : identity})`);
