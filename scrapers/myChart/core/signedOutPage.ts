// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * Where an expired session's request ends up: the login page, or — on instances that log in
 * through an outside portal (see auth/customPortals.ts) — the 200 `custom/referringpage.asp`
 * error page that /Authentication/Login redirects to there.
 */
export const SIGNED_OUT_URL_RE = /\/authentication\/login|[?&]errorNamespace=AuthError(&|$)/i;

/**
 * Whether an HTML body is the login page an EXPIRED session gets bounced to.
 *
 * Deliberately much stricter than `looksLikeLoginPage` in `../auth/login.ts`:
 * that one answers "could this be a MyChart login page?" during mount
 * discovery, where matching an authenticated page costs nothing. Here a false
 * positive would declare a live session dead and trigger a re-login, so only
 * markers that never appear on post-login pages count —
 * `__RequestVerificationToken` is on every page and the Epic license line is
 * in every footer, which is exactly why the loose check can't be reused for
 * expiry detection.
 */
export function looksLikeSignedOutPage(html: string): boolean {
  const bodyLower = html.toLowerCase();
  // A class token only: signed-in pages on some instances embed routing JSON
  // carrying `"isPrelogin":false`, which a bare substring match mistakes for
  // the login page.
  return /class\s*=\s*["'][^"']*\bisprelogin\b/.test(bodyLower) // <body class="… isPrelogin">
    || bodyLower.includes('login with passkey')     // real instances
    || bodyLower.includes('sign in with passkey')
    || bodyLower.includes('forgot login information')
    || bodyLower.includes('loginpagecontroller')    // the login page's own JS
    || bodyLower.includes('authentication/login/dologin'); // the login form action
}
