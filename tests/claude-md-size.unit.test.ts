/**
 * CLAUDE.md is loaded into context at the start of every single session, so its
 * length is a recurring cost paid by every task in the repo, forever.
 *
 * Left to itself it only grows: each PR appends the thing it just learned, no
 * PR ever deletes, and the file drifts from an index of invariants into a
 * changelog. It reached 65KB that way — bigger than every reference doc in
 * `docs/` combined — which is what prompted this gate.
 *
 * The cap is deliberately close to the current size. It is not a budget to
 * spend down; it is a forcing function: a PR that genuinely needs a new line in
 * CLAUDE.md should shorten or delete another one, or put the detail in `docs/`
 * and leave a pointer behind. If a change really does belong here and nothing
 * can go, raise the cap in the same PR — deliberately, and visibly in review,
 * rather than by a hundred silent appends.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const CLAUDE_MD = join(import.meta.dir, "..", "CLAUDE.md");

/** Roughly 3.5k tokens. See the note above before raising either of these. */
const MAX_BYTES = 14_000;
const MAX_LINES = 220;

const HOW_TO_FIX = [
  "",
  "CLAUDE.md has outgrown its cap. Before raising it, try:",
  "  - moving the detail into docs/ (or the package's README) and leaving a",
  "    one-line rule plus a pointer here,",
  "  - deleting anything stale, duplicated, or already covered elsewhere,",
  "  - dropping what the code already says — signatures, file listings, test names.",
  "",
  'See "Keeping this file small" in CLAUDE.md.',
].join("\n");

describe("CLAUDE.md stays an index, not a changelog", () => {
  const contents = readFileSync(CLAUDE_MD, "utf8");

  test(`is at most ${MAX_BYTES} bytes`, () => {
    const bytes = Buffer.byteLength(contents, "utf8");
    expect(bytes, `${bytes} bytes > ${MAX_BYTES}.${HOW_TO_FIX}`).toBeLessThanOrEqual(MAX_BYTES);
  });

  test(`is at most ${MAX_LINES} lines`, () => {
    const lines = contents.split("\n").length;
    expect(lines, `${lines} lines > ${MAX_LINES}.${HOW_TO_FIX}`).toBeLessThanOrEqual(MAX_LINES);
  });

  test("still points at the docs that hold the detail it delegates", () => {
    for (const doc of [
      "docs/architecture.md",
      "docs/testing.md",
      "docs/infrastructure.md",
      "docs/ios-simulator.md",
    ]) {
      expect(contents, `CLAUDE.md no longer links ${doc}`).toContain(doc);
    }
  });
});
