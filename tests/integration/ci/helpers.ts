/**
 * Shared helpers for CI integration tests.
 *
 * Tests run on the host and talk to the web app via HTTP.
 * The web app runs in Docker Compose alongside fake-mychart and PostgreSQL.
 */

export const BASE_URL = process.env.CI_WEB_URL || 'http://localhost:8080';

/** Hostname of fake-mychart as seen by the web container (Docker internal network). */
export const FAKE_MYCHART_HOSTNAME = process.env.CI_FAKE_MYCHART_HOSTNAME || 'fake-mychart:3000';

// ---------------------------------------------------------------------------
// Shared mutable state that persists across test files (Bun runs them in one process)
// ---------------------------------------------------------------------------
export const state: {
  cookies: string;
  userId: string;
  instanceId: string;
  sessionKey: string;
  mcpApiKey: string;
  totpSecret: string;
} = {
  cookies: '',
  userId: '',
  instanceId: '',
  sessionKey: '',
  mcpApiKey: '',
  totpSecret: '',
};

// ---------------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------------

/** Extract all Set-Cookie values from a Response and merge with existing cookies. */
export function extractCookies(res: Response): string {
  const setCookieHeaders = res.headers.getSetCookie?.() ?? [];
  const existing = parseCookieString(state.cookies);

  for (const header of setCookieHeaders) {
    const nameValue = header.split(';')[0]; // e.g. "better-auth.session_token=abc"
    const eqIdx = nameValue.indexOf('=');
    if (eqIdx > 0) {
      const name = nameValue.slice(0, eqIdx).trim();
      const value = nameValue.slice(eqIdx + 1).trim();
      existing[name] = value;
    }
  }

  return Object.entries(existing)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

function parseCookieString(cookies: string): Record<string, string> {
  const map: Record<string, string> = {};
  if (!cookies) return map;
  for (const part of cookies.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx > 0) {
      map[part.slice(0, eqIdx).trim()] = part.slice(eqIdx + 1).trim();
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

/** Make an authenticated fetch to the web app (includes session cookies + origin header). */
export async function authedFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  if (state.cookies) {
    headers.set('Cookie', state.cookies);
  }
  headers.set('Origin', BASE_URL);
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    redirect: 'manual',
  });
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

export async function signUp(email: string, password: string, name: string) {
  const res = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
    body: JSON.stringify({ email, password, name }),
    redirect: 'manual',
  });

  state.cookies = extractCookies(res);
  return res;
}

export async function signIn(email: string, password: string) {
  const res = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
    body: JSON.stringify({ email, password }),
    redirect: 'manual',
  });

  state.cookies = extractCookies(res);
  return res;
}

export async function signOut() {
  const res = await authedFetch('/api/auth/sign-out', { method: 'POST' });
  state.cookies = extractCookies(res);
  return res;
}
