/**
 * Bump the Claude Desktop extension's version in the two files that carry it
 * (manifest.json is the source of truth; package.json must mirror it —
 * version-sync.unit.test.ts fails the build if they drift).
 *
 * Usage: bun dev-scripts/bump-mcpb-version.ts [patch|minor|major|<x.y.z>]
 *        (default: patch)
 *
 * Normally run for you by `claude-desktop-extension/release.sh`, which also
 * builds the bundle and publishes it to the splash site's S3 bucket.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const extensionRoot = path.join(import.meta.dir, '..', 'claude-desktop-extension');
const manifestPath = path.join(extensionRoot, 'manifest.json');

const current = (JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as { version: string }).version;

function nextVersion(arg: string): string {
  if (/^\d+\.\d+\.\d+$/.test(arg)) return arg;
  const [major, minor, patch] = current.split('.').map(Number);
  switch (arg) {
    case 'major': return `${major + 1}.0.0`;
    case 'minor': return `${major}.${minor + 1}.0`;
    case 'patch': return `${major}.${minor}.${patch + 1}`;
    default:
      console.error('Usage: bun dev-scripts/bump-mcpb-version.ts [patch|minor|major|<x.y.z>]');
      process.exit(1);
  }
}

const version = nextVersion(process.argv[2] ?? 'patch');

for (const file of ['manifest.json', 'package.json']) {
  const filePath = path.join(extensionRoot, file);
  const text = fs.readFileSync(filePath, 'utf-8');
  const previous = (JSON.parse(text) as { version: string }).version;
  // Targeted replace instead of re-serializing, so the file keeps its
  // formatting. `"version"` never matches `"manifest_version"` — the match
  // requires the quote immediately before the key.
  const updated = text.replace(/"version":\s*"[^"]*"/, `"version": "${version}"`);
  if (updated === text && previous !== version) {
    console.error(`${file}: found no version field to replace`);
    process.exit(1);
  }
  fs.writeFileSync(filePath, updated);
  console.log(`${file}: ${previous} -> ${version}`);
}
