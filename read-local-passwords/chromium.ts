/**
 * Chromium-family password stores (Chrome, Arc, Brave, Edge, Vivaldi, Opera).
 *
 * Every one of them keeps the same two things: a `Login Data` SQLite file whose
 * `logins` table holds an encrypted `password_value`, and a per-browser master
 * key held by the OS. Only how the master key is protected differs by platform.
 */

import { execFile } from 'child_process';
import { createDecipheriv, pbkdf2Sync } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import * as path from 'path';
import { promisify } from 'util';
import { toBuffer, toText, withDatabaseCopy } from './sqlite';
import type { PasswordStoreEntry } from './types';

const execFileAsync = promisify(execFile);

interface ChromiumBrowser {
  /** Display name, also the Keychain *account* for the "<name> Safe Storage" item. */
  name: string;
  /** Keychain account on macOS, when it differs from the display name. */
  keychainAccount?: string;
  /** Profile root, relative to the platform's application-data directory. */
  macDir?: string;
  winDir?: string;
}

/**
 * Ordered so the browsers people actually keep health logins in come first.
 * Adding one is a single entry — the extraction path is shared.
 */
const BROWSERS: ChromiumBrowser[] = [
  { name: 'Chrome', macDir: 'Google/Chrome', winDir: 'Google/Chrome/User Data' },
  { name: 'Arc', macDir: 'Arc/User Data', winDir: 'Arc/User Data' },
  { name: 'Brave', macDir: 'BraveSoftware/Brave-Browser', winDir: 'BraveSoftware/Brave-Browser/User Data' },
  { name: 'Edge', keychainAccount: 'Microsoft Edge', macDir: 'Microsoft Edge', winDir: 'Microsoft/Edge/User Data' },
  { name: 'Vivaldi', macDir: 'Vivaldi', winDir: 'Vivaldi/User Data' },
  { name: 'Opera', keychainAccount: 'Opera', macDir: 'com.operasoftware.Opera', winDir: 'Opera Software/Opera Stable' },
];

/** Chromium writes one `Login Data` per profile; users routinely have several. */
const PROFILE_DIRS = ['Default', 'Profile 1', 'Profile 2', 'Profile 3', 'Profile 4'];

function applicationSupportRoot(): string {
  return process.platform === 'win32'
    ? process.env.LOCALAPPDATA ?? path.join(homedir(), 'AppData', 'Local')
    : path.join(homedir(), 'Library', 'Application Support');
}

function profileRoot(browser: ChromiumBrowser): string | null {
  const relative = process.platform === 'win32' ? browser.winDir : browser.macDir;
  return relative ? path.join(applicationSupportRoot(), relative) : null;
}

/**
 * macOS: the master key is a PBKDF2 stretch of the "<Browser> Safe Storage"
 * Keychain password. The salt and iteration count are Chromium's, hardcoded in
 * `os_crypt_mac.mm`, and have not changed since the feature shipped.
 *
 * This is the call that makes macOS put up "…wants to access your keychain".
 * That prompt is the consent gate, so it is deliberately not suppressed.
 */
async function macMasterKey(account: string): Promise<Buffer | null> {
  try {
    // execFile, not exec: the account name goes in as an argv entry so a
    // browser name can never be read as shell syntax.
    const { stdout } = await execFileAsync('security', ['find-generic-password', '-wa', account]);
    const secret = stdout.trim();
    if (!secret) return null;
    return pbkdf2Sync(secret, Buffer.from('saltysalt', 'utf-8'), 1003, 16, 'sha1');
  } catch {
    // No such item, or the user clicked Deny. Both mean "skip this browser".
    return null;
  }
}

/**
 * Windows: the master key sits in `Local State` as DPAPI-protected bytes.
 *
 * Unwrapped through PowerShell's ProtectedData rather than a native DPAPI
 * addon, to keep this package free of per-platform binaries.
 */
