// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * Offer to reuse the MyChart passwords the user already has saved in their
 * browser, the way a browser offers to import from another browser.
 *
 * The rule this file exists to enforce: **a scanned password never leaves this
 * process.** Tool results are sent to the model, so `import_browser_passwords`
 * returns only what a human needs in order to choose — hostname, username,
 * which browser it came from, how confident we are — and holds the credential
 * here under an opaque id. `connect_imported_account` redeems that id locally.
 *
 * Nothing is written anywhere until the user picks an entry: the scan is
 * read-only, and reading the macOS Keychain raises the system's own permission
 * prompt, which is the consent gate for the scan itself.
 */

import { blockedBrowsers, findMyChartCandidates, isSupportedPlatform, type MyChartCandidate } from '../../read-local-passwords/index';

/**
 * Scanned credentials, held only long enough for the user to choose one.
 * One id covers every saved password for the same login — Chrome and Firefox
 * often both hold one, and they can disagree after a password change.
 */
const held = new Map<string, { candidates: MyChartCandidate[]; expiresAt: number }>();

/**
 * Ten minutes, matching the pending-2FA window. Long enough to talk it over
 * with the user, short enough that a forgotten scan is not sitting in memory
 * for the life of the process.
 */
const TTL_MS = 10 * 60 * 1000;

function evictExpired(now = Date.now()): void {
  for (const [key, value] of held) if (value.expiresAt <= now) held.delete(key);
}

/** What the model is allowed to see about one candidate. */
interface ImportedAccountSummary {
  import_id: string;
  hostname: string;
  username: string | null;
  /** Browser the credential was read from, e.g. "Chrome". */
  source?: string;
  confidence: MyChartCandidate['confidence'];
  instance_name?: string;
}

/**
 * Group candidates that are the same login: same host, same username (MyChart
 * usernames are case-insensitive). `classifyMyChartEntries` already collapsed
 * identical passwords, so what is left in a group is passwords that differ.
 */
function groupByLogin(candidates: MyChartCandidate[]): MyChartCandidate[][] {
  const groups = new Map<string, MyChartCandidate[]>();
  for (const candidate of candidates) {
    const id = `${candidate.hostname}|${(candidate.user ?? '').toLowerCase()}`;
    groups.set(id, [...(groups.get(id) ?? []), candidate]);
  }
  return [...groups.values()];
}

/** "Chrome", "Chrome and Firefox", "Arc, Chrome and Firefox". */
function sourcesLabel(group: MyChartCandidate[]): string | undefined {
  const sources = [...new Set(group.map((c) => c.source).filter((s): s is string => !!s))];
  if (sources.length <= 1) return sources[0];
  return `${sources.slice(0, -1).join(', ')} and ${sources[sources.length - 1]}`;
}

function summarize(group: MyChartCandidate[]): ImportedAccountSummary {
  // The filter sorts directory matches first, so the head has the best confidence.
  const [first] = group as [MyChartCandidate, ...MyChartCandidate[]];
  const source = sourcesLabel(group);
  const instanceName = group.find((c) => c.instanceName)?.instanceName;
  return {
    import_id: first.key,
    hostname: first.hostname,
    username: first.user,
    ...(source ? { source } : {}),
    confidence: first.confidence,
    ...(instanceName ? { instance_name: instanceName } : {}),
  };
}

export interface ScanResult {
  supported: boolean;
  accounts: ImportedAccountSummary[];
  /** Browsers macOS would not let us read. Their logins are missing from `accounts`. */
  blocked_browsers: string[];
}

/**
 * Scan the local browser password stores for MyChart logins.
 *
 * Only accounts we could confirm are returned. A saved password for a host that
 * does not answer is a login we could not perform anyway, so offering it would
 * buy the user a failed attempt instead of an account; `setup_account` is there
 * for anything this misses, and a later re-run picks up a portal that was down.
 */
export async function scanBrowserPasswords(options: { probeUnknownHosts?: boolean } = {}): Promise<ScanResult> {
  if (!isSupportedPlatform()) return { supported: false, accounts: [], blocked_browsers: [] };

  evictExpired();
  const candidates = await findMyChartCandidates(options);

  const expiresAt = Date.now() + TTL_MS;
  const groups = groupByLogin(candidates);
  for (const group of groups) held.set(group[0]!.key, { candidates: group, expiresAt });

  return { supported: true, accounts: groups.map(summarize), blocked_browsers: blockedBrowsers() };
}

/**
 * Redeem an id from the last scan: every saved password for that login, to be
 * tried in turn. Returns undefined once it has expired.
 */
export function takeImportedCandidates(importId: string): MyChartCandidate[] | undefined {
  evictExpired();
  return held.get(importId)?.candidates;
}

/** Drop a credential once it has been connected (or explicitly declined). */
export function releaseImportedCandidate(importId: string): void {
  held.delete(importId);
}

/** Test seam: forget everything scanned so far. */
export function _clearHeldImports(): void {
  held.clear();
}
