/**
 * Shared vocabulary for the PII guard.
 *
 * A finding never carries the value it matched. The whole point of the guard is
 * to keep real identifiers out of places they get copied to — a git object, a
 * PR body, an agent transcript — and a report that quotes the match would put
 * it straight into the last of those. Findings carry a location and a shape
 * (`preview`) instead, which is all a human or an agent needs to go delete it.
 */

/** What a needle or a structural rule believes it found. */
export type PiiKind =
  | 'email'
  | 'phone'
  | 'name'
  | 'dob'
  | 'mrn'
  | 'address'
  | 'ssn'
  | 'card'
  | 'secret'
  | 'medical'
  | 'binary'
  | 'text';

/**
 * `block` fails the commit; `warn` prints and exits 0.
 *
 * Warnings exist for the checks that can't be certain from a diff alone — a
 * newly added screenshot may or may not have a patient banner in it — where
 * failing the commit would train people to reach for `--no-verify`.
 */
export type Severity = 'block' | 'warn';

export interface Finding {
  /** Repo-relative path, or a pseudo-path like `<commit message>` for scanned text. */
  file: string;
  /** 1-based line within the new file, or within the scanned text. */
  line: number;
  /** Identifier of the rule that fired, e.g. `denylist:phone` or `structural:ssn`. */
  rule: string;
  kind: PiiKind;
  severity: Severity;
  /**
   * Redacted shape of the match: enough to recognise which token on the line is
   * meant, never enough to reconstruct it. See {@link redact}.
   */
  preview: string;
  /** One line of human explanation, safe to print anywhere. */
  detail: string;
}

/** One line of a diff that the scanner is allowed to look at. */
export interface AddedLine {
  file: string;
  /** 1-based line number in the post-image of `file`. */
  line: number;
  text: string;
}

/** A parsed unified diff, reduced to what the scanner cares about. */
export interface ParsedDiff {
  added: AddedLine[];
  /** Paths added or modified as binary — unscannable, reported separately. */
  binaryFiles: string[];
}

/**
 * One entry from the local denylist: a real value the guard should refuse to
 * see, in whole or in part, masked or not.
 */
export interface Needle {
  kind: PiiKind;
  /**
   * Normalised form the matchers compare against — lowercased, with the
   * separators that vary between renderings of the same value removed. Never
   * logged.
   */
  normalized: string;
  /** Shortest run of consecutive characters that counts as a leak on its own. */
  minRun: number;
  /** Literal characters a masked candidate must reveal before it counts. */
  minRevealed: number;
  /** 1-based line in the denylist file, so a bad entry can be pointed at. */
  source: number;
}

export interface ScanOptions {
  /** Values to hunt for. Empty is legal — the structural rules still run. */
  needles: Needle[];
  /** Literal strings (lowercased) that are known-fake and never reported. */
  allowlist: Set<string>;
  /** Globs, matched against the repo-relative path, that are not scanned. */
  skipPaths: string[];
}
