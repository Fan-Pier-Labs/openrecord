/**
 * Refuse to pack a .mcpb that is missing a platform's keyring binary.
 *
 * `@napi-rs/keyring` is a plain `dependencies` entry — it is required, the
 * extension does not work without it. What it does NOT do is drag every
 * platform's binary onto every machine: those are twelve separate packages that
 * it lists in its own `optionalDependencies`, gated on `os`/`cpu`, which is how
 * every prebuilt-binary package on npm ships (esbuild has 26 of them, rollup
 * 27). A normal install resolves exactly the one slice matching the machine.
 *
 * Packing needs four of them at once, so `bun run pack` installs with
 * `--os='*' --cpu='*'` first and this checks the result. Worth failing the
 * build over, because the runtime failure is invisible: a missing binary means
 * the module does not load, `secret-store.ts` degrades to its file fallback
 * exactly as designed, and users on that platform quietly get plaintext
 * credentials on disk while everything looks fine.
 *
 * The platform list is read out of .mcpbignore rather than duplicated here —
 * that file is where the "which platforms do we ship" decision already lives,
 * and a second copy would be one more thing to forget.
 *
 * manifest.json's `compatibility.platforms` is the one place that list HAS to
 * be restated, because Claude Desktop reads the manifest and never sees
 * .mcpbignore. So the two are asserted equal here. Drift in either direction is
 * a real bug: a manifest platform with no shipped binary installs and silently
 * falls back to plaintext credentials, and a shipped binary with no manifest
 * platform is dead weight users on that OS are refused the extension over.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXTENSION_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** The `!node_modules/@napi-rs/keyring-<platform>` un-ignore lines. */
const slices = fs
  .readFileSync(path.join(EXTENSION_DIR, '.mcpbignore'), 'utf-8')
  .split('\n')
  .map(line => /^!node_modules\/(@napi-rs\/keyring-[a-z0-9-]+)$/.exec(line.trim())?.[1])
  .filter(Boolean);

if (slices.length === 0) {
  console.error('Refusing to pack: .mcpbignore un-ignores no platform binaries at all.');
  process.exit(1);
}

const missing = [];
for (const pkg of slices) {
  const dir = path.join(EXTENSION_DIR, 'node_modules', pkg);
  const binary = fs.existsSync(dir) && fs.readdirSync(dir).find(f => f.endsWith('.node'));
  const size = binary ? fs.statSync(path.join(dir, binary)).size : 0;
  console.log(
    `  ${binary ? '✓' : '✗'} ${pkg.padEnd(34)} ` +
      (binary ? `${(size / 1024 / 1024).toFixed(1)} MB` : 'MISSING'),
  );
  if (!binary) missing.push(pkg);
}

if (missing.length > 0) {
  console.error(
    `\nRefusing to pack: ${missing.length} platform binary/binaries missing.\n` +
      "Run: bun install --os='*' --cpu='*'",
  );
  process.exit(1);
}

// ── manifest.json must advertise exactly the platforms we ship binaries for ──

/** `@napi-rs/keyring-win32-arm64-msvc` → `win32`; the OS is the first segment. */
const shipped = [
  ...new Set(slices.map(pkg => pkg.replace('@napi-rs/keyring-', '').split('-')[0])),
].sort();

const manifest = JSON.parse(fs.readFileSync(path.join(EXTENSION_DIR, 'manifest.json'), 'utf-8'));
const declared = [...(manifest.compatibility?.platforms ?? [])].sort();

if (declared.join() !== shipped.join()) {
  console.error(
    `\nRefusing to pack: manifest.json compatibility.platforms disagrees with .mcpbignore.\n` +
      `  .mcpbignore ships binaries for: ${shipped.join(', ') || '(none)'}\n` +
      `  manifest.json declares:         ${declared.join(', ') || '(unset)'}`,
  );
  process.exit(1);
}

console.log(`  ✓ manifest.json compatibility.platforms matches: ${declared.join(', ')}`);
