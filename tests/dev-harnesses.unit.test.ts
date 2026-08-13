/**
 * Run-it-yourself demos live in `dev-scripts/`, never in an `if
 * (import.meta.main)` block inside a product module.
 *
 * The rule exists because of the per-file coverage gate. Such a block is
 * unreachable from a test — nothing imports a module *as main* — so a handful
 * of demo lines drag an otherwise well-covered file under the 75% bar, and the
 * only ways out are waiving the whole file (which then goes wholly unchecked)
 * or leaving CI red. `clo-image-parser/generate_clo.ts` was waived for exactly
 * that reason and cleared 97% lines the moment its demo block moved out.
 *
 * The blocks are also easy to re-add without noticing: they run when you `bun
 * <file>` and are invisible otherwise, so nothing complains until the next time
 * someone reads the waiver list and wonders why a tested file is on it.
 *
 * `scrapers/list-all-mycharts/` is the deliberate exception — the mount-discovery
 * probe IS a dev diagnostic, documented in CLAUDE.md as `bun
 * scrapers/list-all-mycharts/probe-mount-discovery.ts`, and coverage ignores the
 * whole directory. Its `import.meta.main` block is the entry point, not a demo
 * bolted onto product code.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");

/** Directories holding no product source of ours. */
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".next",
  "coverage",
  ".git",
  "dev-scripts",
  "fake-mychart",
  "__tests__",
]);

/** Dev diagnostics that are themselves scripts — see the header. */
const SCRIPT_DIRS = ["scrapers/list-all-mycharts/"];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(relative(REPO_ROOT, full));
    }
  }
  return out;
}

/** A mention inside a comment is documentation; only a real block is a problem. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("dev harnesses", () => {
  const files = sourceFiles(REPO_ROOT);

  test("finds the repo's source files at all", () => {
    // Guards the assertion below from vacuously passing if the walk broke.
    expect(files.length).toBeGreaterThan(150);
  });

  test("no product module carries an `import.meta.main` block", () => {
    const offenders = files
      .filter((f) => !SCRIPT_DIRS.some((d) => f.startsWith(d)))
      .filter((f) => /import\.meta\.main/.test(stripComments(readFileSync(join(REPO_ROOT, f), "utf8"))));

    expect(offenders).toEqual([]);
  });
});
