/**
 * The matching core: does this line contain a real value, or a piece of one?
 *
 * Two questions, two matchers, because partial leaks arrive in two shapes.
 *
 *   1. A FRAGMENT — someone pasted the last seven digits of a phone number, or
 *      the local part of an address, and nothing else. There is no mask; the
 *      leak is that a long enough run of the real value survives verbatim.
 *      {@link findFragment} answers this.
 *
 *   2. A MASKED RENDERING — `r***@example.com`, `(617) ***-**34`. Redacting
 *      most of a value feels safe and usually isn't: the surviving characters
 *      plus the shape are frequently enough to identify a person, and they are
 *      certainly enough to confirm a guess. {@link maskedMatch} treats the
 *      masked token as a pattern and asks whether the real value satisfies it.
 *
 * Both work on NORMALISED text (see `normalize`), so `(617) 555-0134`,
 * `617.555.0134` and `+16175550134` are one value, and `Firstname  Lastname`
 * matches `firstname lastname`.
 *
 * Everything here is pure and string-only — no I/O, no regex built from
 * unbounded input — so it can be tested exhaustively and can't be the thing
 * that hangs a pre-commit hook.
 */

import type { PiiKind } from './types';

/**
 * Characters that stand in for redacted content.
 *
 * `x` is deliberately absent as a single character: it is an ordinary letter
 * (`max@…`, `0x1f`) and treating one `x` as a wildcard makes every hex literal
 * a candidate. A run of two or more is the recognisable masking convention
 * (`xxxx-1234`), so that is where it starts counting.
 */
