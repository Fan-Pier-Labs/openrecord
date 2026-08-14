/**
 * Fetch every platform's `@napi-rs/keyring` binary before packing the .mcpb.
 *
 * `bun install` / `npm install` only resolve the optional binary package that
 * matches the *building* machine, so a .mcpb packed on an Apple Silicon Mac
 * ships darwin-arm64 and nothing else. That failure is silent and nasty: on
 * every other platform the native module fails to load, `secret-store.ts`
 * degrades to its file fallback exactly as designed, and Windows users quietly
 * get plaintext passkeys on disk while the build looks fine.
 *
 * So the binaries are force-installed here (npm refuses a foreign os/cpu
 * without `--force`), pinned to the exact version of the JS loader that will
 * read them — a loader/binary version skew is a runtime failure, not a build
 * one — and the script exits non-zero if any of them is missing afterwards.
 *
 * Linux is deliberately not in the list: Claude Desktop does not ship a Linux
 * build, and the slice is 3 MB. If that changes, add it here.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXTENSION_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);

/** Platform slices Claude Desktop can actually run. */
const SLICES = [
  { pkg: 'keyring-darwin-arm64', binary: 'keyring.darwin-arm64.node' },
  { pkg: 'keyring-darwin-x64', binary: 'keyring.darwin-x64.node' },
  { pkg: 'keyring-win32-x64-msvc', binary: 'keyring.win32-x64-msvc.node' },
  { pkg: 'keyring-win32-arm64-msvc', binary: 'keyring.win32-arm64-msvc.node' },
];

const { version } = require('@napi-rs/keyring/package.json');
console.log(`@napi-rs/keyring ${version} — fetching ${SLICES.length} platform binaries`);

execFileSync(
  'npm',
  [
    'install',
    '--no-save',
    // npm refuses to install a package whose os/cpu does not match this host.
    '--force',
    ...SLICES.map(s => `@napi-rs/${s.pkg}@${version}`),
  ],
  { cwd: EXTENSION_DIR, stdio: 'inherit' },
);

const missing = SLICES.filter(
  s => !fs.existsSync(path.join(EXTENSION_DIR, 'node_modules', '@napi-rs', s.pkg, s.binary)),
);

for (const s of SLICES) {
  const file = path.join(EXTENSION_DIR, 'node_modules', '@napi-rs', s.pkg, s.binary);
  const ok = fs.existsSync(file);
  const size = ok ? `${(fs.statSync(file).size / 1024 / 1024).toFixed(1)} MB` : 'MISSING';
  console.log(`  ${ok ? '✓' : '✗'} ${s.pkg.padEnd(26)} ${size}`);
}

if (missing.length > 0) {
  console.error(
    `\nRefusing to pack: ${missing.length} platform binary/binaries missing. ` +
      'Packing anyway would ship an extension that silently stores passkeys in ' +
      'plaintext on those platforms.',
  );
  process.exit(1);
}
