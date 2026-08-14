/** One credential as it sits in a browser's password store. */
export interface PasswordStoreEntry {
  url: string;
  user: string | null;
  pass: string | null;
  /** False when the row was found but could not be decrypted. */
  success: boolean;
  /** Which store it came from, e.g. "Chrome" or "Firefox" — shown to the user. */
  source?: string;
  /** Why decryption failed, when `success` is false. Diagnostics only. */
  failureReason?: string;
}

export type PasswordStoreEntryWithKey = PasswordStoreEntry & { key: string };

/**
 * How an entry was confirmed to be an Epic MyChart login.
 *
 * `directory` — the hostname is in `mychart-instances.json`. Confirmed offline,
 *   no network involved.
 * `probed`    — not in the directory, but following its redirects landed on a
 *   page that serves Epic's login markup.
 *
 * There is no "maybe" tier: an entry we cannot confirm is dropped. See
 * `classifyMyChartEntries`.
 */
export type MyChartConfidence = 'directory' | 'probed';

export interface MyChartCandidate extends PasswordStoreEntryWithKey {
  confidence: MyChartConfidence;
  /** Host after redirects, lowercased. The identity we dedupe and log in on. */
  hostname: string;
  /** Display name from the directory, when the host is a known instance. */
  instanceName?: string;
}

export interface IPasswordExtractor {
  extractPasswords(): Promise<PasswordStoreEntry[]>;
}

export interface IBrowserExtractor {
  getLogins(): Promise<PasswordStoreEntry[]>;
}
