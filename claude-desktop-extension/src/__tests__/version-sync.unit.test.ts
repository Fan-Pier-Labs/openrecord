/**
 * The extension's version lives in manifest.json (what Claude Desktop
 * displays and upgrades on) and must be mirrored in package.json. The code
 * reads EXTENSION_VERSION, which is sourced from the manifest — this test is
 * what keeps the two files from drifting, and what the release workflow's
 * tag-matches-manifest check builds on. Bump both with
 * `bun dev-scripts/bump-mcpb-version.ts <version>`.
 */
import { describe, expect, test } from 'bun:test';
import manifest from '../../manifest.json';
import pkg from '../../package.json';
import { EXTENSION_VERSION } from '../version';

describe('extension version sync', () => {
  test('manifest.json and package.json carry the same version', () => {
    expect(pkg.version).toBe(manifest.version);
  });

  test('EXTENSION_VERSION is sourced from the manifest', () => {
    expect(EXTENSION_VERSION).toBe(manifest.version);
  });

  test('the version is plain semver, matching the mcpb-v<version> tag scheme', () => {
    expect(EXTENSION_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
