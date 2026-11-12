// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * Health systems whose MyChart can't be logged into directly: they put their own login portal in
 * front of it, then SSO into a stock MyChart. Each lives in its own file; login, 2FA, passkey and
 * TOTP enrollment and account naming ask this module, so nothing else needs to know which
 * systems those are. See "Custom login portals" in README.md.
 */
import type { MyChartRequest } from '../core/myChartRequest';
import type { LoginResult, TwoFaResult } from './login';
import { DetailedError } from '../../../shared/detailedError';
import { STANFORD } from './stanford';

export interface CustomPortal {
  /** Every host a user might type for it. Accounts are saved under the first. */
  hosts: readonly string[];
  /**
   * `trustedDeviceId` is what a previous login left on `mychartRequest.trustedDeviceId`; the
   * portal skips 2FA for a device it remembers.
   */
  login(user: string, pass: string, skipSendCode: boolean, trustedDeviceId: string | undefined): Promise<LoginResult>;
  /** null when `mychartRequest` isn't midway through this portal's login. */
  complete2fa(mychartRequest: MyChartRequest, code: string): Promise<TwoFaResult | null>;
}

const PORTALS: readonly CustomPortal[] = [STANFORD];

function bareHost(hostname: string): string {
  return hostname.toLowerCase().trim().replace(/^https?:\/\//, '').split('/')[0]!;
}

export function customPortalFor(hostname: string): CustomPortal | undefined {
  const host = bareHost(hostname);
  return PORTALS.find((p) => p.hosts.includes(host));
}

export async function completeCustomPortal2fa(mychartRequest: MyChartRequest, code: string): Promise<TwoFaResult | null> {
  for (const portal of PORTALS) {
    const result = await portal.complete2fa(mychartRequest, code);
    if (result) return result;
  }
  return null;
}

/** A portal answering on several hosts is one account, filed under its first host. */
export function canonicalHostname(hostname: string): string {
  return customPortalFor(hostname)?.hosts[0] ?? hostname;
}

/**
 * A MyChart passkey or authenticator registered behind a custom portal would never be used:
 * login goes through the portal, so the next sign-in would quietly ask for a code again.
 */
export function supportsPasskeyAndTotp(hostname: string): boolean {
  return !customPortalFor(hostname);
}

const UNSUPPORTED_TEXT = 'This health system signs in through its own login portal, so a MyChart passkey or authenticator app would never be used. OpenRecord remembers this device after the first verification code instead.';

export function passkeyAndTotpUnsupported(): DetailedError {
  return new DetailedError(UNSUPPORTED_TEXT, UNSUPPORTED_TEXT);
}
