// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * Build `applet/openrecord-calendar-{darwin,windows}-{arm64,x64}[.exe]`: Google
 * Calendar sync (the tray icon, the consent flow and the sync itself) as one
 * binary per OS and architecture, from src/google-calendar/worker.ts with
 * `bun build --compile --aot`. The MCPB installs whichever matches the machine.
 *
 * The Google OAuth client is baked in from
 * ~/.config/fan-pier-labs/google-oauth-client.json (the JSON Google Cloud
 * downloads for a Desktop client) and never committed.
 *
 * The macOS binaries are signed with the Developer ID when this machine has
 * it — the keychain's "Always Allow" for the binary is tied to its signature,
 * and an ad-hoc one changes with every build, so each update would ask again.
 * The Windows ones are built GUI-subsystem (`--windows-hide-console`) so no
 * console window opens at sign-in, and are not signed: codesign can't sign PE
 * files, and nothing here launches them through SmartScreen.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const EXTENSION_DIR = path.resolve(import.meta.dir, '..');
const OUT_DIR = path.join(EXTENSION_DIR, 'applet');
const OAUTH_CLIENT = path.join(os.homedir(), '.config', 'fan-pier-labs', 'google-oauth-client.json');
const TARGETS = [
  { os: 'darwin', arch: 'arm64', binding: 'keyring-darwin-arm64', exe: '' },
  { os: 'darwin', arch: 'x64', binding: 'keyring-darwin-x64', exe: '' },
  { os: 'windows', arch: 'x64', binding: 'keyring-win32-x64-msvc', exe: '.exe' },
  { os: 'windows', arch: 'arm64', binding: 'keyring-win32-arm64-msvc', exe: '.exe' },
] as const;

function run(cmd: string, args: string[]): string {
  try {
    return execFileSync(cmd, args, { cwd: EXTENSION_DIR, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
  } catch {
    // The tool's own stderr is already on screen. The command line is not
    // repeated: `bun build`'s carries the OAuth client secret in its --defines.
    fail(`${cmd} ${args[0] ?? ''} failed (see above).`);
  }
}

function fail(message: string): never {
  console.error(`\n  ✗ build-calendar-applet: ${message}\n`);
  process.exit(1);
}

if (process.platform !== 'darwin') {
  console.error('build-calendar-applet: macOS only — skipping. This .mcpb will not offer Google Calendar sync.');
  process.exit(0);
}

let client: { client_id?: string; client_secret?: string } | undefined;
try {
  client = (JSON.parse(fs.readFileSync(OAUTH_CLIENT, 'utf-8')) as { installed?: typeof client }).installed;
} catch { /* reported below */ }
if (!client?.client_id || !client.client_secret) {
  fail(`No Desktop OAuth client at ${OAUTH_CLIENT}. Download it from Google Cloud → Credentials and save it there.`);
}

const identity = /"(Developer ID Application: [^"]+)"/.exec(run('security', ['find-identity', '-v', '-p', 'codesigning']))?.[1] ?? '-';

fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

for (const { os: targetOs, arch, binding, exe } of TARGETS) {
  // secret-store.ts falls back to a plaintext file when the keyring binding
  // won't load, by design — so a binary built without this target's binding
  // would run, never see the MCPB's keystore items, and fail every login.
  const bindingDir = path.join(EXTENSION_DIR, 'node_modules', '@napi-rs', binding);
  if (!fs.existsSync(bindingDir)) fail(`${bindingDir} is missing. Run \`bun install --os='*' --cpu='*'\` first (bun run pack does).`);

  const out = path.join(OUT_DIR, `openrecord-calendar-${targetOs}-${arch}${exe}`);
  const windowsFlags = targetOs === 'windows'
    // The only --windows-* flag bun accepts when cross-compiling; the file-metadata ones need a Windows host.
    ? ['--windows-hide-console']
    : [];
  run('bun', [
    'build', '--compile', '--aot', '--bytecode', '--minify', `--target=bun-${targetOs}-${arch}`, ...windowsFlags,
    `--define`, `__GOOGLE_OAUTH_CLIENT_ID__=${JSON.stringify(client.client_id)}`,
    `--define`, `__GOOGLE_OAUTH_CLIENT_SECRET__=${JSON.stringify(client.client_secret)}`,
    'src/google-calendar/worker.ts', '--outfile', out,
  ]);
  // The package is keyring-<target>; the binary inside it is keyring.<target>.node.
  const nodeFile = `${binding.replace('keyring-', 'keyring.')}.node`;
  if (!fs.readFileSync(out).includes(nodeFile)) fail(`${path.basename(out)} was built without ${nodeFile}.`);
  if (targetOs === 'darwin') {
    run('codesign', ['--force', '--sign', identity, '--identifier', 'com.fanpierlabs.openrecord.calendar', out]);
    run('codesign', ['--verify', '--strict', out]);
  }
  const signed = targetOs !== 'darwin' ? 'unsigned' : identity === '-' ? 'ad-hoc signed' : identity;
  console.log(`Built ${path.relative(EXTENSION_DIR, out)} (${signed})`);
}
