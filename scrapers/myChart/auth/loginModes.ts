// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * The two ways a client logs in with stored credentials, split by who asked.
 *
 * - `machineLogin` — nobody asked: session renewal mid-request, background
 *   refreshes, app-launch reconnects. It either works silently or fails. It
 *   NEVER makes MyChart send a 2FA code.
 * - `humanLogin` — a person just asked for something (a tool call they
 *   prompted, a CLI command, a sign-in screen). It may make MyChart text or
 *   email a code, and hands back the pending login so the caller can collect
 *   that code and finish with `complete2faFlow`.
 *
 * The rule behind the split: a code may only be sent by a caller that keeps
 * the pending login and can accept the code afterwards. A renewal hook can't —
 * it would send a code nobody can type in, then discard the login. Two
 * functions rather than a flag, so a background caller can't pick the wrong
 * mode by accident. Diagrams: docs/login-modes.md.
 *
 * Both share one ladder: saved passkey (with WebAuthn signature-counter
 * retry) → username + password → TOTP-secret 2FA. Only the last rung differs.
 */

import type { MyChartRequest } from '../core/myChartRequest';
import { myChartUserPassLogin, myChartPasskeyLogin, complete2faFlow, type TwoFaDeliveryInfo } from './login';
import { passkeyLoginWithCounterRetry } from './passkeyLoginRetry';
import { generateTotpCode } from './totp';
import type { PasskeyCredential } from './softwareAuthenticator';
import { logger } from '../../../shared/logger';

/**
 * Every optional here is `| undefined` on purpose: each client reads these out of
 * its own credential store, where "nothing saved" surfaces as an explicit
 * undefined, and every read below is a truthiness or `??` check — so an absent
 * key and an undefined one mean the same thing.
 */
export type StoredLoginParams = {
  hostname: string;
  username?: string | undefined;
  password?: string | undefined;
  /** TOTP secret for non-interactive 2FA. */
  totpSecret?: string | null | undefined;
  /**
   * Locally stored passkey. Mutated in place — a login advances its WebAuthn
   * signature counter — so persist it from `onPasskeyUsed` or the next login
   * starts a counter-desync recovery dance.
   *
   * (No transport parameter: scrapers/http.ts picks the platform's transport —
   * native-cookie fetch on device, jar-driven fetch on Node/Bun — on its own.)
   */
  passkey?: PasskeyCredential | null | undefined;
  /** Saved `mychartRequest.trustedDeviceId` — lets a custom login portal (customPortals.ts) skip 2FA. */
  trustedDeviceId?: string | null | undefined;
  /** 'http' for local fake-mychart; defaults to https. */
  protocol?: string | undefined;
  /** A passkey login succeeded — persist the bumped signature counter. */
  onPasskeyUsed?: ((credential: PasskeyCredential) => void | Promise<void>) | undefined;
  /** The passkey was rejected as invalid (not a network error) — safe to delete. */
  onPasskeyInvalid?: ((credential: PasskeyCredential) => void | Promise<void>) | undefined;
};

export type MachineLoginOutcome =
  | { state: 'logged_in'; mychartRequest: MyChartRequest }
  /** MyChart wants a 2FA code and nothing stored can answer it. Retrying won't help; a person has to sign in. */
  | { state: 'needs_human'; reason: string }
  | { state: 'failed'; reason: string };

export type HumanLoginOutcome =
  | { state: 'logged_in'; mychartRequest: MyChartRequest }
  /**
   * MyChart sent a code. Keep `mychartRequest` — it is the half-finished
   * login — and pass it with the user's code to `complete2faFlow`.
   */
  | {
      state: 'need_2fa';
      mychartRequest: MyChartRequest;
      delivery?: TwoFaDeliveryInfo | undefined;
      sentAt?: number | undefined;
    }
  | { state: 'invalid_login'; reason: string }
  | { state: 'failed'; reason: string };

/** Log in without a person present. Never sends a 2FA code. */
export async function machineLogin(params: StoredLoginParams): Promise<MachineLoginOutcome> {
  const outcome = await loginLadder(params, false);
  if (outcome.state === 'need_2fa') {
    // Unreachable in practice — the ladder only reports need_2fa when it sent
    // a code — but a pending login here has nobody to finish it.
    return { state: 'needs_human', reason: '2FA required and no TOTP secret is stored' };
  }
  if (outcome.state === 'invalid_login') return { state: 'failed', reason: `login failed (invalid_login: ${outcome.reason})` };
  return outcome;
}

/**
 * Log in because a person asked to. May make MyChart text or email a code;
 * on `need_2fa` the caller owns the pending login and must collect the code.
 */
export async function humanLogin(params: StoredLoginParams): Promise<HumanLoginOutcome> {
  const outcome = await loginLadder(params, true);
  if (outcome.state === 'needs_human') {
    // Also unreachable: with sending allowed, a 2FA wall comes back as need_2fa.
    return { state: 'failed', reason: outcome.reason };
  }
  return outcome;
}

async function loginLadder(
  params: StoredLoginParams,
  maySendCode: boolean,
): Promise<HumanLoginOutcome | { state: 'needs_human'; reason: string }> {
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

  const sendCode = maySendCode && !params.totpSecret;
  const userPass = await myChartUserPassLogin({
    hostname,
    user: params.username,
    pass: params.password,
    skipSendCode: !sendCode,
    protocol,
    trustedDeviceId: params.trustedDeviceId,
  });

  if (userPass.state === 'logged_in') {
    return { state: 'logged_in', mychartRequest: userPass.mychartRequest };
  }

  if (userPass.state === 'need_2fa') {
    if (params.totpSecret) {
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
    if (!sendCode) {
      return { state: 'needs_human', reason: '2FA required and no TOTP secret is stored' };
    }
    return {
      state: 'need_2fa',
      mychartRequest: userPass.mychartRequest,
      delivery: userPass.twoFaDelivery,
      sentAt: userPass.twoFaSentTime,
    };
  }

  if (userPass.state === 'invalid_login') {
    return { state: 'invalid_login', reason: userPass.error ?? 'Username or password is incorrect' };
  }

  return { state: 'failed', reason: `login failed (${userPass.state}${userPass.error ? `: ${userPass.error}` : ''})` };
}

/**
 * Wire a request's `reauthenticate` hook to `machineLogin` — renewal happens
 * mid-request with nobody to type a code, so it is always machine mode.
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
  getParams: () => StoredLoginParams | Promise<StoredLoginParams>,
  onRenewed?: (mychartRequest: MyChartRequest) => void | Promise<void>,
): void {
  mychartRequest.reauthenticate = async () => {
    const params = await getParams();
    const outcome = await machineLogin(params);
    if (outcome.state !== 'logged_in') {
      logger.warn(`Silent re-login for ${mychartRequest.hostname} failed (${outcome.state}): ${outcome.reason}`);
      return false;
    }
    mychartRequest.adoptStateFrom(outcome.mychartRequest);
    await onRenewed?.(mychartRequest);
    return true;
  };
}
