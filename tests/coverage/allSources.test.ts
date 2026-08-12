/**
 * Makes every file in the shared scraper core count toward the coverage gate.
 *
 * `bun test --coverage` only reports files some test actually imported. A module
 * nobody tests does not show up as 0% — it does not show up at all, so adding
 * untested code *raises* the reported percentage. This test imports the whole of
 * `scrapers/` and `shared/` so untested files land in the report at 0% and the
 * number in `bunfig.coverage.toml` means what it says.
 *
 * It is a real test as well as a coverage device: a file that throws on import
 * fails the run instead of quietly dropping out of the report.
 *
 * Only the shared core is swept. The clients cannot be force-imported: the CLI
 * entry point starts its interactive prompt on import, the Claude Desktop
 * extension needs its own `bun install`, and `expo-app/src/lib` is React
 * Native-only. Those are still covered by whatever their own tests import.
 */
import { expect, test } from 'bun:test';
import { Glob } from 'bun';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dir, '../..');

const PATTERNS = ['scrapers/**/*.ts', 'shared/**/*.ts'];

/**
 * One-off exploration scripts that run their `main()` at import time — they have
 * no `import.meta.main` guard, so importing one would log in to MyChart and
 * `process.exit()` out of the test run. They are dev tooling, not product code.
 */
const SELF_EXECUTING_SCRIPTS = ['scrapers/list-all-mycharts/fetch-mychart-instances.ts'];

function coreSourceFiles(): string[] {
  return PATTERNS.flatMap((pattern) => [...new Glob(pattern).scanSync(ROOT)])
    .map((file) => file.split(path.sep).join('/'))
    .filter(
      (file) =>
        !file.includes('__tests__/') &&
        !file.endsWith('.test.ts') &&
        !file.endsWith('.d.ts') &&
        !SELF_EXECUTING_SCRIPTS.includes(file),
    )
    .sort();
}

test('every file in the scraper core imports cleanly', async () => {
  const files = coreSourceFiles();

  // Guards against the glob silently matching nothing, which would make this
  // test pass while contributing no coverage at all.
  expect(files.length).toBeGreaterThan(50);

  const failures: string[] = [];
  for (const file of files) {
    try {
      await import(path.join(ROOT, file));
    } catch (err) {
      failures.push(`${file}: ${(err as Error).message.split('\n')[0]}`);
    }
  }

  expect(failures).toEqual([]);
});

test('every excluded script still earns its exclusion', async () => {
  // Keeps the list from going stale: a script that gains an `import.meta.main`
  // guard is safe to import, so it should start counting toward the gate rather
  // than sitting here as a permanent coverage blind spot.
  for (const script of SELF_EXECUTING_SCRIPTS) {
    const file = Bun.file(path.join(ROOT, script));
    expect(await file.exists()).toBe(true);
    expect(await file.text()).not.toContain('import.meta.main');
  }
});
