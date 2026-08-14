/**
 * ReDoS hardening of the Authorization-header pattern.
 *
 * The header is attacker-supplied and reaches this regex before anything else
 * in the request is checked, and `\s+` sat directly in front of `(.+)` — both
 * match spaces and tabs, so `Bearer` plus a long whitespace run and no newline
 * made the engine try every division of it. The rewrite has to accept exactly
 * the same headers and hand `verifyGoogleIdToken` exactly the same token, so
 * this file proves that against the pre-fix pattern as the oracle.
 *
 * The second alternative in the rewrite is the subtle part: the old pattern's
 * `\s+` genuinely needed to hand one character back when the whole tail was
 * whitespace, and `"Bearer  "` matched with a single space as the token. That
 * is preserved deliberately rather than quietly tightened — the naive
 * `(\S.*)` differs from the old pattern on 726 of the strings below.
 */

import { describe, expect, test } from 'bun:test';
import { __bearerRe } from '../handler.mjs';

/**
 * handler.mjs before this change — the equivalence oracle, not product code.
 * This is the vulnerable pattern verbatim, and it is only ever run over the
 * short inputs in this file. Do not copy it anywhere else.
 */
const BEARER_BEFORE = /^Bearer\s+(.+)$/i;

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

const CASES = [
  'Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6ImFiYyJ9.eyJzdWIiOiIxIn0.sig',
  'bearer lowercase-scheme-token',
  'BEARER SHOUTED-TOKEN',
  'Bearer   three-spaces-before',
  'Bearer\ttab-separated',
  'Bearer \t mixed-whitespace',
  'Bearer token with spaces inside',
  'Bearer trailing-space ',
  // Degenerate tails — the cases where the old pattern backtracked.
  'Bearer ',
  'Bearer   ',
  'Bearer\t',
  'Bearer\n',
  'Bearer \n',
  'Bearer\n ',
  'Bearer \n ',
  // Newline inside the token: `.` cannot cross it, so neither matches.
  'Bearer abc\ndef',
  'Bearer abc\n',
  // Not a bearer header at all.
  'Basic dXNlcjpwYXNz',
  'Bearer',
  'BearerNoSpace',
  ' Bearer leading-space',
  '',
  'Bearer' + ' '.repeat(200),
  'Bearer' + ' '.repeat(200) + 'token',
];

describe('bearer pattern: equivalence with the pre-fix pattern', () => {
  test('agrees on every representative Authorization header', () => {
    for (const s of CASES) {
      expect({ input: s, out: result(__bearerRe, s) })
        .toEqual({ input: s, out: result(BEARER_BEFORE, s) });
    }
  });

  test("agrees on all 19,530 tails up to length 6 over ' \\t\\na.'", () => {
    const tails = allStrings(' \t\na.', 6);
    expect(tails.length).toBe(19531);
    const differing = tails
      .map((t) => `Bearer${t}`)
      .filter((s) => JSON.stringify(result(__bearerRe, s)) !== JSON.stringify(result(BEARER_BEFORE, s)));
    expect(differing).toEqual([]);
  });

  test('the naive tightening would NOT have been equivalent', () => {
    // Pins why the second alternative exists: without it, every all-whitespace
    // tail stops matching. If this ever reports 0, the alternative is dead
    // weight and can go.
    const naive = /^Bearer\s+(\S.*)$/i;
    const differing = allStrings(' \t\na.', 6)
      .map((t) => `Bearer${t}`)
      .filter((s) => JSON.stringify(result(naive, s)) !== JSON.stringify(result(BEARER_BEFORE, s)));
    expect(differing.length).toBe(726);
  });

  test('still extracts the token', () => {
    // Guards against an equivalence proof that holds because both patterns
    // stopped matching anything.
    expect(__bearerRe.exec('Bearer abc.def.ghi')?.[1]).toBe('abc.def.ghi');
  });

  // The guard that matters most here: this header is attacker-supplied and is
  // parsed before anything else about the request is checked, on a public
  // endpoint. At this size the pre-fix pattern takes 13.1s (measured) and the
  // rewrite 0.34ms. Nothing in the toolchain watches for this, so this test is
  // the only thing standing between a future edit and a one-request hang.
  test('a 150k whitespace run after the scheme returns fast', () => {
    const started = performance.now();
    expect(__bearerRe.exec(`Bearer${' '.repeat(150_000)}a\nb`)).toBeNull();
    expect(performance.now() - started).toBeLessThan(2_000);
  });
});
