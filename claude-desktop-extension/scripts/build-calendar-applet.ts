// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * Build `applet/openrecord-calendar-darwin-{arm64,x64}`: Google Calendar sync
 * (the menu-bar item, the consent flow and the sync itself) as one binary per
 * Mac architecture, from src/google-calendar/worker.ts with
 * `bun build --compile --aot`.
 *
 * The binaries (~100 MB each) do not ship in the .mcpb. deploy.sh uploads them
 * beside it under content-addressed names, and the MCPB downloads the one its
 * Mac needs when the user turns sync on. What ships is
 * applet/calendar-binaries.json, each binary's SHA-256, which is both the
 * download's name and the check the MCPB runs before installing it.
 *
 * The Google OAuth client is baked in from
 * ~/.config/fan-pier-labs/google-oauth-client.json (the JSON Google Cloud
 * downloads for a Desktop client) and never committed.
 *
 * Signed with the Developer ID when this machine has it — the keychain's
 * "Always Allow" for the binary is tied to its signature, and an ad-hoc one
 * changes with every build, so each update would ask again.
 */

import { execFileSync } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const EXTENSION_DIR = path.resolve(import.meta.dir, '..');
const OUT_DIR = path.join(EXTENSION_DIR, 'applet');
const OAUTH_CLIENT = path.join(os.homedir(), '.config', 'fan-pier-labs', 'google-oauth-client.json');
const ARCHES = ['arm64', 'x64'] as const;

const run = (cmd: string, args: string[]) =>
  execFileSync(cmd, args, { cwd: EXTENSION_DIR, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();

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

const hashes: Record<string, string> = {};
for (const arch of ARCHES) {
  // secret-store.ts falls back to a plaintext file when the keyring binding
  // won't load, by design — so a binary built without this arch's binding
  // would run, never see the MCPB's keychain items, and fail every login.
  const binding = path.join(EXTENSION_DIR, 'node_modules', '@napi-rs', `keyring-darwin-${arch}`);
  if (!fs.existsSync(binding)) fail(`${binding} is missing. Run \`bun install --os='*' --cpu='*'\` first (bun run pack does).`);

  const out = path.join(OUT_DIR, `openrecord-calendar-darwin-${arch}`);
  run('bun', [
    'build', '--compile', '--aot', '--bytecode', '--minify', `--target=bun-darwin-${arch}`,
    `--define`, `__GOOGLE_OAUTH_CLIENT_ID__=${JSON.stringify(client.client_id)}`,
    `--define`, `__GOOGLE_OAUTH_CLIENT_SECRET__=${JSON.stringify(client.client_secret)}`,
    'src/google-calendar/worker.ts', '--outfile', out,
  ]);
  run('codesign', ['--force', '--sign', identity, '--identifier', 'com.fanpierlabs.openrecord.calendar', out]);
  run('codesign', ['--verify', '--strict', out]);
  hashes[arch] = crypto.createHash('sha256').update(fs.readFileSync(out)).digest('hex');
  console.log(`Built ${path.relative(EXTENSION_DIR, out)} (${identity === '-' ? 'ad-hoc signed' : identity})`);
}
fs.writeFileSync(path.join(OUT_DIR, 'calendar-binaries.json'), JSON.stringify(hashes, null, 2) + '\n');
