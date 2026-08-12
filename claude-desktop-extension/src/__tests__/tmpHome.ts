/**
 * One throwaway HOME for every test in this package that touches the on-disk
 * credential store.
 *
 * Two things make this shared module necessary rather than a per-file snippet:
 *
 *  1. `credential-store.ts` resolves ~/.openrecord-mcpb once, at module load,
 *     from `os.homedir()` — and Bun's `os.homedir()` does NOT follow $HOME, so
 *     the env var alone leaves you pointed at the developer's real credentials.
 *     `os` itself has to be mocked, before the store is first imported.
 *  2. `cd claude-desktop-extension && bun test` (what the fake-mychart CI job
 *     runs) executes every file in ONE process, without --isolate. The first
 *     file to import the store fixes its paths for the whole run, so per-file
 *     temp directories silently disagree — the second file would assert against
 *     a store rooted in the first file's directory.
 *
 * Importing this module installs the mock exactly once and hands every file the
 * same directory. Import it BEFORE dynamically importing the store; a static
 * import is hoisted, so `import { TMP_HOME } from './tmpHome'` at the top of a
 * test file is evaluated before any `await import('../credential-store')`.
 */
import { mock } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import * as realOs from 'node:os'
import path from 'node:path'

export const TMP_HOME = mkdtempSync(path.join(realOs.tmpdir(), 'openrecord-test-home-'))

const fakeOs = {
  ...realOs,
  homedir: () => TMP_HOME,
  default: { ...realOs, homedir: () => TMP_HOME },
}

mock.module('os', () => fakeOs)
mock.module('node:os', () => fakeOs)

/**
 * Hard stop if the store did not land inside the temp home. Called by every
 * file that touches it — a passing test suite that quietly wrote to a real
 * ~/.openrecord-mcpb would be far worse than a failing one.
 */
export function assertSandboxed(root: string): void {
  if (!root.startsWith(TMP_HOME)) {
    throw new Error(
      `Refusing to run: credential store resolved to ${root}, which is outside the test home ${TMP_HOME}`,
    )
  }
}
