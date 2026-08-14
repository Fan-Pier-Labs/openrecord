/**
 * ReDoS hardening of the demo's heading and bullet patterns.
 *
 * Both run over a line of a model's reply — untrusted, and only as bounded as
 * the model's output limit — and both had `\s+` sitting directly in front of a
 * `(.*)` that also matches spaces and tabs. On a line the pattern cannot
 * finally match, the engine tried every division of the whitespace run between
 * the two: 0.9s at 40k characters, 14.9s at 160k.
 *
 * Nothing in the toolchain watches for this, so these tests are the guard. The
 * timing tests fail against the pre-fix patterns; the equivalence tests are
 * what let the fix ship at all, since the rewrite has to accept exactly the
 * same lines with exactly the same captures.
 */

import { describe, expect, test } from 'bun:test';
import { __linePatterns } from '../src/markdown';

/**
 * markdown.ts before this change — the equivalence oracle, not product code.
 * These are the vulnerable patterns verbatim, and they are only ever run over
 * the short inputs in this file. Do not copy them anywhere else.
 */
const HEADING_BEFORE = /^(#{1,4})\s+(.*)$/;
const BULLET_BEFORE = /^\s*[-*]\s+(.*)$/;

function result(re: RegExp, s: string): unknown {
  const m = re.exec(s);
  return m === null ? null : { index: m.index, groups: [...m] };
}

function allStrings(alphabet: string, maxLen: number): string[] {
  const out = [''];
  let frontier = [''];
  for (let n = 0; n < maxLen; n++) {
    const next: string[] = [];
    for (const s of frontier) for (const c of alphabet) next.push(s + c);
    out.push(...next);
    frontier = next;
  }
  return out;
}

function agreesEverywhere(before: RegExp, after: RegExp, alphabet: string, maxLen: number) {
  const inputs = allStrings(alphabet, maxLen);
  return {
    count: inputs.length,
    differing: inputs.filter(
      (s) => JSON.stringify(result(after, s)) !== JSON.stringify(result(before, s)),
    ),
  };
}

const HEADING_CASES = [
  '# Your results',
  '## A subheading',
  '###   Extra spaces before the text',
  '#### Deepest level',
  '#\ttab separated',
  '#     ',
  '# ',
  '#',
  '##### too deep',
  '#no space',
  ' # leading space',
  '# trailing spaces   ',
  '# a\nb',
  `# ${'x'.repeat(200)}`,
  `#${' '.repeat(200)}`,
  `#${' '.repeat(200)}title`,
  '',
  '   ',
];

const BULLET_CASES = [
  '- First item',
  '* Star bullet',
  '  - Indented item',
  '\t* Tab indented',
  '-   extra spaces',
  '- ',
  '-',
  '-no space',
  '   -   spaced both ends   ',
  '- a\nb',
  `-${' '.repeat(200)}`,
  `-${' '.repeat(200)}item`,
  `${' '.repeat(200)}- item`,
  'not a bullet',
  '',
  '   ',
];

describe('markdown line patterns: equivalence with the pre-fix patterns', () => {
  test('heading agrees on every representative line', () => {
    for (const s of HEADING_CASES) {
      expect({ input: s, out: result(__linePatterns.HEADING, s) })
        .toEqual({ input: s, out: result(HEADING_BEFORE, s) });
    }
  });

  test('bullet agrees on every representative line', () => {
    for (const s of BULLET_CASES) {
      expect({ input: s, out: result(__linePatterns.BULLET, s) })
        .toEqual({ input: s, out: result(BULLET_BEFORE, s) });
    }
  });

  // The tables above show the patterns still do their job; these two are the
  // actual proof of equivalence. The alphabets are the characters the patterns
  // distinguish between, so every structural case is covered.
  test('heading agrees on all 19,531 strings up to length 6 over "# \\na\\t"', () => {
    const { count, differing } = agreesEverywhere(HEADING_BEFORE, __linePatterns.HEADING, '# \na\t', 6);
    expect(count).toBe(19531);
    expect(differing).toEqual([]);
  });

  test('bullet agrees on all 19,531 strings up to length 6 over "-* \\na"', () => {
    const { count, differing } = agreesEverywhere(BULLET_BEFORE, __linePatterns.BULLET, '-* \na', 6);
    expect(count).toBe(19531);
    expect(differing).toEqual([]);
  });

  test('both still capture the line body', () => {
    // Guards against an equivalence proof that holds because both patterns
    // stopped matching anything.
    expect(__linePatterns.HEADING.exec('## Your results')?.[2]).toBe('Your results');
    expect(__linePatterns.BULLET.exec('  - First item')?.[1]).toBe('First item');
  });
});

describe('markdown line patterns: linear on pathological input', () => {
  // The trailing "a\nb" is what makes this the pathological case: `(.*)$`
  // cannot cross the newline, so the match fails and the pre-fix pattern had
  // to re-divide the whole whitespace run between `\s+` and `(.*)` on the way
  // out. At this size the pre-fix patterns take 13.1s each (measured) and the
  // rewrites 0.24ms. The size is chosen so the budget is unambiguous in both
  // directions: 6x under it for a linear pattern's worst case, 5000x over it
  // for the quadratic one. The budget is loose on purpose — it is there to
  // catch a regression to super-linear, not to police jitter.
  const RUN = 150_000;
  const BUDGET_MS = 2_000;

  test('heading finishes on a 150k whitespace run', () => {
    const started = performance.now();
    expect(__linePatterns.HEADING.exec(`#${' '.repeat(RUN)}a\nb`)).toBeNull();
    expect(performance.now() - started).toBeLessThan(BUDGET_MS);
  });

  test('bullet finishes on a 150k whitespace run', () => {
    const started = performance.now();
    expect(__linePatterns.BULLET.exec(`-${' '.repeat(RUN)}a\nb`)).toBeNull();
    expect(performance.now() - started).toBeLessThan(BUDGET_MS);
  });
});
