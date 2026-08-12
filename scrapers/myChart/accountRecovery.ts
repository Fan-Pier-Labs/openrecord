/**
 * MyChart account recovery — the "I forgot my username / password" branch of
 * onboarding (Vision Implementation plan §7).
 *
 * Reverse-engineered against Denver Health (Epic) on 2026-06-12. See
 * `claude-memory/mychart-signup-recovery-api.md`. Modern Epic unifies username
 * *and* password recovery into one flow: a React SPA at
 * `/MyChart/app/account-recovery` that sends a one-time code to the email or
 * mobile phone the patient previously used for two-step verification, then
 * reveals the username and lets them set a new password. No reCAPTCHA on the
 * entry steps (unlike self-signup).
 *
 * `GetAccountRecoverySettings` is verified byte-for-byte against the real
 * portal. The subsequent send/verify/reset endpoint names could not be
 * captured (no access to the test inbox) and are modeled to Epic conventions
 * and verified against fake-mychart — flag for byte-level verification when
 * real access is available.
 */
import { MyChartRequest } from './myChartRequest';
import { createPreAuthRequest } from './preAuthRequest';
import { getRequestVerificationTokenFromBody } from './util';
import { logger } from '../../shared/logger';

/** Verified response shape of GetAccountRecoverySettings. */
export type RecoverySettings = {
  allowEmail: boolean;
  allowSMS: boolean;
  consentStrings: {
    showSMSConsent: boolean;
    callToAction: string;
  };
};

export type RecoverySettingsResult = {
  settings: RecoverySettings | null;
  mychartRequest: MyChartRequest;
  error?: string;
};

export type SendRecoveryCodeResult = {
  state: 'sent' | 'invalid' | 'error';
  deliveryMasked?: string;
  mychartRequest: MyChartRequest;
  error?: string;
};

export type VerifyRecoveryResult = {
  state: 'verified' | 'invalid' | 'error';
  /** Opaque token threaded into resetAccountPassword. */
  recoveryToken?: string;
  /** The recovered username, revealed once the code is verified. */
  username?: string;
  error?: string;
};

export type ResetPasswordResult = {
  state: 'reset' | 'invalid' | 'error';
  error?: string;
};

/**
 * Look up how a contact (email or mobile phone) can receive a recovery code.
 * Real Epic deliberately returns settings even for an unknown contact (so it
 * never confirms whether an account exists), so a non-null result does NOT
 * imply the account exists.
 */
export async function getAccountRecoverySettings({
  hostname,
  contactInfo,
  protocol,
  fetchFn,
  mychartRequest: existingRequest,
}: {
  hostname: string;
  contactInfo: string;
  protocol?: string;
  fetchFn?: (url: string, init: RequestInit) => Promise<Response>;
  mychartRequest?: MyChartRequest;
}): Promise<RecoverySettingsResult> {
  const mychartRequest =
    existingRequest ?? (await createPreAuthRequest({ hostname, protocol, fetchFn }));
  if (!mychartRequest) {
    return {
      settings: null,
      mychartRequest: existingRequest as MyChartRequest,
      error: 'could not determine MyChart path for ' + hostname,
    };
  }

  // Grab a CSRF token from the recovery SPA shell first (the real portal sends
  // it as a __RequestVerificationToken header on the JSON call).
  const pageResp = await mychartRequest.makeRequest({ path: '/app/account-recovery' });
  const token = getRequestVerificationTokenFromBody(await pageResp.text()) ?? '';

  try {
    const resp = await mychartRequest.makeRequest({
      path: '/api/account-recovery/GetAccountRecoverySettings',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', __RequestVerificationToken: token },
      body: JSON.stringify({ contactInfo: contactInfo.trim() }),
    });
    const settings = (await resp.json()) as RecoverySettings;
    return { settings, mychartRequest };
  } catch (e) {
    logger.debug('getAccountRecoverySettings error', e);
    return { settings: null, mychartRequest, error: String(e) };
  }
}

/** Send a one-time recovery code to the contact, via email (default) or SMS. */
export async function sendAccountRecoveryCode({
  mychartRequest,
  contactInfo,
  useSMS,
}: {
  mychartRequest: MyChartRequest;
  contactInfo: string;
  useSMS?: boolean;
}): Promise<SendRecoveryCodeResult> {
  try {
    const resp = await mychartRequest.makeRequest({
      path: '/api/account-recovery/SendCode',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactInfo: contactInfo.trim(), useSMS: !!useSMS }),
    });
    const data = (await resp.json()) as { Success?: boolean; DeliveryMasked?: string };
    if (data.Success) {
      return { state: 'sent', deliveryMasked: data.DeliveryMasked, mychartRequest };
    }
    return { state: 'invalid', error: 'could not send recovery code', mychartRequest };
  } catch (e) {
    logger.debug('sendAccountRecoveryCode error', e);
    return { state: 'error', error: String(e), mychartRequest };
  }
}

/**
 * Verify the recovery code. On success this reveals the account's username and
 * returns a token used to set a new password.
 */
export async function verifyAccountRecoveryCode({
  mychartRequest,
  contactInfo,
  code,
}: {
  mychartRequest: MyChartRequest;
  contactInfo: string;
  code: string;
}): Promise<VerifyRecoveryResult> {
  try {
    const resp = await mychartRequest.makeRequest({
      path: '/api/account-recovery/VerifyCode',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactInfo: contactInfo.trim(), code: code.trim() }),
    });
    const data = (await resp.json()) as {
      Success?: boolean;
      RecoveryToken?: string;
      Username?: string;
    };
    if (data.Success && data.RecoveryToken) {
      return {
        state: 'verified',
        recoveryToken: data.RecoveryToken,
        username: data.Username,
      };
    }
    return { state: 'invalid', error: 'code incorrect' };
  } catch (e) {
    logger.debug('verifyAccountRecoveryCode error', e);
    return { state: 'error', error: String(e) };
  }
}

/** Set a new password using the token from a verified recovery code. */
export async function resetAccountPassword({
  mychartRequest,
  recoveryToken,
  newPassword,
}: {
  mychartRequest: MyChartRequest;
  recoveryToken: string;
  newPassword: string;
}): Promise<ResetPasswordResult> {
  try {
    const resp = await mychartRequest.makeRequest({
      path: '/api/account-recovery/ResetPassword',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recoveryToken, newPassword }),
    });
    const data = (await resp.json()) as { Success?: boolean; ErrorCode?: string };
    if (data.Success) return { state: 'reset' };
    return { state: 'invalid', error: data.ErrorCode ?? 'could not reset password' };
  } catch (e) {
    logger.debug('resetAccountPassword error', e);
    return { state: 'error', error: String(e) };
  }
}
