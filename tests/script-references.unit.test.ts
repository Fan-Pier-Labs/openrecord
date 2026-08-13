/**
 * Every `bun run <script>` written in a doc must name a script that exists.
 *
 * Renaming or deleting a package.json script leaves its old name behind in
 * CLAUDE.md, the READMEs and `.claude/skills/`, and nothing notices: the docs
 * still read plausibly, and the failure surfaces later as `error: Script not
 * found` in front of whoever followed them. #237 did exactly that — it deleted
 * `test:fake-mychart` and `test:ci-integration` and left the update-packages
 * skill telling its reader to run one of them.
 *
 * Scripts are collected from every package.json in the repo, not just the root,
 * because plenty of docs are written to be run from inside a package.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");

const SKIP_DIRS = new Set(["node_modules", "dist", ".next", "coverage", ".git"]);

/** `.claude` is scanned deliberately — the skills live there. */
const SCAN_HIDDEN = new Set([".claude", ".github"]);

function walk(dir: string, match: (name: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const hidden = entry.name.startsWith(".");
    if (SKIP_DIRS.has(entry.name)) continue;
    if (hidden && !SCAN_HIDDEN.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, match));
    else if (match(entry.name)) out.push(relative(REPO_ROOT, full));
  }
  return out;
}

function declaredScripts(): Set<string> {
  const names = new Set<string>();
  for (const f of walk(REPO_ROOT, (n) => n === "package.json")) {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, f), "utf8")) as {
      scripts?: Record<string, string>;
    };
    for (const name of Object.keys(pkg.scripts ?? {})) names.add(name);
  }
  return names;
}

/**
 * `bun run` also takes a file path (`bun run scrapers/probe.ts`), which is not a
 * script name and has nothing to check against. Anything with a slash or a
 * source extension is one of those.
 */
function scriptInvocations(source: string): string[] {
  const found = new Set<string>();
  for (const m of source.matchAll(/\bbun run ([^\s`'"|&;)]+)/g)) {
    const token = m[1];
    if (token.includes("/") || /\.(ts|tsx|js|mjs|cjs|json)$/.test(token)) continue;
    if (!/^[a-zA-Z][\w:.-]*$/.test(token)) continue;
    found.add(token);
  }
  return [...found];
}

describe("documented scripts", () => {
  const docs = walk(REPO_ROOT, (n) => n.endsWith(".md"));
  const scripts = declaredScripts();

  test("finds the docs and the scripts at all", () => {
    // Guards the assertion below from vacuously passing if either walk broke.
    expect(docs.length).toBeGreaterThan(5);
    expect(scripts.has("test")).toBe(true);
    expect(scripts.has("test:integration")).toBe(true);
  });

  test("every `bun run <script>` in a doc names a script that exists", () => {
    const dangling: string[] = [];
    for (const doc of docs) {
      const source = readFileSync(join(REPO_ROOT, doc), "utf8");
      for (const name of scriptInvocations(source)) {
        if (!scripts.has(name)) dangling.push(`${doc}: bun run ${name}`);
      }
    }
    expect(dangling).toEqual([]);
  });
});
