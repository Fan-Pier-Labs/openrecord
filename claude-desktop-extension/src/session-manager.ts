// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * Multi-account session manager for the OpenRecord MCPB.
 *
 * - One `MyChartRequest` per account — (hostname, username), NOT per hostname:
 *   a family shares a computer, so one hostname can carry several logins, each
 *   with its own cookies, passkey and renewal credentials. Kept warm by the
 *   shared sessionStore keepalive (30s /Home/KeepAlive pings, matching
 *   MyChart's own JS).
 * - On first use: try the on-disk cookie cache, then the shared silent login
 *   ladder (saved passkey with signature-counter retry → saved password →
 *   TOTP secret).
 * - Every session carries a `reauthenticate` hook, so an expiry mid-scrape is
 *   renewed transparently by makeAuthenticatedRequest instead of failing the
 *   tool call. (The keepalive never renews: a dead heartbeat only marks the
 *   session expired until the next real request.)
 * - Persists cookie state to disk after login and after every renewal so a
 *   Claude Desktop restart doesn't force a fresh login.
 *
 * Multiple accounts can be active simultaneously — every call carries an
 * explicit account id (`username@hostname`), so there is no "active account"
 * state to track.
 */

import { MyChartRequest } from '../../scrapers/myChart/core/myChartRequest';
import { areCookiesValid } from '../../scrapers/myChart/auth/login';
import { silentLogin, wireSilentReauthentication, type SilentLoginParams } from '../../scrapers/myChart/auth/silentLogin';
import { sessionStore } from '../../scrapers/myChart/core/sessionStore';
import {
  deserializeCredential,
  serializeCredential,
} from '../../scrapers/myChart/auth/softwareAuthenticator';
import {
  type AccountIdentity,
  accountId,
  findAccount,
  lookupIdentity,
  readAccounts,
  readAccountPasskey,
  readAccountSession,
  saveAccountPasskey,
  saveAccountSession,
  clearAccountPasskey,
  clearAccountSession,
  normalizeHostname,
} from './credential-store';

const sessions = new Map<string, MyChartRequest>();
const loginLocks = new Map<string, Promise<MyChartRequest>>();

/**
 * In-memory map key for one account. Hostname is normalized and the username
 * lowercased, so every spelling of the same login lands on the same session.
 */
function sessionKey(hostname: string, username: string): string {
  return `${normalizeHostname(hostname)}\0${username.trim().toLowerCase()}`;
}

// ── Inspection ──────────────────────────────────────────────────────────────

/** Whether an in-memory session exists for the account `ref` names. */
export function isConnected(ref: string): boolean {
  const account = lookupIdentity(ref);
  if (!account) return false;
  return sessions.has(sessionKey(account.hostname, account.username));
}

/** The in-memory session for the account `ref` names, if one is open. Never logs in. */
export function openSession(ref: string): MyChartRequest | undefined {
  const account = lookupIdentity(ref);
  return account ? sessions.get(sessionKey(account.hostname, account.username)) : undefined;
}

export function clearSession(ref: string): void {
  const account = lookupIdentity(ref);
  if (!account) return;
  const key = sessionKey(account.hostname, account.username);
  const session = sessions.get(key);
  if (session) sessionStore.unregister(session);
  sessions.delete(key);
  loginLocks.delete(key);
}

export function clearAllSessions(): void {
  for (const [, session] of sessions) {
    sessionStore.unregister(session);
  }
  sessions.clear();
  loginLocks.clear();
  sessionStore.stopKeepalive();
}

// ── Login (cookie cache → passkey → user/pass + optional TOTP) ──────────────

/**
 * Try to restore a session from the on-disk cookie cache. Returns null if
 * no cache exists or the cached cookies have expired.
 */
async function tryRestoreSession(hostname: string, username: string): Promise<MyChartRequest | null> {
  const cached = readAccountSession(hostname, username);
  if (!cached) return null;
  try {
    const req = await MyChartRequest.unserialize(cached);
    if (!req) return null;
    if (await areCookiesValid(req)) return req;
  } catch {
    // fall through
  }
  clearAccountSession(hostname, username);
  return null;
}

/**
 * The non-interactive credential set for one account, read fresh from disk so
 * a renewal picks up anything saved since login (an updated password, a
 * passkey registered mid-session).
 */
function silentLoginParams(hostname: string, username: string): SilentLoginParams {
  const account = findAccount(hostname, username);
  const passkeySerialized = readAccountPasskey(hostname, username);
  let passkey = null;
  if (passkeySerialized) {
    try {
      passkey = deserializeCredential(passkeySerialized);
    } catch {
      // Corrupt passkey file — fall back to password.
    }
  }
  return {
    hostname,
    username: account?.username ?? username,
    password: account?.password,
    totpSecret: account?.totpSecret,
    passkey,
    onPasskeyUsed: (credential) => saveAccountPasskey(hostname, username, serializeCredential(credential)),
    onPasskeyInvalid: () => clearAccountPasskey(hostname, username),
  };
}

async function loginAccount(account: AccountIdentity): Promise<MyChartRequest> {
  const hostname = normalizeHostname(account.hostname);
  const id = accountId(account);

  const restored = await tryRestoreSession(hostname, account.username);
  if (restored) return restored;

  const outcome = await silentLogin(silentLoginParams(hostname, account.username));
  if (outcome.state === 'logged_in') {
    await persistSession(hostname, account.username, outcome.mychartRequest);
    return outcome.mychartRequest;
  }

  if (outcome.reason.includes('2FA required')) {
    throw new Error(`MyChart requires 2FA for ${id} and no passkey or TOTP is saved. Run setup_account to register one.`);
  }
  throw new Error(`Login failed for ${id}: ${outcome.reason}. Run setup_account to update credentials.`);
}

export async function persistSession(hostname: string, username: string, req: MyChartRequest): Promise<void> {
  try {
    saveAccountSession(hostname, username, await req.serialize());
  } catch (err) {
    console.error(`[openrecord:${normalizeHostname(hostname)}] failed to persist session: ${(err as Error).message}`);
  }
}

// ── Session lifecycle (renewal hook + keepalive + lazy login) ───────────────

/**
 * Turn a freshly acquired session into a managed one: wire the silent
 * re-login hook (this is what makes mid-scrape expiry invisible to tools) and
 * enroll it in the shared keepalive heartbeat.
 */
function manageSession(hostname: string, username: string, session: MyChartRequest): MyChartRequest {
  wireSilentReauthentication(
    session,
    () => silentLoginParams(hostname, username),
    (renewed) => persistSession(hostname, username, renewed),
  );
  sessionStore.registerForKeepalive(session);
  sessions.set(sessionKey(hostname, username), session);
  return session;
}

async function ensureAccountSession(account: AccountIdentity): Promise<MyChartRequest> {
  const hostname = normalizeHostname(account.hostname);
  const key = sessionKey(hostname, account.username);

  // An existing session is simply returned — expiry is handled at request
  // time by the renewal hook, so there is no "expired" flag to check here.
  const existing = sessions.get(key);
  if (existing) return existing;

  const lock = loginLocks.get(key);
  if (lock) return lock;

  const promise = loginAccount(account).then(session => {
    manageSession(hostname, account.username, session);
    loginLocks.delete(key);
    return session;
  }).catch((err: unknown) => {
    loginLocks.delete(key);
    throw err;
  });

  loginLocks.set(key, promise);
  return promise;
}

/**
 * Get a logged-in MyChartRequest for the given account id. The id must be an
 * exact `username@hostname` match — anything else throws, listing the
 * configured ids.
 */
export async function resolveSession(ref: string): Promise<MyChartRequest> {
  if (!ref) {
    throw new Error('account is required. Call list_accounts to see configured account IDs, then pass one as `account`.');
  }
  const account = lookupIdentity(ref);
  if (!account) {
    const available = readAccounts().map(accountId);
    throw new Error(
      available.length === 0
        ? `No MyChart accounts configured. Call setup_account first.`
        : `Account "${ref}" is not configured. Configured accounts: ${available.join(', ')}.`,
    );
  }
  return ensureAccountSession(account);
}

/**
 * Adopt an already-logged-in session (e.g. produced by setup_account or
 * complete_2fa) into the session manager so subsequent tool calls reuse
 * the cookies + benefit from renewal and keepalive.
 */
export async function adoptSession(hostname: string, username: string, session: MyChartRequest): Promise<void> {
  const key = sessionKey(hostname, username);
  const existing = sessions.get(key);
  if (existing) sessionStore.unregister(existing);
  sessions.delete(key);
  loginLocks.delete(key);
  await persistSession(hostname, username, session);
  manageSession(normalizeHostname(hostname), username, session);
}
