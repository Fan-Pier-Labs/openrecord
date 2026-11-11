// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * Multi-account session manager for the OpenRecord MCPB.
 *
 * - One `MyChartRequest` per account — (hostname, username), NOT per hostname:
 *   a family shares a computer, so one hostname can carry several logins, each
 *   with its own cookies, passkey and renewal credentials. Kept warm by the
 *   shared sessionStore keepalive (30s /Home/KeepAlive pings, matching
 *   MyChart's own JS).
 * - On first use: try the on-disk cookie cache, then `humanLogin` (saved
 *   passkey with signature-counter retry → saved password → TOTP secret →
 *   otherwise MyChart sends the user a code). A tool call is human-triggered —
 *   the user asked Claude, Claude called the tool — and Claude can relay the
 *   code back through complete_2fa, so it may send one. See
 *   docs/login-modes.md.
 * - Every session carries a `reauthenticate` hook, so an expiry mid-scrape is
 *   renewed transparently by makeAuthenticatedRequest instead of failing the
 *   tool call. That hook is `machineLogin`: it runs mid-request, where nobody
 *   could hand it a code, so it never sends one. (The keepalive never renews:
 *   a dead heartbeat only marks the session expired until the next real
 *   request.)
 * - Persists cookie state to disk after login and after every renewal so a
 *   Claude Desktop restart doesn't force a fresh login.
 *
 * Multiple accounts can be active simultaneously — every call carries an
 * explicit account id (`username@hostname`), so there is no "active account"
 * state to track.
 */

import { MyChartRequest } from '../../scrapers/myChart/core/myChartRequest';
import { areCookiesValid } from '../../scrapers/myChart/auth/login';
import { humanLogin, machineLogin, wireSilentReauthentication, type StoredLoginParams } from '../../scrapers/myChart/auth/loginModes';
import type { TwoFaDeliveryInfo } from '../../scrapers/myChart/auth/login';
import { addPending, findPendingFor } from './pending-logins';
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
  loginLocks.delete(lockKey(key, 'human'));
  loginLocks.delete(lockKey(key, 'machine'));
}

export function clearAllSessions(): void {
  for (const [, session] of sessions) {
    sessionStore.unregister(session);
  }
  sessions.clear();
  loginLocks.clear();
  sessionStore.stopKeepalive();
}

// ── Login (cookie cache → passkey → user/pass → TOTP or a sent code) ────────

/**
 * Signing in to answer a tool call made MyChart send the user a code. Not a
 * failure: the tool hands Claude the pending_id to finish with complete_2fa.
 * The message carries no contact details — errors reach telemetry.
 */
export class NeedsTwoFactorError extends Error {
  constructor(
    readonly account: string,
    readonly pendingId: string,
    readonly delivery: TwoFaDeliveryInfo | undefined,
  ) {
    super(`MyChart sent a verification code to sign in to ${account}.`);
    this.name = 'NeedsTwoFactorError';
  }
}

/**
 * A machine-mode sign-in hit 2FA with nothing stored that answers it. No code
 * was sent; retrying won't help until the user signs in, or saves a passkey
 * or an authenticator app.
 */
export class NeedsHumanSignInError extends Error {
  constructor(readonly account: string) {
    super(`MyChart needs a verification code to sign in to ${account}, and no passkey or authenticator app is saved for it.`);
    this.name = 'NeedsHumanSignInError';
  }
}

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
 * The stored credential set for one account, read fresh from disk so a
 * renewal picks up anything saved since login (an updated password, a passkey
 * registered mid-session).
 */
function storedLoginParams(hostname: string, username: string): StoredLoginParams {
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
    trustedDeviceId: account?.trustedDeviceId,
    passkey,
    onPasskeyUsed: (credential) => saveAccountPasskey(hostname, username, serializeCredential(credential)),
    onPasskeyInvalid: () => clearAccountPasskey(hostname, username),
  };
}

