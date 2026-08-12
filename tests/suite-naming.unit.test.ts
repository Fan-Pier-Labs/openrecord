/**
 * Every test file in the repo must declare which kind of test it is, in its
 * filename.
 *
 * The three `test` scripts select by suffix and nothing else — no script
 * names a directory of tests, let alone an individual file. That is what stops the root `test` script from drifting back into the
 * hand-maintained list of per-package globs it used to be, and it is what keeps
 * the real-MyChart suite out of CI by construction rather than by remembering
 * not to glob it.
 *
 * The cost of selecting by suffix is that a test file which forgets one is
 * simply never run, and a suite that never runs looks exactly like a suite that
 * passes. This test is the backstop for that: an unsuffixed `*.test.ts` fails
 * here instead of quietly disappearing.
 *
 *   *.unit.test.ts         no network, no server, no credentials. Runs in CI.
 *   *.integration.test.ts  needs the fake-mychart server. Runs in CI.
 *   *.real-mychart.test.ts needs a REAL MyChart account. NEVER runs in CI.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");

const KINDS = [".unit.test.ts", ".integration.test.ts", ".real-mychart.test.ts"];

/**
 * Directories bun's own test scanner skips or that hold no source of ours.
 * `dist`/`.next` are build output; `coverage` is this gate's own report.
 */
const SKIP_DIRS = new Set(["node_modules", "dist", ".next", "coverage", ".git"]);

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
    // No allowlist, deliberately. There was one — `generate_clo.test.ts`, whose
    // CLO round-trip assertions failed — and the temptation with a file like
    // that is to park it outside the suites and forget it. It was fixed in #231
    // instead. Anything that genuinely cannot run belongs behind `it.skip`,
    // where the reporter still counts it, not behind a filename that makes it
    // invisible.
    expect(files.filter((f) => !KINDS.some((k) => f.endsWith(k)))).toEqual([]);
  });

  test("exactly one kind applies to each file", () => {
    // `.unit` and `.integration` are substrings of nothing else here, but a
    // future kind that is a suffix of another would put a file in two suites.
    for (const f of files) {
      expect(KINDS.filter((k) => f.endsWith(k))).toHaveLength(1);
    }
  });

  test("no CI workflow can reach the real-MyChart suite", () => {
    // The whole point of the third kind. If a workflow ever globs it, a CI run
    // starts firing at a live patient chart.
    const workflows = readdirSync(join(REPO_ROOT, ".github/workflows"))
      .filter((f) => /\.ya?ml$/.test(f))
      .map((f) => readFileSync(join(REPO_ROOT, ".github/workflows", f), "utf8"));

    expect(workflows.length).toBeGreaterThan(0);
    for (const w of workflows) {
      expect(w).not.toContain("real-mychart");
    }
  });
});
