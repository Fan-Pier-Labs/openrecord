/**
 * Every test file in the repo must declare which kind of test it is, in its
 * filename.
 *
 * The `test` / `test:integration` / `test:mychart` scripts select by suffix and
 * nothing else — no script names a directory of tests, let alone an individual
 * file. That is what stops the root `test` script from drifting back into the
 * hand-maintained list of per-package globs it used to be, and it is what keeps
 * the real-MyChart suite out of CI by construction rather than by remembering
 * not to glob it.
 *
 * The cost of selecting by suffix is that a test file which forgets one is
 * simply never run, and a suite that never runs looks exactly like a suite that
 * passes. This test is the backstop for that: an unsuffixed `*.test.ts` fails
 * here instead of quietly disappearing.
 *
 *   *.unit.test.ts        no network, no server, no credentials. Runs in CI.
 *   *.integration.test.ts needs fake-mychart (or Docker Compose). Runs in CI.
 *   *.mychart.test.ts     needs a REAL MyChart account. NEVER runs in CI.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");

const KINDS = [".unit.test.ts", ".integration.test.ts", ".mychart.test.ts"];

/**
 * Directories bun's own test scanner skips or that hold no source of ours.
 * `dist`/`.next` are build output; `coverage` is this gate's own report.
 */
const SKIP_DIRS = new Set(["node_modules", "dist", ".next", "coverage", ".git"]);

/**
 * The one deliberately-unrun test file.
 *
 * `generate_clo.test.ts` has two failing assertions — the CLO encoder is off by
 * one when it round-trips curved and diagonal content. It has never run in CI.
 * Under the old per-directory globs it was excluded by naming its two healthy
 * neighbours individually; under suffix selection it is excluded by having no
 * kind. Fixing the encoder and renaming this to `generate_clo.unit.test.ts` is
 * tracked separately — do not silence it by deleting the assertions.
 */
const UNRUN = ["scrapers/myChart/clo-image-parser/generate_clo.test.ts"];

function testFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...testFiles(full));
    else if (/\.test\.tsx?$/.test(entry.name)) out.push(relative(REPO_ROOT, full));
  }
  return out;
}

describe("test suite naming", () => {
  const files = testFiles(REPO_ROOT);

  test("finds the repo's test files at all", () => {
    // Guards the two assertions below from vacuously passing if the walk broke.
    expect(files.length).toBeGreaterThan(80);
  });

  test("every test file declares its kind by suffix", () => {
    const unclassified = files
      .filter((f) => !KINDS.some((k) => f.endsWith(k)))
      .filter((f) => !UNRUN.includes(f));

    expect(unclassified).toEqual([]);
  });

  test("the deliberately-unrun files still exist, and are still unrun", () => {
    // If `generate_clo.test.ts` is fixed and renamed, this list should shrink
    // rather than sit here excusing a file that no longer needs it.
    for (const f of UNRUN) {
      expect(files).toContain(f);
      expect(KINDS.some((k) => f.endsWith(k))).toBe(false);
    }
  });
});