const MASK_RUN = /[*•●·×#?]+|[xX]{2,}|█+/g;

/** True if `text` contains at least one mask run. */
export function hasMask(text: string): boolean {
  MASK_RUN.lastIndex = 0;
  return MASK_RUN.test(text);
}

/**
 * Split a candidate into the literal characters that survived masking and the
 * lengths of the mask runs between them.
 *
 * `r***@ex*.com` → segments `['r', '@ex', '.com']`, gaps `[3, 1]`.
 */
export function splitMask(candidate: string): { segments: string[]; gaps: number[] } {
  const segments: string[] = [];
  const gaps: number[] = [];
  let cursor = 0;
  MASK_RUN.lastIndex = 0;
  for (let m = MASK_RUN.exec(candidate); m !== null; m = MASK_RUN.exec(candidate)) {
    segments.push(candidate.slice(cursor, m.index));
    gaps.push(m[0].length);
    cursor = m.index + m[0].length;
  }
  segments.push(candidate.slice(cursor));
  return { segments, gaps };
}

/**
 * Every window of `length` consecutive characters in `value`.
 *
 * "Does a run of N characters of the real value survive in this line" is the
 * fragment question, and asking it as "does the line contain any of the value's
 * N-grams" turns an O(line × value) dynamic program into a handful of native
 * substring searches. Computed once per needle, not once per line — a diff is
 * thousands of lines and a pre-commit hook has a fraction of a second.
 */
export function grams(value: string, length: number): string[] {
  if (length <= 0 || value.length < length) return value.length > 0 ? [value] : [];
  const out: string[] = [];
  for (let i = 0; i + length <= value.length; i++) out.push(value.slice(i, i + length));
  return out;
}

/** The N-gram of `needle` that `haystack` contains, if any. */
export function findFragment(haystack: string, needleGrams: string[]): string | null {
  for (const gram of needleGrams) {
    if (haystack.includes(gram)) return gram;
  }
  return null;
}

/** Escape a literal for inclusion in a RegExp. */
function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * How many real characters one mask run is allowed to stand for.
 *
 * Masking usually preserves length (`****` for four characters) but not always
 * (`***` for a whole domain), so the bound is generous rather than exact — the
 * `minRevealed` threshold, not this number, is what keeps the match honest.
 * Capping at the needle's own length keeps the compiled pattern bounded.
 */
function gapBound(gap: number, needleLength: number): number {
  return Math.min(needleLength, Math.max(4, gap * 6));
}

/**
 * Treat a masked token as a pattern and ask whether the real value matches it.
 *
 * Returns the number of literal characters the candidate revealed, or `null` if
 * it is not a masked rendering of `needle` (or reveals too little to care).
 */
export function maskedMatch(candidate: string, needle: string, minRevealed: number): number | null {
  if (!hasMask(candidate)) return null;
  const { segments, gaps } = splitMask(candidate);
  const revealed = segments.join('').length;
  if (revealed < minRevealed) return null;

  let pattern = '';
  for (let i = 0; i < segments.length; i++) {
    pattern += escapeRegExp(segments[i] ?? '');
    const gap = gaps[i];
    if (gap !== undefined) pattern += `[\\s\\S]{0,${gapBound(gap, needle.length)}}`;
  }
  // Unanchored on purpose: a masked fragment (`***-**34`) is a rendering of
  // PART of the value, and that is still a leak.
  return new RegExp(pattern).test(needle) ? revealed : null;
}

/**
 * Reduce a rendering of a value to the characters that identify it.
 *
 * The point is that two spellings of one real value normalise to one string:
 * a phone number keeps only its digits (and any masks), an email keeps the
 * punctuation that structures it, and a name or address keeps only letters and
 * digits so that `12 Example St.` and `12 example st` agree.
 */
export function normalize(text: string, kind: PiiKind): string {
  const lower = text.toLowerCase();
  switch (kind) {
    case 'phone':
    case 'ssn':
    case 'card':
    case 'dob':
    case 'mrn':
      // Digits and masks only: everything else is formatting that varies.
      return lower.replace(/[^0-9*•●·×#?x]/g, '');
    case 'email':
      return lower.replace(/[^a-z0-9@._%+\-*•●·×#?]/g, '');
    case 'secret':
      // Case-sensitive material (tokens, keys) keeps its case; only the
      // surrounding punctuation goes.
      return text.replace(/[^A-Za-z0-9*•●·×#?_\-.]/g, '');
    case 'name':
    case 'address':
    case 'medical':
    case 'binary':
    case 'text':
      return lower.replace(/[^a-z0-9*•●·×#?]/g, '');
  }
}

/** Default thresholds per kind, overridable per denylist entry. */
export const DEFAULT_THRESHOLDS: Record<PiiKind, { minRun: number; minRevealed: number }> = {
  // Four consecutive digits of a real number is the shape people paste when
  // they think they have anonymised it ("ending 1234").
  phone: { minRun: 4, minRevealed: 3 },
  ssn: { minRun: 4, minRevealed: 3 },
  card: { minRun: 4, minRevealed: 4 },
  // A date has only ten characters of entropy and half of them are structure,
  // so it is matched whole or as a masked rendering, never as a fragment.
  dob: { minRun: 6, minRevealed: 4 },
  mrn: { minRun: 5, minRevealed: 4 },
  // Six characters of an address is `ryan@x` — the local part plus the `@`, or
  // most of a distinctive domain.
  email: { minRun: 6, minRevealed: 4 },
  // Names are the most false-positive-prone entry there is: a surname is an
  // ordinary word, and this repo's own author's name is legitimately in the
  // license. The default demands most of the name, and the `minRun=` override
  // exists for the ones worth watching harder.
  name: { minRun: 8, minRevealed: 5 },
  address: { minRun: 8, minRevealed: 6 },
  secret: { minRun: 8, minRevealed: 6 },
  medical: { minRun: 6, minRevealed: 5 },
  text: { minRun: 6, minRevealed: 4 },
  binary: { minRun: 6, minRevealed: 4 },
};

/**
 * Every rendering of a date that a leak might use.
 *
 * A date of birth is the one identifier that gets reformatted constantly —
 * scraped as ISO, displayed as `M/D/YYYY`, logged as `Mon D, YYYY` — so one
 * denylist entry has to become every one of those before matching starts.
 */
const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

export function expandDate(iso: string): string[] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  const year = m?.[1];
  const month = m?.[2];
  const day = m?.[3];
  if (year === undefined || month === undefined || day === undefined) return [iso.trim()];
  const shortMonth = Number.parseInt(month, 10);
  const shortDay = Number.parseInt(day, 10);
  const monthName = MONTHS[shortMonth - 1] ?? '';
  return [
    `${year}-${month}-${day}`,
    `${month}/${day}/${year}`,
    `${shortMonth}/${shortDay}/${year}`,
    `${day}/${month}/${year}`,
    `${month}-${day}-${year}`,
    `${year}${month}${day}`,
    `${month}${day}${year}`,
    `${monthName} ${shortDay}, ${year}`,
    `${shortDay} ${monthName} ${year}`,
  ].filter((rendering) => rendering.length > 0);
}

/**
 * A redacted stand-in for a matched token, safe to print in a hook message.
 *
 * Keeps the first character and the length — enough to point at the right token
 * on a line the reader is about to open anyway, useless to anyone who doesn't
 * already have the file.
 */
export function redact(matched: string): string {
  const trimmed = matched.trim();
  if (trimmed.length <= 1) return `${trimmed.length} chars`;
  return `${trimmed[0]}… (${trimmed.length} chars)`;
}
