/// <reference types="bun" />
// ^ These run under `bun test`, not in the app: the reference pulls in
// bun:test module declarations without adding Bun globals to the app config.

/**
 * ReDoS hardening of the ```json fence pattern.
 *
 * Its input is a model's reply, which is neither trusted nor length-bounded,
 * and `\s*` sat directly in front of `[\s\S]*?` — both could claim the same
 * whitespace, so an unterminated fence made the engine try every division of
 * it. `(?!\s)` pins `\s*` to the whole run. This file proves the rewrite
 * accepts exactly the same strings with the same capture, using the pre-fix
 * pattern as the oracle.
 */

import { describe, expect, test } from "bun:test";
import { __jsonFenceRe } from "../prompts";

/**
 * prompts.ts before this change — the equivalence oracle, not product code.
 * This is the vulnerable pattern verbatim, and it is only ever run over the
 * short inputs in this file. Do not copy it anywhere else.
 */
const FENCE_BEFORE = /```(?:json)?\s*([\s\S]*?)```/;

function result(re: RegExp, s: string): unknown {
  const m = re.exec(s);
  return m === null ? null : { index: m.index, groups: [...m] };
}

function allStrings(alphabet: string, maxLen: number): string[] {
  const out = [""];
  let frontier = [""];
  for (let n = 0; n < maxLen; n++) {
    const next: string[] = [];
    for (const s of frontier) for (const c of alphabet) next.push(s + c);
    out.push(...next);
    frontier = next;
  }
  return out;
}

const CASES: string[] = [
  '```json\n{"a":1}\n```',
  '```json {"a":1}```',
  '```\n{"a":1}\n```',
  '```\n[1,2,3]\n```',
  '```json\n\n\n  {"a":1}```',
  "```json``` ",
  "``````",
  "```   ```",
  "```\n   \n```",
  "```json   ```",
  'Here you go:\n```json\n{"a":1}\n```\nHope that helps.',
  // Two fences — the first must still win, with the same body.
  '```json\n{"a":1}\n```\n```json\n{"b":2}\n```',
  // Unterminated: the case that used to backtrack.
  '```json\n   {"a":1}',
  "```json" + " ".repeat(200),
  "```" + "\n".repeat(200),
  // No fence at all.
  '{"a":1}',
  "``",
  "`",
  "",
  "   ",
  "json",
];

describe("json fence pattern: equivalence with the pre-fix pattern", () => {
  test("agrees on every representative reply shape", () => {
    for (const s of CASES) {
      expect({ input: s, out: result(__jsonFenceRe, s) })
        .toEqual({ input: s, out: result(FENCE_BEFORE, s) });
    }
  });

  test("agrees on all 97,656 strings up to length 7 over '`j \\nx'", () => {
    const inputs = allStrings("`j \nx", 7);
    expect(inputs.length).toBe(97656);
    const differing = inputs.filter(
      (s) => JSON.stringify(result(__jsonFenceRe, s)) !== JSON.stringify(result(FENCE_BEFORE, s)),
    );
    expect(differing).toEqual([]);
  });

  test("still pulls the body out of a fenced reply", () => {
    // Guards against an equivalence proof that holds because both patterns
    // stopped matching anything.
    expect(__jsonFenceRe.exec('```json\n{"a":1}\n```')?.[1]).toBe('{"a":1}\n');
  });

  // At this size the pre-fix pattern takes 7.4s (measured) and the rewrite
  // 0.37ms. The size is chosen so the budget is unambiguous in both
  // directions; it is loose on purpose, there to catch a regression to
  // super-linear rather than to police jitter. Nothing in the toolchain
  // watches for this, so this test is the guard.
  test("an unterminated fence with a 150k whitespace run returns fast", () => {
    const started = performance.now();
    expect(__jsonFenceRe.exec("```json" + " ".repeat(150_000))).toBeNull();
    expect(performance.now() - started).toBeLessThan(2_000);
  });
});
