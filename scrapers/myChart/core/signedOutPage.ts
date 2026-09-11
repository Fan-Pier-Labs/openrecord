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
  return bodyLower.includes('isprelogin')          // <body class="… isPrelogin">
    || bodyLower.includes('login with passkey')     // real instances
    || bodyLower.includes('sign in with passkey')
    || bodyLower.includes('forgot login information')
    || bodyLower.includes('loginpagecontroller')    // the login page's own JS
    || bodyLower.includes('authentication/login/dologin'); // the login form action
}
