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
import { homedir } from 'os';
import * as path from 'path';
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

/** Folders macOS guards with Full Disk Access as a whole. Almost every Mac has the first. */
const FULL_DISK_ACCESS_FOLDERS = ['Safari', 'Mail', 'Messages'];

/**
 * Put Claude in the Full Disk Access list, switched off, so the user only has
 * to turn it on rather than find it with +. macOS lists an app when it is
 * refused a classic Full Disk Access location, but not when it is refused
 * another app's data folder, which is all the browser reads are.
 *
 * The probe opens a guarded *folder* and never lists or reads it: no file
 * inside is touched. A made-up file name inside one does not work, because
 * macOS answers "no such file" without refusing.
 */
function getListedForFullDiskAccess(): void {
  for (const folder of FULL_DISK_ACCESS_FOLDERS) {
    try {
      closeSync(openSync(path.join(homedir(), 'Library', folder), 'r'));
      return;
    } catch (error) {
      // A refusal is the point; only a missing folder is worth trying the next one.
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return;
    }
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
