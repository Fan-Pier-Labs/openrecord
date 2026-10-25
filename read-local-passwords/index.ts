// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

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

import { closeSync, openSync, readdirSync } from 'fs';
import { chromiumProfileRoots, getChromiumLogins } from './chromium';
import { firefoxProfileRoots, getFirefoxLogins } from './firefox';
import { classifyMyChartEntries } from './myChartFilter';
import type { MyChartCandidate, PasswordStoreEntry, PasswordStoreEntryWithKey } from './types';

export type { MyChartCandidate, PasswordStoreEntry, PasswordStoreEntryWithKey } from './types';

/** True when this platform has a password store we know how to read. */
export function isSupportedPlatform(): boolean {
  return process.platform === 'darwin' || process.platform === 'win32';
}

/**
 * Browsers whose saved passwords macOS will not let this process read.
 *
 * macOS shields some browsers' data folders from other apps. The refusal is an
 * EPERM on reading the folder, which the scan otherwise swallows exactly like
 * "nothing saved". Only the user can lift it, by giving the app this process
 * runs under Full Disk Access, so the caller has to tell them how.
 */
export function blockedBrowsers(): string[] {
  if (process.platform !== 'darwin') return [];
  const roots = [...chromiumProfileRoots(), ...firefoxProfileRoots().map(root => ({ name: 'Firefox', root }))];
  const blocked = roots.filter(({ root }) => isPermissionDenied(root)).map(({ name }) => name);
  if (blocked.length) getListedForFullDiskAccess();
  return blocked;
}

/**
 * Put Claude in the Full Disk Access list, switched off, so the user only has
 * to turn it on rather than find it with +. macOS lists an app when it is
 * refused a classic Full Disk Access location, but not when it is refused
 * another app's data folder, which is all the browser reads are. A refused
 * open of TCC.db is Apple's own example; nothing is read, and the file is
 * closed at once if the open succeeds.
 */
function getListedForFullDiskAccess(): void {
  try {
    closeSync(openSync('/Library/Application Support/com.apple.TCC/TCC.db', 'r'));
  } catch {
    // The refusal is the point.
  }
}

function isPermissionDenied(directory: string): boolean {
  try {
    readdirSync(directory);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
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
