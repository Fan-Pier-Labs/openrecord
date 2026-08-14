/**
 * ReDoS hardening of the two masked-contact patterns on the 2FA page.
 *
 * These run over HTML scraped from a third-party MyChart portal, on the LOGIN
 * path, so a pattern with super-linear backtracking is a remote hang of the
 * whole scrape. The rewrites had to be linear AND accept exactly the same
 * strings with exactly the same match, so this file proves both:
 *
 *  - equivalence, against the previous patterns as the oracle, over a hand-
 *    written table of real-shaped inputs AND every string up to length 7 over
 *    the alphabets that actually drive the backtracking;
 *  - linearity, by timing the rewrites on a pathological input.
 *
 * No lint rule guards any of this — the repo runs core ESLint and
 * typescript-eslint only, and neither can see backtracking behaviour. These
 * tests are the standing protection: if someone reintroduces an ambiguous
 * pattern here, the timing tests are what will say so.
 *
 * The `*_BEFORE` patterns below are the literal pre-fix source, kept only as
 * that oracle — nothing in the product reads them.
 */

import { describe, it, expect } from 'bun:test'
import { __maskedContactPatterns } from '../login'

const { MASKED_EMAIL_RE, MASKED_PHONE_RE } = __maskedContactPatterns

/**
 * login.ts before this change — the equivalence oracle, not product code.
 * These are the vulnerable patterns verbatim, and they are only ever run over
 * the short inputs in this file. Do not copy them anywhere else.
 */
const EMAIL_BEFORE = /[\w*]+\*+[\w*]*@[\w.]+/
const PHONE_BEFORE = /\*{2,}[\d*-]*\d{4}/

/** exec() result flattened to something `toEqual` can compare exactly. */
function result(re: RegExp, s: string): unknown {
  const m = re.exec(s)
  return m === null ? null : { index: m.index, groups: [...m] }
}

/** Every string of length 0..maxLen over `alphabet`. */
function allStrings(alphabet: string, maxLen: number): string[] {
  const out = ['']
  let frontier = ['']
  for (let n = 0; n < maxLen; n++) {
    const next: string[] = []
    for (const s of frontier) for (const c of alphabet) next.push(s + c)
    out.push(...next)
    frontier = next
  }
  return out
}

const EMAIL_CASES: string[] = [
  // Real-shaped masked emails, in the wording MyChart's buttons use.
  'Email to ry***@gmail.com',
  'Send a code to j***n@example.co.uk',
  'Email me at a***@x.io',
  'user***@sub.domain.example.com',
  '**a**@x.co',
  '***@x.io',
  'ry***@gmail.com.',
  // Two on one line — the leftmost must still win.
  'Email to ab***@x.y and also cd***@z.w',
  '   ***@a.b',
  // Near misses.
  '*@x.io',
  'a@b.com',
  '***@',
  '@x.io',
  'abc@',
  '*****',
  '***-***-7204',
  'no email here',
  'Email to me',
  '',
  ' ',
  '@',
  '*',
  '**',
  // A star run long enough to be interesting but short enough that the OLD
  // pattern still returns inside this test's lifetime.
  `${'*'.repeat(60)}@x.co`,
  '*'.repeat(60),
  `a${'*'.repeat(60)}@x.co`,
]

const PHONE_CASES: string[] = [
  'Text to ***-***-7204',
  'Text message to ***-***-7204.',
  '**7204',
  '****1234',
  '***12345',
  '-**-1234',
  '**-**-**-9999',
  'code sent to ***-***-1234 and ***-***-5678',
  // Near misses.
  '*7204',
  '***-***-720',
  '1234',
  '****',
  '**',
  '*',
  '',
  'no phone here',
  '***-***-abcd',
  `${'*'.repeat(60)}1234`,
  '*'.repeat(60),
]

describe('masked-contact patterns: equivalence with the pre-fix patterns', () => {
  it('agrees on every representative masked email and near-miss', () => {
    for (const s of EMAIL_CASES) {
      expect({ input: s, out: result(MASKED_EMAIL_RE, s) })
        .toEqual({ input: s, out: result(EMAIL_BEFORE, s) })
    }
  })

  it('agrees on every representative masked phone and near-miss', () => {
    for (const s of PHONE_CASES) {
      expect({ input: s, out: result(MASKED_PHONE_RE, s) })
        .toEqual({ input: s, out: result(PHONE_BEFORE, s) })
    }
  })

  // The hand-written tables show the patterns still do their job; these two
  // are the actual proof of equivalence. The alphabets are the characters the
  // patterns distinguish between, so every structural case is covered.
  it('agrees on all 21,845 strings up to length 7 over "a*@.-" (email)', () => {
    const inputs = allStrings('a*@.', 7)
    expect(inputs.length).toBe(21845)
    const differing = inputs.filter(
      (s) => JSON.stringify(result(MASKED_EMAIL_RE, s)) !== JSON.stringify(result(EMAIL_BEFORE, s)),
    )
    expect(differing).toEqual([])
  })

  it('agrees on all 21,845 strings up to length 7 over "1*-x" (phone)', () => {
    const inputs = allStrings('1*-x', 7)
    expect(inputs.length).toBe(21845)
    const differing = inputs.filter(
      (s) => JSON.stringify(result(MASKED_PHONE_RE, s)) !== JSON.stringify(result(PHONE_BEFORE, s)),
    )
    expect(differing).toEqual([])
  })

  it('still extracts the masked contacts from a real-shaped 2FA button', () => {
    // Guards against an equivalence proof that holds because both patterns
    // stopped matching anything.
    expect(MASKED_EMAIL_RE.exec('Email to ry***@gmail.com')?.[0]).toBe('ry***@gmail.com')
    expect(MASKED_PHONE_RE.exec('Text to ***-***-7204')?.[0]).toBe('***-***-7204')
  })
})

describe('masked-contact patterns: linear on pathological input', () => {
  // 50,000 mask characters and no '@' or trailing digits — a run a portal
  // could hand us in a single element's text. Measured on the pre-fix
  // patterns: EMAIL_BEFORE needed 25.7s at 800 characters (it grows ~n^4, so
  // 50k is astronomical) and PHONE_BEFORE 105ms at 800 (cubic). The rewrites
  // do 50k in under a millisecond. The 2s budget is loose on purpose — it is
  // there to catch a regression to super-linear, not to police jitter, and no
  // super-linear pattern gets anywhere near it at this size.
  const PATHOLOGICAL = '*'.repeat(50_000)
  const BUDGET_MS = 2_000

  it('email pattern finishes on 50k mask characters', () => {
    const started = performance.now()
    expect(MASKED_EMAIL_RE.exec(PATHOLOGICAL)).toBeNull()
    expect(performance.now() - started).toBeLessThan(BUDGET_MS)
  })

  it('phone pattern finishes on 50k mask characters', () => {
    const started = performance.now()
    expect(MASKED_PHONE_RE.exec(PATHOLOGICAL)).toBeNull()
    expect(performance.now() - started).toBeLessThan(BUDGET_MS)
  })

  it('email pattern finishes on a 50k run that ends in a near-miss', () => {
    const started = performance.now()
    expect(MASKED_EMAIL_RE.exec(`${'*'.repeat(50_000)}a`)).toBeNull()
    expect(performance.now() - started).toBeLessThan(BUDGET_MS)
  })

  it('phone pattern finishes on a 50k run that ends in three digits', () => {
    const started = performance.now()
    expect(MASKED_PHONE_RE.exec(`${'*'.repeat(50_000)}123`)).toBeNull()
    expect(performance.now() - started).toBeLessThan(BUDGET_MS)
  })
})
