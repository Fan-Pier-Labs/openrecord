/**
 * Non-interactive MyChart login ladder, shared by every client's session
 * renewal hook (and usable for first login too).
 *
 * Order: saved passkey (with WebAuthn signature-counter retry) → username +
 * password → TOTP-secret 2FA. Anything requiring a human — an emailed code, a
 * password prompt — is out of scope by definition: this exists so
 * `makeAuthenticatedRequest` can renew an expired session mid-scrape without
 * anyone at the keyboard. When no silent path works it says so rather than
 * blocking.
 *
 * The CLI, desktop extension and mobile app each store credentials
 * differently; they supply them (and persistence callbacks) via params, and
 * `wireSilentReauthentication` turns the result into the `reauthenticate` hook
 * the wrapper calls.
 */

import { type MyChartRequest } from '../core/myChartRequest';
import { myChartUserPassLogin, myChartPasskeyLogin, complete2faFlow } from './login';
import { passkeyLoginWithCounterRetry } from './passkeyLoginRetry';
import { generateTotpCode } from './totp';
import type { PasskeyCredential } from './softwareAuthenticator';
import { logger } from '../../../shared/logger';

export type SilentLoginParams = {
  hostname: string;
  username?: string;
  password?: string;
  /** TOTP secret for non-interactive 2FA. Without it, a 2FA challenge fails the login. */
  totpSecret?: string | null;
  /**
   * Locally stored passkey. Mutated in place — a login advances its WebAuthn
   * signature counter — so persist it from `onPasskeyUsed` or the next login
   * starts a counter-desync recovery dance.
   *
   * (No transport parameter: scrapers/http.ts picks the platform's transport —
   * native-cookie fetch on device, jar-driven fetch on Node/Bun — on its own.)
   */
  passkey?: PasskeyCredential | null;
  /** 'http' for local fake-mychart; defaults to https. */
  protocol?: string;
  /** A passkey login succeeded — persist the bumped signature counter. */
  onPasskeyUsed?: (credential: PasskeyCredential) => void | Promise<void>;
  /** The passkey was rejected as invalid (not a network error) — safe to delete. */
  onPasskeyInvalid?: (credential: PasskeyCredential) => void | Promise<void>;
};

export type SilentLoginOutcome =
  | { state: 'logged_in'; mychartRequest: MyChartRequest }
  | { state: 'failed'; reason: string };

export async function silentLogin(params: SilentLoginParams): Promise<SilentLoginOutcome> {
  const { hostname, protocol } = params;

  if (params.passkey) {
    const credential = params.passkey;
    try {
      const result = await passkeyLoginWithCounterRetry(
        (cred) => myChartPasskeyLogin({ hostname, credential: cred, protocol }),
        credential,
      );
      if (result.state === 'logged_in') {
        await params.onPasskeyUsed?.(credential);
        return { state: 'logged_in', mychartRequest: result.mychartRequest };
      }
      logger.warn(`Passkey login for ${hostname} failed (${result.state}), falling back to password`);
      if (result.state === 'invalid_login') {
        // Genuinely rejected, not a network blip — counter retry already ruled
        // out a signature-counter desync.
        await params.onPasskeyInvalid?.(credential);
      }
    } catch (error) {
      // Network/timeout errors keep the passkey — it may be perfectly valid.
      logger.warn(`Passkey login for ${hostname} threw (${(error as Error).message}), falling back to password`);
    }
  }

  if (!params.username || !params.password) {
    return { state: 'failed', reason: params.passkey ? 'passkey login failed and no password is available' : 'no stored credentials' };
  }

  const userPass = await myChartUserPassLogin({
    hostname,
    user: params.username,
    pass: params.password,
    skipSendCode: !!params.totpSecret,
    protocol,
  });

  if (userPass.state === 'logged_in') {
    return { state: 'logged_in', mychartRequest: userPass.mychartRequest };
  }

  if (userPass.state === 'need_2fa') {
    if (!params.totpSecret) {
      return { state: 'failed', reason: '2FA required and no TOTP secret is stored' };
    }
    const code = await generateTotpCode(params.totpSecret);
    const twoFa = await complete2faFlow({
      mychartRequest: userPass.mychartRequest,
      code,
      isTOTP: true,
    });
    if (twoFa.state === 'logged_in') {
      // complete2faFlow returns its own request object — that is the one
      // carrying the authenticated cookies.
      return { state: 'logged_in', mychartRequest: twoFa.mychartRequest };
    }
    return { state: 'failed', reason: `TOTP code rejected (${twoFa.state})` };
  }

  return { state: 'failed', reason: `login failed (${userPass.state}${userPass.error ? `: ${userPass.error}` : ''})` };
}

/**
 * Wire a request's `reauthenticate` hook to the silent login ladder.
 *
 * `getParams` runs at renewal time, not wiring time, so it can re-read
 * credential stores that may have changed since login (a passkey registered
 * mid-session, an updated password). On success the fresh session state is
 * adopted onto the SAME request object — everything holding a reference keeps
 * working — and `onRenewed` runs so the client can re-persist its cookie
 * cache.
 */
export function wireSilentReauthentication(
  mychartRequest: MyChartRequest,
  getParams: () => SilentLoginParams | Promise<SilentLoginParams>,
  onRenewed?: (mychartRequest: MyChartRequest) => void | Promise<void>,
): void {
  mychartRequest.reauthenticate = async () => {
    const params = await getParams();
    const outcome = await silentLogin(params);
    if (outcome.state !== 'logged_in') {
      logger.warn(`Silent re-login for ${mychartRequest.hostname} failed: ${outcome.reason}`);
      return false;
    }
    mychartRequest.adoptStateFrom(outcome.mychartRequest);
    await onRenewed?.(mychartRequest);
    return true;
  };
}
