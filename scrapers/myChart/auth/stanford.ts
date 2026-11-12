// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * Stanford Health Care ("MyHealth") login, one of the custom login portals in customPortals.ts —
 * see the Stanford section of README.md.
 *
 * Stanford's MyChart has no usable /Authentication/Login: it fronts it with its own portal,
 * whose JSON login API (plus its own 2FA) is followed by an SSO hop into the stock Epic
 * MyChart at mychart.stanfordhealthcare.org/myhealth_sso, where every other scraper works
 * unchanged.
 */
import { randomUUID } from 'crypto';
import { MyChartRequest } from '../core/myChartRequest';
import type { LoginResult, TwoFaResult, TwoFaDeliveryInfo } from './login';
import type { CustomPortal } from './customPortals';
import { MASKED_EMAIL_RE, MASKED_PHONE_RE } from './maskedContact';
import { looksLikeSignedOutPage, SIGNED_OUT_URL_RE } from '../core/signedOutPage';
import { logger } from '../../../shared/logger';

const LOGIN_API = 'https://myhealth.stanfordhealthcare.org/Private/Ajax/V1/MyHealthLogin';
const MYCHART_HOST = 'mychart.stanfordhealthcare.org';
const MYCHART_PREFIX = 'myhealth_sso';

/** Login state carried from the password step to the 2FA step. */
const pendingStanford = new WeakMap<MyChartRequest, { userName: string; deviceId: string }>();

interface PortalResponse {
  action?: string;
  twoFactorRequired?: boolean;
  twoFactorEnabled?: boolean;
  twoFactorGlobalSwitch?: string;
  meta?: { code?: number; errorCode?: number; errorMessage?: string; MyHealthLogin?: { errorCode?: number } };
}

async function postJson(req: MyChartRequest, url: string, body: object): Promise<PortalResponse> {
  const resp = await req.makeRequest({
    url,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  try {
    return JSON.parse(text) as PortalResponse;
  } catch {
    throw new Error(`Stanford MyHealth login API returned HTTP ${resp.status} with a non-JSON body`);
  }
}

/** Keys and meta only — other values can be contact details or tokens. */
function shape(r: PortalResponse): string {
  return JSON.stringify(Object.keys(r)) + ' meta=' + JSON.stringify(r.meta ?? null);
}

/**
 * SSO hop from the portal session into Stanford's MyChart, then a /Home check. A failed hop
 * doesn't end on the login page but on a 200 `custom/referringpage.asp?errorNamespace=AuthError`
 * page, so a 200 alone proves nothing.
 */
async function enterMyChart(req: MyChartRequest): Promise<boolean> {
  await req.makeRequest({ path: '/inside.asp?webservice=true&lang=en-US' });
  const home = await req.makeRequest({ path: '/Home' });
  const body = await home.text();
  logger.debug('[stanford] SSO /Home check:', home.status, home.url);
  return home.status === 200 && !SIGNED_OUT_URL_RE.test(home.url ?? '') && !looksLikeSignedOutPage(body);
}

function pickDelivery(r: PortalResponse): { sendType: 'EMAIL' | 'SMS'; delivery: TwoFaDeliveryInfo } {
  const flat = JSON.stringify(r);
  const email = MASKED_EMAIL_RE.exec(flat)?.[0];
  const phone = MASKED_PHONE_RE.exec(flat)?.[0];
  if (email || !phone) return { sendType: 'EMAIL', delivery: { method: 'email', contact: email } };
  return { sendType: 'SMS', delivery: { method: 'sms', contact: phone } };
}

// The portal stops asking for 2FA once a deviceId has passed it (the web app keeps one in
// localStorage), so without a saved one every login needs a code.
async function stanfordLogin(user: string, pass: string, skipSendCode: boolean, trustedDeviceId: string | undefined): Promise<LoginResult> {
  const req = new MyChartRequest(MYCHART_HOST);
  req.setFirstPathPart(MYCHART_PREFIX);
  const deviceId = trustedDeviceId || randomUUID();
  req.trustedDeviceId = deviceId;

  const r = await postJson(req, LOGIN_API, { username: user, password: pass, deviceId });
  logger.debug('[stanford] login response shape:', shape(r));

  // HTTP 200 either way; failure is in the body, e.g. meta {code: 401, errorCode: 1000}.
  if (r.meta?.code === 401) {
    const reason = r.meta.errorMessage ?? `error ${r.meta.MyHealthLogin?.errorCode ?? r.meta.errorCode}`;
    return { state: 'invalid_login', error: `Stanford MyHealth rejected the login (${reason})`, mychartRequest: req };
  }

  if (r.twoFactorRequired && r.twoFactorGlobalSwitch !== 'DISABLED') {
    const { sendType, delivery } = pickDelivery(r);
    if (!skipSendCode) {
      const sent = await postJson(req, `${LOGIN_API}/generateTwoFactorLoginCode`, { userName: user, sendType });
      logger.debug('[stanford] generate 2FA response shape:', shape(sent));
    }
    pendingStanford.set(req, { userName: user, deviceId });
    return { state: 'need_2fa', mychartRequest: req, twoFaSentTime: Date.now(), twoFaDelivery: delivery };
  }

  if (r.twoFactorGlobalSwitch === 'ENABLED' && r.action && !r.twoFactorEnabled) {
    return { state: 'error', error: 'Stanford requires 2-step verification enrollment — finish it once on myhealth.stanfordhealthcare.org', mychartRequest: req };
  }

  if (r.action === 'Private' || r.action === 'inpatient' || r.action === 'emergencyRoom') {
    return (await enterMyChart(req))
      ? { state: 'logged_in', mychartRequest: req }
      : { state: 'error', error: 'Stanford MyHealth login succeeded but the SSO hop into MyChart did not', mychartRequest: req };
  }

  return { state: 'error', error: `Unexpected Stanford MyHealth login response: ${shape(r)}`, mychartRequest: req };
}

async function stanfordComplete2fa(mychartRequest: MyChartRequest, code: string): Promise<TwoFaResult | null> {
  const pending = pendingStanford.get(mychartRequest);
  if (!pending) return null;

  const r = await postJson(mychartRequest, `${LOGIN_API}/verifyTwoFactorLoginCode`, {
    userName: pending.userName, loginCode: code.trim(), deviceId: pending.deviceId,
  });
  logger.debug('[stanford] verify 2FA response shape:', shape(r));
  if (r.meta?.code !== 200) return { state: 'invalid_2fa', mychartRequest };

  pendingStanford.delete(mychartRequest);
  return { state: (await enterMyChart(mychartRequest)) ? 'logged_in' : 'error', mychartRequest };
}

export const STANFORD: CustomPortal = {
  // The directory lists the portal host, so accounts are filed under it.
  hosts: ['myhealth.stanfordhealthcare.org', MYCHART_HOST],
  login: stanfordLogin,
  complete2fa: stanfordComplete2fa,
};
