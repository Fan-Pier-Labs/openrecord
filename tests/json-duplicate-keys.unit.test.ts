/**
 * No checked-in JSON file may declare the same key twice in one object.
 *
 * JSON parsers take the last occurrence and say nothing, so a duplicate is
 * invisible unless something happens to warn about it — which is how four
 * compiler options ended up listed twice in every tsconfig in #316: the round-4
 * batch had already enabled three of them, the round-5 batch added them again,
 * and both `tsc` and CI were perfectly happy. The values matched, so nothing
 * broke; the next one to collide would have silently overridden the first.
 *
 * Comments are legal in a tsconfig, so this scans JSONC rather than calling
 * JSON.parse — which by itself couldn't see a duplicate anyway.
 */
import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");

/**
 * Tracked files only, from git rather than a directory walk. A walk would also
 * read whatever untracked JSON is lying around a working copy — `creds.json`
 * and `cookies.json` among them — and a failure message here quotes the file.
 */
function trackedJsonFiles(): string[] {
  return execFileSync("git", ["ls-files", "*.json"], { cwd: REPO_ROOT, encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .filter((f) => !f.endsWith("-lock.json"));
}

/** Keys repeated within one object literal, as `file:line key`. */
function findDuplicateKeys(text: string): { key: string; line: number }[] {
  const duplicates: { key: string; line: number }[] = [];
  // One scope per open `{`. Arrays need no entry: a string inside one is never
  // followed by a `:`, so it never reaches the scope below.
  const scopes: Set<string>[] = [];
  let i = 0;
  let line = 1;

  while (i < text.length) {
    const c = text[i]!;

    if (c === "\n") {
      line++;
      i++;
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
    } else if (c === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) {
        if (text[i] === "\n") line++;
        i++;
      }
      i += 2;
    } else if (c === "{") {
      scopes.push(new Set());
      i++;
    } else if (c === "}") {
      scopes.pop();
      i++;
    } else if (c === '"') {
      const startLine = line;
      let value = "";
      i++;
      while (i < text.length && text[i] !== '"') {
        if (text[i] === "\\") {
          value += text[i]! + (text[i + 1] ?? "");
          i += 2;
          continue;
        }
        if (text[i] === "\n") line++;
        value += text[i];
        i++;
      }
      i++;

      // A key is a string followed by `:`; a value is followed by `,` or a close.
      let j = i;
      while (j < text.length && /\s/.test(text[j]!)) j++;
      if (text[j] === ":") {
        const scope = scopes[scopes.length - 1];
        if (scope) {
          if (scope.has(value)) duplicates.push({ key: value, line: startLine });
          scope.add(value);
        }
      }
    } else {
      i++;
    }
  }

  return duplicates;
}

describe("JSON duplicate keys", () => {
  const files = trackedJsonFiles();

  test("finds the repo's JSON files at all", () => {
    // Guards the assertion below from vacuously passing if `git ls-files` broke.
    expect(files.length).toBeGreaterThan(10);
    expect(files).toContain("tsconfig.json");
  });

  test("the scanner reports a duplicate, and only a real one", () => {
    // Otherwise a scanner that returned [] unconditionally would pass the gate.
    expect(findDuplicateKeys(`{ "a": 1, /* c */ "a": 2 }`)).toEqual([{ key: "a", line: 1 }]);
    // Same key in sibling objects, in an array, and as a value — none are duplicates.
    expect(findDuplicateKeys(`{ "x": { "a": 1 }, "y": { "a": 2 }, "z": ["a", "a"], "w": "a" }`)).toEqual([]);
  });

  test("no tracked JSON file declares a key twice in one object", () => {
    const offenders = files.flatMap((f) =>
      findDuplicateKeys(readFileSync(join(REPO_ROOT, f), "utf8")).map((d) => `${f}:${d.line} ${d.key}`),
    );

    expect(offenders).toEqual([]);
  });
});