async function windowsMasterKey(profileRootPath: string): Promise<Buffer | null> {
  const localState = path.join(profileRootPath, 'Local State');
  if (!existsSync(localState)) return null;

  try {
    const parsed = JSON.parse(readFileSync(localState, 'utf-8')) as {
      os_crypt?: { encrypted_key?: string; app_bound_encrypted_key?: string };
    };
    const encoded = parsed.os_crypt?.encrypted_key;
    if (!encoded) return null;

    // Strip the 5-byte "DPAPI" tag Chromium prepends before base64-ing.
    const blob = Buffer.from(encoded, 'base64').subarray(5);
    const script =
      'Add-Type -AssemblyName System.Security;' +
      `$b=[Convert]::FromBase64String('${blob.toString('base64')}');` +
      '[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Unprotect($b,$null,0))';
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true },
    );
    const key = Buffer.from(stdout.trim(), 'base64');
    return key.length === 32 ? key : null;
  } catch {
    return null;
  }
}

/**
 * Decrypt one `password_value` blob.
 *
 * The 3-byte prefix names the scheme. `v10`/`v11` are the OS-key schemes we
 * handle. `v20` is Chrome 127+ **app-bound encryption** on Windows, which binds
 * the key to the Chrome executable itself; it cannot be unwrapped from another
 * process by design, so we report it rather than pretending the row is corrupt.
 *
 * `scheme` is passed in rather than read from `process.platform` so both branches stay
 * reachable from a test on either OS. Exported for that reason.
 */
export function decryptPassword(
  masterKey: Buffer,
  blob: Buffer,
  osScheme: 'mac' | 'windows',
): { text?: string; reason?: string } {
  if (blob.length === 0) return { text: '' };
  const scheme = blob.subarray(0, 3).toString('latin1');

  if (scheme === 'v20') return { reason: 'app-bound encryption (Chrome 127+ on Windows)' };

  if (scheme !== 'v10' && scheme !== 'v11') {
    // No recognised prefix: pre-encryption Chromium stored the password as-is.
    return { text: blob.toString('utf-8') };
  }

  try {
    if (osScheme === 'windows') {
      // AES-256-GCM: 12-byte nonce, 16-byte tag at the end.
      const nonce = blob.subarray(3, 15);
      const body = blob.subarray(15);
      const decipher = createDecipheriv('aes-256-gcm', masterKey, nonce);
      decipher.setAuthTag(body.subarray(body.length - 16));
      return { text: Buffer.concat([decipher.update(body.subarray(0, body.length - 16)), decipher.final()]).toString('utf-8') };
    }

    // macOS: AES-128-CBC with a fixed IV of sixteen spaces (0x20).
    const ciphertext = blob.subarray(3);
    if (ciphertext.length < 16 || ciphertext.length % 16 !== 0) return { reason: 'bad ciphertext length' };
    const decipher = createDecipheriv('aes-128-cbc', masterKey, Buffer.alloc(16, 32));
    return { text: Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf-8') };
  } catch (error) {
    return { reason: (error as Error).message };
  }
}

/** Every credential this machine's Chromium browsers have saved. */
export async function getChromiumLogins(): Promise<PasswordStoreEntry[]> {
  const isMac = process.platform === 'darwin';
  if (!isMac && process.platform !== 'win32') return [];

  const entries: PasswordStoreEntry[] = [];

  for (const browser of BROWSERS) {
    const root = profileRoot(browser);
    if (!root || !existsSync(root)) continue;

    const databases = PROFILE_DIRS
      .map(profile => path.join(root, profile, 'Login Data'))
      .filter(existsSync);
    if (databases.length === 0) continue;

    const masterKey = isMac
      ? await macMasterKey(browser.keychainAccount ?? browser.name)
      : await windowsMasterKey(root);
    if (!masterKey) continue;

    for (const database of databases) {
      try {
        const rows = await withDatabaseCopy(database, db =>
          db.all('SELECT origin_url, username_value, password_value FROM logins'),
        );

        for (const row of rows) {
          const blob = toBuffer(row.password_value);
          const { text, reason } = blob
            ? decryptPassword(masterKey, blob, isMac ? 'mac' : 'windows')
            : { reason: 'no password blob' };
          entries.push({
            url: toText(row.origin_url) ?? '',
            user: toText(row.username_value),
            pass: text ?? null,
            success: text != null,
            source: browser.name,
            ...(reason ? { failureReason: reason } : {}),
          });
        }
      } catch {
        // A profile that will not open (locked, corrupt, mid-upgrade) must not
        // take the other profiles or browsers down with it.
      }
    }
  }

  return entries;
}
