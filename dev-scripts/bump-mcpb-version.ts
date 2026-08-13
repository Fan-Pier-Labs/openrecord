/**
 * Bump the Claude Desktop extension's version in the two files that carry it
 * (manifest.json is the source of truth; package.json must mirror it —
 * version-sync.unit.test.ts fails the build if they drift).
 *
 * Usage: bun dev-scripts/bump-mcpb-version.ts 0.2.0
 *
 * Then land the change and push the matching tag to release:
 *   git tag mcpb-v0.2.0 && git push origin mcpb-v0.2.0
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Usage: bun dev-scripts/bump-mcpb-version.ts <major.minor.patch>');
  process.exit(1);
}

const extensionRoot = path.join(import.meta.dir, '..', 'claude-desktop-extension');

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

console.log(`\nNext: commit, merge, then \`git tag mcpb-v${version} && git push origin mcpb-v${version}\``);
