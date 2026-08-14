/**
 * Refuse to pack a .mcpb that is missing a platform's keyring binary.
 *
 * The four slices are declared in package.json's optionalDependencies, but a
 * plain `bun install` only resolves the one matching the building machine —
 * that is what optional os/cpu deps are for. `bun run pack` therefore installs
 * with `--os='*' --cpu='*'` first, and this checks the result.
 *
 * Worth failing the build over, because the runtime failure is invisible: a
 * missing binary means `@napi-rs/keyring` does not load, `secret-store.ts`
 * degrades to its file fallback exactly as designed, and users on that platform
 * quietly get plaintext passkeys on disk while everything looks fine.
 */
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXTENSION_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const { optionalDependencies } = require(path.join(EXTENSION_DIR, 'package.json'));

const missing = [];
for (const pkg of Object.keys(optionalDependencies)) {
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
