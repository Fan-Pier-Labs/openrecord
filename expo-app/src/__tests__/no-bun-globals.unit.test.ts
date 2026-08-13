/// <reference types="bun" />
// ^ These run under `bun test`; see the note below on what this directive costs.
import { describe, expect, test } from "bun:test";
import * as fs from "fs";
import * as path from "path";

/**
 * App code must never reference Bun globals — it runs on Hermes, where there
 * is no Bun.
 *
 * Why this needs a test: the expo test files carry
 * `/// <reference types="bun" />` so `bun:test` resolves, and a triple-slash
 * reference adds declarations to the whole PROGRAM, not just the referencing
 * file. That puts `Bun` in scope for every app source file, so
 * `Bun.file(...)` in a component would typecheck clean and crash on device.
 * The alternative — a separate tsconfig for the test files — was considered
 * and rejected (one project per package, deliberately), so the boundary the
 * compiler can't draw here is enforced by this walk instead.
 */

const APP_SRC = path.join(import.meta.dir, "..");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Test dirs are the one place Bun APIs are legitimate.
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      out.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe("expo app code stays off Bun globals", () => {
  test("no app source file references the Bun global or bun: modules", () => {
    const offenders: string[] = [];
    for (const file of walk(APP_SRC)) {
      const src = fs.readFileSync(file, "utf8");
      // The global object (`Bun.file`, `typeof Bun`) or a bun: module import.
      if (/\bBun\s*\./.test(src) || /\btypeof\s+Bun\b/.test(src) || /from\s+["']bun:/.test(src)) {
        offenders.push(path.relative(APP_SRC, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
