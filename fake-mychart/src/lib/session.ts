import { v4 as uuidv4 } from 'uuid';

type Session = {
  createdAt: number;
  lastAccess: number;
  termsAccepted: boolean;
  username: string | null;
  /**
   * Which patient record this session is currently viewing. Empty string means
   * the account holder's own record, matching the id MyChart uses for "self".
   * Proxy context is per-session server-side state in real MyChart too — it is
   * not carried in the URL of every subsequent request.
   */
  activeProxyId: string;
  /**
   * How far the Document Center's `LoadOtherDocuments` walk has got. Real
   * MyChart keeps this cursor server-side too — the request says only whether
   * it is the initial load, never which page it wants — which is why a
   * request that omits `isInitialLoad` on a fresh session gets an empty list
   * rather than the first page.
   */
  documentsCursor: number;
};

// In-memory session store. Sessions expire after 30 minutes of inactivity.
const sessions = new Map<string, Session>();

const SESSION_COOKIE_NAME = 'MyChartSession';
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

export function createSession(username: string | null = null): string {
  const id = uuidv4();
  const now = Date.now();
  sessions.set(id, { createdAt: now, lastAccess: now, termsAccepted: false, username, activeProxyId: '', documentsCursor: 0 });
  return id;
}

function getSessionId(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
  return match?.[1] ?? null;
}

export function validateSession(cookieHeader: string | null): boolean {
  const id = getSessionId(cookieHeader);
  if (!id) return false;
  const session = sessions.get(id);
  if (!session) return false;
  if (Date.now() - session.lastAccess > SESSION_TTL_MS) {
    sessions.delete(id);
    return false;
  }
  session.lastAccess = Date.now();
  return true;
}

export function getSessionUsername(cookieHeader: string | null): string | null {
  const id = getSessionId(cookieHeader);
  if (!id) return null;
  return sessions.get(id)?.username ?? null;
}

/** The patient record this session is viewing. '' = the account holder's own. */
export function getActiveProxyId(cookieHeader: string | null): string {
  const id = getSessionId(cookieHeader);
  if (!id) return '';
  return sessions.get(id)?.activeProxyId ?? '';
}

/** Returns false when there is no live session to switch. */
export function setActiveProxyId(cookieHeader: string | null, proxyId: string): boolean {
  const id = getSessionId(cookieHeader);
  if (!id) return false;
  const session = sessions.get(id);
  if (!session) return false;
  session.activeProxyId = proxyId;
  return true;
}

/**
 * The cursor for this session's `LoadOtherDocuments` walk. `isInitialLoad`
 * rewinds it to 0; every other request advances it by the page it served.
 * A request with no session behaves like a session parked past the end.
 */
export function nextDocumentsPage(cookieHeader: string | null, isInitialLoad: boolean, pageSize: number): number {
  const id = getSessionId(cookieHeader);
  const session = id ? sessions.get(id) : undefined;
  if (!session) return Number.MAX_SAFE_INTEGER;
  const from = isInitialLoad ? 0 : session.documentsCursor;
  session.documentsCursor = from + pageSize;
  return from;
}

export function sessionCookieHeader(sessionId: string): string {
  return `${SESSION_COOKIE_NAME}=${sessionId}; Path=/; HttpOnly`;
}

export function hasAcceptedTerms(cookieHeader: string | null): boolean {
  const id = getSessionId(cookieHeader);
  if (!id) return false;
  return sessions.get(id)?.termsAccepted ?? false;
}

export function acceptTerms(cookieHeader: string | null): boolean {
  const id = getSessionId(cookieHeader);
  if (!id) return false;
  const session = sessions.get(id);
  if (!session) return false;
  session.termsAccepted = true;
  return true;
}

/** Delete all sessions. Used by integration tests to simulate session expiry. */
export function deleteAllSessions(): number {
  const count = sessions.size;
  sessions.clear();
  return count;
}

/** Alias used by /reset to clear all sessions as part of full state reset. */
export function resetSessions(): number {
  return deleteAllSessions();
}

export { SESSION_COOKIE_NAME };
