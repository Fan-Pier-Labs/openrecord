/**
 * Loading the list of real values the guard is watching for.
 *
 * WHY A LIST AT ALL. Structural rules ("that looks like a phone number") can
 * only see values that still look like themselves. The leak this guard exists
 * to stop is the opposite shape: a value that has been partially redacted and
 * therefore no longer matches any pattern — `r***@example.com`, `***-**-6789`,
 * `DOB 19**-**-02`. Recognising those requires knowing what the real value is,
 * so the guard needs a local list of them.
 *
 * WHERE IT LIVES. Inside the git directory (`.git/pii-denylist.txt`), which is
 * the one place in a checkout that cannot be committed by accident and is
 * shared by every worktree. `PII_GUARD_DENYLIST` overrides it, and
 * `~/.config/openrecord/pii-denylist.txt` is the fallback for values worth
 * guarding across repos.
 *
 * The file is plaintext, because the matchers need the characters themselves —
 * a hash can't tell you that `617-***-**34` is a rendering of a number you
 * know. That is a real trade-off: the file is a small collection of your own
 * identifiers sitting in a fixed location on disk. It is never read by anything
 * but this tool, never printed, and never leaves the machine.
 */

import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { DEFAULT_THRESHOLDS, expandDate, normalize } from './match';
import type { Needle, PiiKind } from './types';

const KINDS = new Set<PiiKind>([
  'email', 'phone', 'name', 'dob', 'mrn', 'address', 'ssn', 'card', 'secret', 'medical', 'text',
]);

export interface DenylistLoad {
  needles: Needle[];
  /** Where the entries came from, for the "you have no denylist" hint. */
  path: string | null;
  /** Entries that couldn't be parsed, by line number — surfaced, never silent. */
  problems: string[];
}

/**
 * Candidate locations, most specific first.
 *
 * `gitCommonDir` is passed in rather than shelled out for, because this module
 * has to stay importable from a test without a repo around it.
 */
export function denylistCandidates(gitCommonDir: string | null): string[] {
  const fromEnv = process.env.PII_GUARD_DENYLIST;
  const candidates: string[] = [];
  if (fromEnv) candidates.push(fromEnv);
  if (gitCommonDir) candidates.push(join(gitCommonDir, 'pii-denylist.txt'));
  candidates.push(join(homedir(), '.config', 'openrecord', 'pii-denylist.txt'));
  return candidates;
}

/**
 * Parse the denylist format:
 *
 *     # comments and blank lines are ignored
 *     phone: +1 617 555 0134
 *     email: someone@example.com
 *     name:  Firstname Lastname | minRun=6
 *     dob:   1980-01-02
 *
 * The optional `| key=value` tail overrides this entry's thresholds, which is
 * how a short surname or a common word gets tuned without touching code.
 */
export function parseDenylist(contents: string): { needles: Needle[]; problems: string[] } {
  const needles: Needle[] = [];
  const problems: string[] = [];

  contents.split(/\r?\n/).forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) return;

    const separator = line.indexOf(':');
    if (separator === -1) {
      problems.push(`line ${lineNumber}: expected "kind: value"`);
      return;
    }
    const kind = line.slice(0, separator).trim().toLowerCase();
    if (!KINDS.has(kind as PiiKind)) {
      problems.push(`line ${lineNumber}: unknown kind "${kind}"`);
      return;
    }

    const [valuePart, ...optionParts] = line.slice(separator + 1).split('|');
    const value = (valuePart ?? '').trim();
    if (value.length === 0) {
      problems.push(`line ${lineNumber}: empty value`);
      return;
    }

    const defaults = DEFAULT_THRESHOLDS[kind as PiiKind];
    let { minRun, minRevealed } = defaults;
    let minRunWasSet = false;
    for (const option of optionParts) {
      const [key, raw] = option.split('=').map((part) => part.trim());
      const parsed = Number.parseInt(raw ?? '', 10);
      if (Number.isNaN(parsed)) {
        problems.push(`line ${lineNumber}: bad option "${option.trim()}"`);
        continue;
      }
      if (key === 'minRun') {
        minRun = parsed;
        minRunWasSet = true;
      } else if (key === 'minRevealed') {
        minRevealed = parsed;
      } else {
        problems.push(`line ${lineNumber}: unknown option "${key ?? ''}"`);
      }
    }

    // One entry can become several needles: a date has nine renderings, and a
    // phone number written with a country code is also leaked without one.
    for (const rendering of renderings(kind as PiiKind, value)) {
      const normalized = normalize(rendering.value, rendering.kind);
      if (normalized.length < 3) {
        problems.push(`line ${lineNumber}: value normalises to under 3 characters, too short to match safely`);
        continue;
      }
      needles.push({
        kind: rendering.kind,
        normalized,
        minRun: rendering.exact && !minRunWasSet ? normalized.length : Math.min(minRun, normalized.length),
        minRevealed,
        source: lineNumber,
      });
    }
  });

  return { needles, problems };
}

interface Rendering {
  kind: PiiKind;
  value: string;
  /**
   * Fragments of this rendering are not, on their own, a leak — only the whole
   * thing (or a masked version of it) is. A date is the reason this exists:
   * `1980-01-02` has eight digits of which six are shared with a great many
   * ordinary numbers, and matching fragments of it would fire constantly.
   */
  exact?: boolean;
}

/** Every spelling of one entry that should be treated as the same value. */
function renderings(kind: PiiKind, value: string): Rendering[] {
  if (kind === 'dob') {
    return expandDate(value).map((rendering) => ({
      // A written-out month is prose, not a number, so it has to be normalised
      // as prose — under the digits-only rule it would collapse to "21980".
      kind: /[a-z]/i.test(rendering) ? ('text' as const) : ('dob' as const),
      value: rendering,
      exact: true,
    }));
  }
  if (kind === 'email') {
    // Two needles, and the split matters. The whole address is matched EXACTLY
    // (or masked), because a fragment of it is usually just the domain — and a
    // domain shared with every colleague identifies nobody. The local part is
    // matched as a fragment, because that is the half that names a person, and
    // it is only ever looked for inside something already shaped like an
    // address, so an ordinary word on a line can't trip it.
    const local = value.slice(0, value.indexOf('@'));
    const both: Rendering[] = [{ kind, value, exact: true }];
    if (local.length >= 4) both.push({ kind, value: local });
    return both;
  }
  if (kind === 'phone') {
    const digits = value.replace(/\D/g, '');
    // A US number is leaked equally by its ten significant digits, with or
    // without the country code that may or may not have been typed.
    return digits.length === 11 && digits.startsWith('1')
      ? [{ kind, value: digits }, { kind, value: digits.slice(1) }]
      : [{ kind, value: digits }];
  }
  return [{ kind, value }];
}

/** Read the first denylist that exists. Absence is normal, not an error. */
export function loadDenylist(gitCommonDir: string | null): DenylistLoad {
  for (const path of denylistCandidates(gitCommonDir)) {
    if (!existsSync(path)) continue;
    const { needles, problems } = parseDenylist(readFileSync(path, 'utf8'));
    return { needles, path, problems };
  }
  return { needles: [], path: null, problems: [] };
}
