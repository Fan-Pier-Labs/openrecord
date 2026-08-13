/**
 * Disk-backed credential storage for the OpenRecord MCPB.
 *
 * All files live under ~/.openrecord-mcpb/:
 *   accounts.json                          — { accounts: [{ hostname, username, password, totpSecret? }] }
 *   passkeys/<hostname>.json               — { passkey: "<serialized credential JSON>" }
 *   sessions/<hostname>.json               — serialized MyChartRequest cookie state
 *
 * Hostname is always lowercased + trimmed before being used in a path.
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

/** MyChart usernames are case-insensitive, so "Homer" and "homer" are the same login. */
function sameUsername(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function upsertAccount(account: AccountConfig): void {
  const accounts = readAccounts();
  const normalized = normalizeHostname(account.hostname);
  const idx = accounts.findIndex(a => normalizeHostname(a.hostname) === normalized);
  const merged = { ...account, hostname: normalized };
  if (idx >= 0) {
    // Passkeys and sessions are keyed by hostname alone, so replacing the row
    // with a DIFFERENT user's credentials must take the old user's files with
    // it: the silent-login ladder tries the saved passkey first, and a leftover
    // one authenticates as the previous user while accounts.json names the new
    // one — every later scrape would read the wrong patient's chart. Clearing
    // the passkey also lets auto-registration mint one for the new user instead
    // of short-circuiting on `already_saved`.
    if (!sameUsername(accounts[idx].username, merged.username)) {
      clearAccountPasskey(normalized);
      clearAccountSession(normalized);
    }
    accounts[idx] = merged;
  } else {
    accounts.push(merged);
  }
  saveAccounts(accounts);
}

export function removeAccount(hostname: string): boolean {
  const accounts = readAccounts();
  const normalized = normalizeHostname(hostname);
  const filtered = accounts.filter(a => normalizeHostname(a.hostname) !== normalized);
  if (filtered.length === accounts.length) return false;
  saveAccounts(filtered);
  clearAccountPasskey(hostname);
  clearAccountSession(hostname);
  return true;
}

export function findAccount(hostname: string): AccountConfig | undefined {
  const normalized = normalizeHostname(hostname);
  return readAccounts().find(a => normalizeHostname(a.hostname) === normalized);
}

/**
 * Store the TOTP secret produced by the `setup_totp` capability, so later
 * logins can generate their own codes instead of waiting on an emailed one.
 * No-ops when the hostname has no saved account — there is nothing to attach
 * the secret to, and inventing an account row here would leave a credential
 * entry with no username or password.
 */
export function saveAccountTotpSecret(hostname: string, totpSecret: string): boolean {
  const accounts = readAccounts();
  const normalized = normalizeHostname(hostname);
  const idx = accounts.findIndex(a => normalizeHostname(a.hostname) === normalized);
  if (idx < 0) return false;
  accounts[idx] = { ...accounts[idx], totpSecret };
  saveAccounts(accounts);
  return true;
}

// ── Passkeys ────────────────────────────────────────────────────────────────

function passkeyPath(hostname: string): string {
  return path.join(PASSKEYS_DIR, `${normalizeHostname(hostname)}.json`);
}

export function readAccountPasskey(hostname: string): string | undefined {
  try {
    const data = JSON.parse(fs.readFileSync(passkeyPath(hostname), 'utf-8'));
    return data?.passkey || undefined;
  } catch {
    return undefined;
  }
}

export function saveAccountPasskey(hostname: string, serialized: string): void {
  ensureDir(PASSKEYS_DIR);
  const p = passkeyPath(hostname);
  fs.writeFileSync(p, JSON.stringify({ passkey: serialized }, null, 2));
  try { fs.chmodSync(p, 0o600); } catch { /* best effort */ }
}

export function clearAccountPasskey(hostname: string): void {
  try { fs.unlinkSync(passkeyPath(hostname)); } catch { /* ignore */ }
}

// ── Sessions (serialized MyChartRequest cookie state) ───────────────────────

function sessionPath(hostname: string): string {
  return path.join(SESSIONS_DIR, `${normalizeHostname(hostname)}.json`);
}

export function readAccountSession(hostname: string): string | undefined {
  try {
    return fs.readFileSync(sessionPath(hostname), 'utf-8');
  } catch {
    return undefined;
  }
}

export function saveAccountSession(hostname: string, serialized: string): void {
  ensureDir(SESSIONS_DIR);
  const p = sessionPath(hostname);
  fs.writeFileSync(p, serialized);
  try { fs.chmodSync(p, 0o600); } catch { /* best effort */ }
}

export function clearAccountSession(hostname: string): void {
  try { fs.unlinkSync(sessionPath(hostname)); } catch { /* ignore */ }
}

// ── Diagnostics ─────────────────────────────────────────────────────────────

export const _paths = { ROOT, ACCOUNTS_PATH, PASSKEYS_DIR, SESSIONS_DIR };
