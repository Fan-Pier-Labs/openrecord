/**
 * Credential storage for the OpenRecord MCPB.
 *
 * Every secret goes to the OS keystore — the macOS Keychain, the Windows
 * Credential Manager, or the Secret Service on Linux — via `secret-store.ts`,
 * which falls back to the files below wherever no keystore answers. Three items
 * per identity, under service `openrecord-mcpb`:
 *   password:<hostname>:<username>
 *   totp:<hostname>:<username>
 *   passkey:<hostname>:<username>
 *
 * What stays on disk under ~/.openrecord-mcpb/:
 *   accounts.json                          — the index: { accounts: [{ hostname, username }] }.
 *                                            Also holds password/totpSecret inline when there is
 *                                            no keystore, which is where every pre-keystore
 *                                            install left them.
 *   passkeys/<hostname>/<username>.json    — keystore fallback only
 *   sessions/<hostname>/<username>.json    — serialized MyChartRequest cookie state. Cookies are
 *                                            bearer credentials too, but they expire and the
 *                                            silent-login ladder just re-mints them.
 *
 * Migration is a side effect of reading: a secret found in the old file
 * location is written to the keystore and removed from the file, so an upgrade
 * costs nobody a re-login.
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

import { clearSecret, readSecret, writeSecret, activeBackend, type BackendName, type FileSlot } from './secret-store';

const ROOT = path.join(os.homedir(), '.openrecord-mcpb');
const ACCOUNTS_PATH = path.join(ROOT, 'accounts.json');
const PASSKEYS_DIR = path.join(ROOT, 'passkeys');
const SESSIONS_DIR = path.join(ROOT, 'sessions');

export interface AccountConfig {
  hostname: string;
  username: string;
  password: string;
  // Hydrated from the keystore, which returns undefined for "nothing saved".
  // `AccountRow` is the persisted shape; this one is in-memory only.
  totpSecret?: string | undefined;
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

/**
 * A row as it sits in accounts.json. With a keystore this is just the index —
 * which logins exist — and `password`/`totpSecret` are absent. They are still
 * declared because that is exactly where they live when there is no keystore,
 * and where every install written before this change left them.
 */
interface AccountRow {
  hostname: string;
  username: string;
  password?: string;
  totpSecret?: string;
}

function readRows(): AccountRow[] {
  try {
    const raw = JSON.parse(fs.readFileSync(ACCOUNTS_PATH, 'utf-8'));
    if (!Array.isArray(raw.accounts)) return [];
    return raw.accounts as AccountRow[];
  } catch {
    return [];
  }
}

function writeRows(accounts: AccountRow[]): void {
  ensureDir(ROOT);
  fs.writeFileSync(ACCOUNTS_PATH, JSON.stringify({ accounts }, null, 2));
  try { fs.chmodSync(ACCOUNTS_PATH, 0o600); } catch { /* best effort */ }
}

function rowIndex(rows: AccountRow[], hostname: string, username: string): number {
  const normalized = normalizeHostname(hostname);
  return rows.findIndex(
    r => normalizeHostname(r.hostname) === normalized && sameUsername(r.username, username),
  );
}

/** Keystore item names. One per secret per identity, same shape as the passkey's. */
function passwordKey(hostname: string, username: string): string {
  return `password:${normalizeHostname(hostname)}:${usernameKey(username)}`;
}
function totpKey(hostname: string, username: string): string {
  return `totp:${normalizeHostname(hostname)}:${usernameKey(username)}`;
}

/**
 * The accounts.json field a secret used to live in — the fallback when there is
 * no keystore, and the source `readSecret` migrates from on the first read
 * after an upgrade. Writing through it never invents a row: `upsertAccount`
 * puts the index row down first, and a secret with no login to attach it to is
 * a credential entry nobody can use.
 */
function accountFieldSlot(
  hostname: string,
  username: string,
  field: 'password' | 'totpSecret',
): FileSlot {
  return {
    read() {
      const rows = readRows();
      return rows[rowIndex(rows, hostname, username)]?.[field];
    },
    write(secret: string) {
      const rows = readRows();
      const idx = rowIndex(rows, hostname, username);
      const existing = rows[idx];
      if (!existing) return;
      rows[idx] = { ...existing, [field]: secret };
      writeRows(rows);
    },
    clear() {
      const rows = readRows();
      const idx = rowIndex(rows, hostname, username);
      const existing = rows[idx];
      if (existing?.[field] === undefined) return;
      const { [field]: _dropped, ...rest } = existing;
      rows[idx] = rest;
      writeRows(rows);
    },
  };
}

/**
 * Every account, with its secrets resolved from wherever they actually live.
 *
 * The hydration is why callers can keep treating `AccountConfig` as a plain
 * object: moving the password and TOTP secret into the keystore changed where
 * they are persisted, not what a caller sees. A legacy row that still carries
 * them inline is migrated by `readSecret` on the way past.
 */
export function readAccounts(): AccountConfig[] {
  return readRows().map(row => ({
    hostname: row.hostname,
    username: row.username,
    password:
      readSecret(
        passwordKey(row.hostname, row.username),
        accountFieldSlot(row.hostname, row.username, 'password'),
      ) ?? '',
    totpSecret: readSecret(
      totpKey(row.hostname, row.username),
      accountFieldSlot(row.hostname, row.username, 'totpSecret'),
    ),
  }));
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
  const { hostname, username } = account;
  const normalized = normalizeHostname(hostname);
  const rows = readRows();
  const idx = rowIndex(rows, hostname, username);
  // The index row carries no secrets. It goes down FIRST, because the file
  // fallback attaches secrets to an existing row and will not invent one.
  const row: AccountRow = { hostname: normalized, username };
  if (idx >= 0) rows[idx] = row; else rows.push(row);
  writeRows(rows);

  writeSecret(passwordKey(hostname, username), account.password, accountFieldSlot(hostname, username, 'password'));
  if (account.totpSecret !== undefined) {
    writeSecret(totpKey(hostname, username), account.totpSecret, accountFieldSlot(hostname, username, 'totpSecret'));
  }
}

export function removeAccount(hostname: string, username: string): boolean {
  const rows = readRows();
  const idx = rowIndex(rows, hostname, username);
  if (idx < 0) return false;
  // Secrets first: dropping the row before clearing them would strip the file
  // fallback's own storage out from under it and orphan the keystore items.
  clearSecret(passwordKey(hostname, username), accountFieldSlot(hostname, username, 'password'));
  clearSecret(totpKey(hostname, username), accountFieldSlot(hostname, username, 'totpSecret'));
  clearAccountPasskey(hostname, username);
  clearAccountSession(hostname, username);

  const remaining = readRows();
  const stillThere = rowIndex(remaining, hostname, username);
  if (stillThere >= 0) remaining.splice(stillThere, 1);
  writeRows(remaining);
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
  const rows = readRows();
  if (rowIndex(rows, hostname, username) < 0) return false;
  writeSecret(totpKey(hostname, username), totpSecret, accountFieldSlot(hostname, username, 'totpSecret'));
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

/**
 * Where secrets are actually being stored, for `list_accounts` diagnostics and
 * for telling a patient where a passkey would land. Returns the union, not
 * `string`: callers pair it with `BACKEND_DESCRIPTION`, which only stays
 * exhaustive if the backend keeps its type on the way out.
 */
export function secretBackend(): BackendName {
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
