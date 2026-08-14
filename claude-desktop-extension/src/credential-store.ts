/**
 * Credential storage for the OpenRecord MCPB.
 *
 * Passkeys go to the OS keystore — the macOS Keychain, the Windows Credential
 * Manager, or the Secret Service on Linux — via `secret-store.ts`, which falls
 * back to the file below wherever no keystore answers. Everything else is a
 * file under ~/.openrecord-mcpb/:
 *   accounts.json                          — { accounts: [{ hostname, username, password, totpSecret? }] }
 *   passkeys/<hostname>/<username>.json    — { passkey: "<serialized credential JSON>" }, keystore fallback only
 *   sessions/<hostname>/<username>.json    — serialized MyChartRequest cookie state
 *
 * The passkey gets the keystore because it is the one secret that is a login on
 * its own: a raw P-256 private key that skips both the password and 2FA. The
 * password and TOTP secret in accounts.json deserve the same treatment and do
 * not have it yet.
 *
 * Everything is keyed by (hostname, username), never by hostname alone: a
 * household shares a computer, so one hostname routinely carries several
 * logins, and setting up a second one must never touch the first one's
 * credentials, passkey or session. Passkeys and sessions are identity — a
 * hostname-keyed file would hand the previous user's WebAuthn credential to
 * whoever registered last, and the silent-login ladder would then authenticate
 * as the wrong patient.
 *
 * Hostname is lowercased + trimmed before being used in a path; usernames are
 * matched case-insensitively (MyChart logins are) and percent-encoded on disk.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { clearSecret, readSecret, writeSecret, activeBackend, type FileSlot } from './secret-store';

const ROOT = path.join(os.homedir(), '.openrecord-mcpb');
const ACCOUNTS_PATH = path.join(ROOT, 'accounts.json');
const PASSKEYS_DIR = path.join(ROOT, 'passkeys');
const SESSIONS_DIR = path.join(ROOT, 'sessions');

export interface AccountConfig {
  hostname: string;
  username: string;
  password: string;
  totpSecret?: string;
}

export function normalizeHostname(hostname: string): string {
  const trimmed = hostname.toLowerCase().trim();
  try {
    // Strips protocol and path, keeps host:port
    const parsed = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
    return parsed.host;
  } catch {
    return trimmed;
  }
}

/** MyChart usernames are case-insensitive, so "Homer" and "homer" are the same login. */
function sameUsername(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Filesystem-safe form of a username (may contain '/', ':', anything). */
function usernameKey(username: string): string {
  return encodeURIComponent(username.trim().toLowerCase());
}

/**
 * The account id: `username@hostname`, e.g. `homer@mychart.example.org`.
 * This is what list_accounts returns and the only thing tools accept as
 * `account`.
 */
export function accountId(account: Pick<AccountConfig, 'hostname' | 'username'>): string {
  return `${account.username.trim()}@${normalizeHostname(account.hostname)}`;
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

// ── Accounts ────────────────────────────────────────────────────────────────

export function readAccounts(): AccountConfig[] {
  try {
    const raw = JSON.parse(fs.readFileSync(ACCOUNTS_PATH, 'utf-8'));
    if (!Array.isArray(raw.accounts)) return [];
    return raw.accounts as AccountConfig[];
  } catch {
    return [];
  }
}

export function saveAccounts(accounts: AccountConfig[]): void {
  ensureDir(ROOT);
  fs.writeFileSync(ACCOUNTS_PATH, JSON.stringify({ accounts }, null, 2));
  try { fs.chmodSync(ACCOUNTS_PATH, 0o600); } catch { /* best effort */ }
}

export function accountsForHostname(hostname: string): AccountConfig[] {
  const normalized = normalizeHostname(hostname);
  return readAccounts().filter(a => normalizeHostname(a.hostname) === normalized);
}

export function findAccount(hostname: string, username: string): AccountConfig | undefined {
  return accountsForHostname(hostname).find(a => sameUsername(a.username, username));
}

/**
 * Resolve an `account` argument: the id is `username@hostname`, split on the
 * LAST '@' since usernames can be email addresses. A perfect hostname +
 * username match or nothing — there is deliberately no hostname-only or fuzzy
 * fallback, because a ref that "nearly" names a login resolving to some other
 * user is the wrong-identity failure this store exists to prevent.
 */
export function lookupAccount(ref: string): AccountConfig | undefined {
  const trimmed = ref.trim();
  const at = trimmed.lastIndexOf('@');
  if (at < 0) return undefined;
  return findAccount(trimmed.slice(at + 1), trimmed.slice(0, at));
}

/**
 * Insert or update the (hostname, username) row. A different username on the
 * same hostname is a NEW account alongside the existing ones — nothing is ever
 * replaced or deleted across identities, so every user's saved login keeps
 * working. Re-registering the same username updates that row in place (e.g. a
 * changed password) and keeps its passkey and session.
 */
export function upsertAccount(account: AccountConfig): void {
  const normalized = normalizeHostname(account.hostname);
  const accounts = readAccounts();
  const idx = accounts.findIndex(
    a => normalizeHostname(a.hostname) === normalized && sameUsername(a.username, account.username),
  );
  const merged = { ...account, hostname: normalized };
  if (idx >= 0) accounts[idx] = merged; else accounts.push(merged);
  saveAccounts(accounts);
}

export function removeAccount(hostname: string, username: string): boolean {
  const normalized = normalizeHostname(hostname);
  const accounts = readAccounts();
  const filtered = accounts.filter(
    a => !(normalizeHostname(a.hostname) === normalized && sameUsername(a.username, username)),
  );
  if (filtered.length === accounts.length) return false;
  saveAccounts(filtered);
  clearAccountPasskey(hostname, username);
  clearAccountSession(hostname, username);
  return true;
}

/**
 * Store the TOTP secret produced by the `setup_totp` capability, so later
 * logins can generate their own codes instead of waiting on an emailed one.
 * No-ops when the (hostname, username) pair has no saved account — there is
 * nothing to attach the secret to, and inventing an account row here would
 * leave a credential entry with no password.
 */
export function saveAccountTotpSecret(hostname: string, username: string, totpSecret: string): boolean {
  const normalized = normalizeHostname(hostname);
  const accounts = readAccounts();
  const idx = accounts.findIndex(
    a => normalizeHostname(a.hostname) === normalized && sameUsername(a.username, username),
  );
  const existing = accounts[idx];
  if (!existing) return false;
  accounts[idx] = { ...existing, totpSecret };
  saveAccounts(accounts);
  return true;
}

// ── Passkeys ────────────────────────────────────────────────────────────────

function passkeyPath(hostname: string, username: string): string {
  return path.join(PASSKEYS_DIR, normalizeHostname(hostname), `${usernameKey(username)}.json`);
}

/**
 * The keystore item name. Human-readable on purpose: this is what shows up in
 * Keychain Access and in the Windows Credential Manager, and a user auditing
 * what OpenRecord stored should be able to tell whose passkey each item is.
 *
 * Same (hostname, username) normalisation as the file layout, so the two agree
 * on identity and migration lands on the right item.
 */
function passkeyKey(hostname: string, username: string): string {
  return `passkey:${normalizeHostname(hostname)}:${usernameKey(username)}`;
}

/**
 * The pre-keystore plaintext file for one passkey. Still the fallback when no
 * keystore answers, and still read once on migration, so its shape is frozen.
 */
function passkeySlot(hostname: string, username: string): FileSlot {
  const p = passkeyPath(hostname, username);
  return {
    read() {
      try {
        const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
        return data?.passkey || undefined;
      } catch {
        return undefined;
      }
    },
    write(secret: string) {
      ensureDir(path.dirname(p));
      fs.writeFileSync(p, JSON.stringify({ passkey: secret }, null, 2));
      try { fs.chmodSync(p, 0o600); } catch { /* best effort */ }
    },
    clear() {
      try { fs.unlinkSync(p); } catch { /* ignore */ }
    },
  };
}

export function readAccountPasskey(hostname: string, username: string): string | undefined {
  return readSecret(passkeyKey(hostname, username), passkeySlot(hostname, username));
}

export function saveAccountPasskey(hostname: string, username: string, serialized: string): void {
  writeSecret(passkeyKey(hostname, username), serialized, passkeySlot(hostname, username));
}

export function clearAccountPasskey(hostname: string, username: string): void {
  clearSecret(passkeyKey(hostname, username), passkeySlot(hostname, username));
}

/** Where passkeys are actually being stored, for `list_accounts` diagnostics. */
export function passkeyBackend(): string {
  return activeBackend();
}

// ── Sessions (serialized MyChartRequest cookie state) ───────────────────────

function sessionPath(hostname: string, username: string): string {
  return path.join(SESSIONS_DIR, normalizeHostname(hostname), `${usernameKey(username)}.json`);
}

export function readAccountSession(hostname: string, username: string): string | undefined {
  try {
    return fs.readFileSync(sessionPath(hostname, username), 'utf-8');
  } catch {
    return undefined;
  }
}

export function saveAccountSession(hostname: string, username: string, serialized: string): void {
  const p = sessionPath(hostname, username);
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, serialized);
  try { fs.chmodSync(p, 0o600); } catch { /* best effort */ }
}

export function clearAccountSession(hostname: string, username: string): void {
  try { fs.unlinkSync(sessionPath(hostname, username)); } catch { /* ignore */ }
}

// ── Diagnostics ─────────────────────────────────────────────────────────────

export const _paths = { ROOT, ACCOUNTS_PATH, PASSKEYS_DIR, SESSIONS_DIR };
