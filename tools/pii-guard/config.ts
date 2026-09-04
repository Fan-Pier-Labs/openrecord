/**
 * Assembling the scanner's options from what's on disk.
 *
 * Three inputs, three different lifetimes:
 *
 *   `.git/pii-denylist.txt`        your real values. Never committed. Private.
 *   `tools/pii-guard/allowlist.txt` values that are known fiction. Committed,
 *                                   because everyone's checkout needs them.
 *   `.pii-guard-allow`             paths not worth scanning. Committed.
 *
 * Only the first is secret, and it is the only one outside the working tree.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadDenylist } from './denylist';
import type { ScanOptions } from './types';

/**
 * The guard does not scan itself.
 *
 * It cannot: a tool that documents what a date of birth, a masked address and a
 * partial phone number look like has to contain those things — in its rules, in
 * its examples, and above all in its tests, which assert that a realistic value
 * is caught. Scanned like any other directory, it blocks every commit that
 * touches it, including the one that adds it.
 *
 * The cost is that this directory is a blind spot, and it is worth stating
 * plainly: real patient data pasted into `tools/pii-guard/` would not be
 * caught. Nothing here has any reason to hold a chart, which is what makes the
 * trade acceptable — but it is a trade, not a free win.
 */
const BUILTIN_SKIP_PATHS = ['tools/pii-guard/**'];

export interface GuardConfig extends ScanOptions {
  /** Where the denylist came from, or null if there isn't one yet. */
  denylistPath: string | null;
  /** Parse problems in the denylist — printed, never fatal. */
  problems: string[];
}

function readLines(path: string): string[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

export function loadConfig(repoRoot: string, gitCommonDir: string | null): GuardConfig {
  const { needles, path, problems } = loadDenylist(gitCommonDir);
  const allowlist = new Set(
    readLines(join(repoRoot, 'tools', 'pii-guard', 'allowlist.txt')).map((value) => value.toLowerCase()),
  );
  const skipPaths = [...BUILTIN_SKIP_PATHS, ...readLines(join(repoRoot, '.pii-guard-allow'))];
  return { needles, allowlist, skipPaths, denylistPath: path, problems };
}
