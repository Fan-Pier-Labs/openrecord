/**
 * Read MyChart credentials the user has already saved in their browser.
 *
 * Strictly read-only, on this machine only: nothing here writes to a browser
 * store or to the OS keychain, and no credential leaves the process. Reading
 * the macOS Keychain puts up the system's own "wants to access" prompt, which
 * is the consent gate for the whole feature.
 *
 * Upstream of the decryption work: bojangabric/browser-password-extractor (MIT).
 * The Firefox path has been substantially rewritten — see `firefox.ts`.
 */

import { getChromiumLogins } from './chromium';
import { getFirefoxLogins } from './firefox';
import { classifyMyChartEntries } from './myChartFilter';
import type { MyChartCandidate, PasswordStoreEntry, PasswordStoreEntryWithKey } from './types';

export type { MyChartCandidate, MyChartConfidence, PasswordStoreEntry, PasswordStoreEntryWithKey } from './types';

/** True when this platform has a password store we know how to read. */
export function isSupportedPlatform(): boolean {
  return process.platform === 'darwin' || process.platform === 'win32';
}

/**
 * Every credential in every supported browser, decrypted, unfiltered.
 *
 * Exported for diagnostics; product code wants `findMyChartCandidates`, which
 * narrows to health portals.
 */
export async function getAllBrowserLogins(): Promise<PasswordStoreEntry[]> {
  if (!isSupportedPlatform()) return [];
  // Independent stores, so a slow Keychain prompt on one need not hold the other.
  const [chromium, firefox] = await Promise.all([
    getChromiumLogins().catch(() => [] as PasswordStoreEntry[]),
    getFirefoxLogins().catch(() => [] as PasswordStoreEntry[]),
  ]);
  return [...chromium, ...firefox];
}

/**
 * The saved logins confirmed to be MyChart accounts, each tagged with how it
 * was confirmed. Anything we could not confirm is dropped — see
 * `myChartFilter.ts`.
 */
export async function findMyChartCandidates(
  options: { probeUnknownHosts?: boolean } = {},
): Promise<MyChartCandidate[]> {
  return classifyMyChartEntries(await getAllBrowserLogins(), options);
}

/**
 * Confirmed MyChart accounts, in the shape the CLI's
 * `--read-login-from-browser` has always expected.
 */
export async function getMyChartAccounts(): Promise<PasswordStoreEntryWithKey[]> {
  return findMyChartCandidates();
}
