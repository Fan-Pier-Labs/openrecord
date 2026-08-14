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

import { findMyChartCandidates, isSupportedPlatform, type MyChartCandidate } from '../../read-local-passwords/index';

/** Scanned credentials, held only long enough for the user to choose one. */
const held = new Map<string, { candidate: MyChartCandidate; expiresAt: number }>();

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
export interface ImportedAccountSummary {
  import_id: string;
  hostname: string;
  username: string | null;
  /** Browser the credential was read from, e.g. "Chrome". */
  source?: string;
  confidence: MyChartCandidate['confidence'];
  instance_name?: string;
  /** Present only for `unverified` entries: why we could not confirm the host. */
  unverified_reason?: string;
}

function summarize(candidate: MyChartCandidate): ImportedAccountSummary {
  return {
    import_id: candidate.key,
    hostname: candidate.hostname,
    username: candidate.user,
    ...(candidate.source ? { source: candidate.source } : {}),
    confidence: candidate.confidence,
    ...(candidate.instanceName ? { instance_name: candidate.instanceName } : {}),
    ...(candidate.unverifiedReason ? { unverified_reason: candidate.unverifiedReason } : {}),
  };
}

export interface ScanResult {
  supported: boolean;
  confirmed: ImportedAccountSummary[];
  unverified: ImportedAccountSummary[];
}

/**
 * Scan the local browser password stores for MyChart logins.
 *
 * `confirmed` and `unverified` are kept apart rather than merged: an unverified
 * entry is a real saved password we simply could not prove belongs to an Epic
 * portal (host down, VPN-only, a domain that has since been retired), and
 * hiding it would be indistinguishable from finding nothing at all.
 */
export async function scanBrowserPasswords(options: { probeUnknownHosts?: boolean } = {}): Promise<ScanResult> {
  if (!isSupportedPlatform()) return { supported: false, confirmed: [], unverified: [] };

  evictExpired();
  const candidates = await findMyChartCandidates(options);

  const expiresAt = Date.now() + TTL_MS;
  for (const candidate of candidates) held.set(candidate.key, { candidate, expiresAt });

  return {
    supported: true,
    confirmed: candidates.filter(c => c.confidence !== 'unverified').map(summarize),
    unverified: candidates.filter(c => c.confidence === 'unverified').map(summarize),
  };
}

/** Redeem an id from the last scan. Returns undefined once it has expired. */
export function takeImportedCandidate(importId: string): MyChartCandidate | undefined {
  evictExpired();
  return held.get(importId)?.candidate;
}

/** Drop a credential once it has been connected (or explicitly declined). */
export function releaseImportedCandidate(importId: string): void {
  held.delete(importId);
}

/** Test seam: forget everything scanned so far. */
export function _clearHeldImports(): void {
  held.clear();
}
