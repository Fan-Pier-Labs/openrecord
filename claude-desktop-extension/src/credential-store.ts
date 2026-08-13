/**
 * Disk-backed credential storage for the OpenRecord MCPB.
 *
 * All files live under ~/.openrecord-mcpb/:
 *   accounts.json                          — { accounts: [{ hostname, username, password, totpSecret? }] }
 *   passkeys/<hostname>/<username>.json    — { passkey: "<serialized credential JSON>" }
 *   sessions/<hostname>/<username>.json    — serialized MyChartRequest cookie state
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
  const existing = idx < 0 ? undefined : accounts[idx];
  if (!existing) return false;
  accounts[idx] = { ...existing, totpSecret };
  saveAccounts(accounts);
  return true;
}

// ── Passkeys ────────────────────────────────────────────────────────────────

function passkeyPath(hostname: string, username: string): string {
  return path.join(PASSKEYS_DIR, normalizeHostname(hostname), `${usernameKey(username)}.json`);
}

export function readAccountPasskey(hostname: string, username: string): string | undefined {
  try {
    const data = JSON.parse(fs.readFileSync(passkeyPath(hostname, username), 'utf-8'));
    return data?.passkey || undefined;
  } catch {
    return undefined;
  }
}

export function saveAccountPasskey(hostname: string, username: string, serialized: string): void {
  const p = passkeyPath(hostname, username);
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify({ passkey: serialized }, null, 2));
  try { fs.chmodSync(p, 0o600); } catch { /* best effort */ }
}

export function clearAccountPasskey(hostname: string, username: string): void {
  try { fs.unlinkSync(passkeyPath(hostname, username)); } catch { /* ignore */ }
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
