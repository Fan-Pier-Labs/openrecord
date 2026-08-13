/**
 * Multi-account session manager for the OpenRecord MCPB.
 *
 * - One `MyChartRequest` per hostname, kept warm by the shared sessionStore
 *   keepalive (30s /Home/KeepAlive pings, matching MyChart's own JS).
 * - On first use: try the on-disk cookie cache, then the shared silent login
 *   ladder (saved passkey with signature-counter retry → saved password →
 *   TOTP secret).
 * - Every session carries a `reauthenticate` hook, so an expiry mid-scrape is
 *   renewed transparently by makeAuthenticatedRequest (and proactively by the
 *   keepalive when a heartbeat reports the session dead) instead of failing
 *   the tool call.
 * - Persists cookie state to disk after login and after every renewal so a
 *   Claude Desktop restart doesn't force a fresh login.
 *
 * Multiple accounts can be active simultaneously — every call carries an
 * explicit hostname, so there is no "active account" state to track.
 */

import { MyChartRequest } from '../../scrapers/myChart/myChartRequest';
import { areCookiesValid } from '../../scrapers/myChart/login';
import { silentLogin, wireSilentReauthentication, type SilentLoginParams } from '../../scrapers/myChart/silentLogin';
import { sessionStore } from '../../scrapers/myChart/sessionStore';
import {
  deserializeCredential,
  serializeCredential,
} from '../../scrapers/myChart/softwareAuthenticator';
import {
  type AccountConfig,
  findAccount,
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

// ── Inspection ──────────────────────────────────────────────────────────────

export function isConnected(hostname: string): boolean {
  return sessions.has(normalizeHostname(hostname));
}

export function clearSession(hostname: string): void {
  const key = normalizeHostname(hostname);
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
async function tryRestoreSession(hostname: string): Promise<MyChartRequest | null> {
  const cached = readAccountSession(hostname);
  if (!cached) return null;
  try {
    const req = await MyChartRequest.unserialize(cached);
    if (!req) return null;
    if (await areCookiesValid(req)) return req;
  } catch {
    // fall through
  }
  clearAccountSession(hostname);
  return null;
}

/**
 * The non-interactive credential set for a hostname, read fresh from disk so
 * a renewal picks up anything saved since login (an updated password, a
 * passkey registered mid-session).
 */
function silentLoginParams(hostname: string): SilentLoginParams {
  const account = findAccount(hostname);
  const passkeySerialized = readAccountPasskey(hostname);
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
    username: account?.username,
    password: account?.password,
    totpSecret: account?.totpSecret,
    passkey,
    onPasskeyUsed: (credential) => saveAccountPasskey(hostname, serializeCredential(credential)),
    onPasskeyInvalid: () => clearAccountPasskey(hostname),
  };
}

async function loginAccount(account: AccountConfig): Promise<MyChartRequest> {
  const hostname = normalizeHostname(account.hostname);

  const restored = await tryRestoreSession(hostname);
  if (restored) return restored;

  const outcome = await silentLogin(silentLoginParams(hostname));
  if (outcome.state === 'logged_in') {
    await persistSession(hostname, outcome.mychartRequest);
    return outcome.mychartRequest;
  }

  if (outcome.reason.includes('2FA required')) {
    throw new Error(`MyChart requires 2FA for ${hostname} and no passkey or TOTP is saved. Run setup_account to register one.`);
  }
  throw new Error(`Login failed for ${hostname}: ${outcome.reason}. Run setup_account to update credentials.`);
}

export async function persistSession(hostname: string, req: MyChartRequest): Promise<void> {
  try {
    saveAccountSession(hostname, await req.serialize());
  } catch (err) {
    console.error(`[openrecord:${hostname}] failed to persist session: ${(err as Error).message}`);
  }
}

// ── Session lifecycle (renewal hook + keepalive + lazy login) ───────────────

/**
 * Turn a freshly acquired session into a managed one: wire the silent
 * re-login hook (this is what makes mid-scrape expiry invisible to tools) and
 * enroll it in the shared keepalive heartbeat.
 */
function manageSession(key: string, session: MyChartRequest): MyChartRequest {
  wireSilentReauthentication(
    session,
    () => silentLoginParams(key),
    (renewed) => persistSession(key, renewed),
  );
  sessionStore.registerForKeepalive(session);
  sessions.set(key, session);
  return session;
}

async function ensureAccountSession(account: AccountConfig): Promise<MyChartRequest> {
  const key = normalizeHostname(account.hostname);

  // An existing session is simply returned — expiry is handled at request
  // time by the renewal hook, so there is no "expired" flag to check here.
  const existing = sessions.get(key);
  if (existing) return existing;

  const lock = loginLocks.get(key);
  if (lock) return lock;

  const promise = loginAccount(account).then(session => {
    manageSession(key, session);
    loginLocks.delete(key);
    return session;
  }).catch(err => {
    loginLocks.delete(key);
    throw err;
  });

  loginLocks.set(key, promise);
  return promise;
}

/**
 * Get a logged-in MyChartRequest for the given hostname. Throws if no
 * account is configured for that hostname.
 */
export async function resolveSession(hostname: string): Promise<MyChartRequest> {
  if (!hostname) {
    throw new Error('account is required. Call list_accounts to see configured account IDs, then pass the hostname as `account`.');
  }
  const account = findAccount(hostname);
  if (!account) {
    const available = readAccounts().map(a => a.hostname);
    throw new Error(
      available.length === 0
        ? `No MyChart accounts configured. Call setup_account first.`
        : `Account "${hostname}" is not configured. Configured accounts: ${available.join(', ')}.`,
    );
  }
  return ensureAccountSession(account);
}

/**
 * Adopt an already-logged-in session (e.g. produced by setup_account or
 * complete_2fa) into the session manager so subsequent tool calls reuse
 * the cookies + benefit from renewal and keepalive.
 */
export async function adoptSession(hostname: string, session: MyChartRequest): Promise<void> {
  const key = normalizeHostname(hostname);
  clearSession(key);
  await persistSession(key, session);
  manageSession(key, session);
}