async function loginAccountAsHuman(account: AccountIdentity): Promise<MyChartRequest> {
  const hostname = normalizeHostname(account.hostname);
  const id = accountId(account);

  const restored = await tryRestoreSession(hostname, account.username);
  if (restored) return restored;

  // A code is already on its way for this account — hand back the same
  // pending login instead of making MyChart send another.
  const waiting = findPendingFor(hostname, account.username);
  if (waiting) throw new NeedsTwoFactorError(id, waiting.id, waiting.delivery);

  const params = storedLoginParams(hostname, account.username);
  const outcome = await humanLogin(params);
  switch (outcome.state) {
    case 'logged_in':
      await persistSession(hostname, account.username, outcome.mychartRequest);
      return outcome.mychartRequest;
    case 'need_2fa': {
      const pendingId = addPending({
        hostname,
        username: account.username,
        // need_2fa is only reached through the password rung.
        password: params.password ?? '',
        mychartRequest: outcome.mychartRequest,
        delivery: outcome.delivery,
      });
      throw new NeedsTwoFactorError(id, pendingId, outcome.delivery);
    }
    case 'invalid_login':
      throw new Error(`MyChart rejected the saved password for ${id}. Ask the user for the current one and run setup_account.`);
    case 'failed':
      throw new Error(`Login failed for ${id}: ${outcome.reason}. Run setup_account to update credentials.`);
  }
}

/** Sign in with nobody waiting on a code. Never makes MyChart send one. */
async function loginAccountAsMachine(account: AccountIdentity): Promise<MyChartRequest> {
  const hostname = normalizeHostname(account.hostname);
  const id = accountId(account);

  const restored = await tryRestoreSession(hostname, account.username);
  if (restored) return restored;

  const outcome = await machineLogin(storedLoginParams(hostname, account.username));
  switch (outcome.state) {
    case 'logged_in':
      await persistSession(hostname, account.username, outcome.mychartRequest);
      return outcome.mychartRequest;
    case 'needs_human':
      throw new NeedsHumanSignInError(id);
    case 'failed':
      throw new Error(`Login failed for ${id}: ${outcome.reason}.`);
  }
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
 * Turn a freshly acquired session into a managed one: wire the machine-mode
 * re-login hook (this is what makes mid-scrape expiry invisible to tools) and
 * enroll it in the shared keepalive heartbeat.
 */
function manageSession(hostname: string, username: string, session: MyChartRequest): MyChartRequest {
  wireSilentReauthentication(
    session,
    () => storedLoginParams(hostname, username),
    (renewed) => persistSession(hostname, username, renewed),
  );
  sessionStore.registerForKeepalive(session);
  sessions.set(sessionKey(hostname, username), session);
  return session;
}

type LoginMode = 'human' | 'machine';

/** One in-flight sign-in per account AND mode: a human caller must not inherit a machine sign-in's needs_human. */
function lockKey(key: string, mode: LoginMode): string {
  return `${key}\0${mode}`;
}

async function ensureAccountSession(account: AccountIdentity, mode: LoginMode): Promise<MyChartRequest> {
  const hostname = normalizeHostname(account.hostname);
  const key = sessionKey(hostname, account.username);

  // An existing session is simply returned — expiry is handled at request
  // time by the renewal hook, so there is no "expired" flag to check here.
  const existing = sessions.get(key);
  if (existing) return existing;

  const lk = lockKey(key, mode);
  const lock = loginLocks.get(lk);
  if (lock) return lock;

  const login = mode === 'human' ? loginAccountAsHuman : loginAccountAsMachine;
  const promise = login(account).then(session => {
    manageSession(hostname, account.username, session);
    loginLocks.delete(lk);
    return session;
  }).catch((err: unknown) => {
    loginLocks.delete(lk);
    throw err;
  });

  loginLocks.set(lk, promise);
  return promise;
}

function requireAccount(ref: string): AccountIdentity {
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
  return account;
}

/**
 * Get a logged-in MyChartRequest for the given account id, for a tool call —
 * human mode: signing in may make MyChart send a code, surfaced as
 * NeedsTwoFactorError. The id must be an exact `username@hostname` match —
 * anything else throws, listing the configured ids.
 */
export async function resolveSession(ref: string): Promise<MyChartRequest> {
  return ensureAccountSession(requireAccount(ref), 'human');
}

/**
 * The same, for work nobody is waiting on (a background sync). Machine mode:
 * never sends a code; throws NeedsHumanSignInError when only a code would do.
 */
export async function resolveSessionWithoutUser(ref: string): Promise<MyChartRequest> {
  return ensureAccountSession(requireAccount(ref), 'machine');
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
  loginLocks.delete(lockKey(key, 'human'));
  loginLocks.delete(lockKey(key, 'machine'));
  await persistSession(hostname, username, session);
  manageSession(normalizeHostname(hostname), username, session);
}
