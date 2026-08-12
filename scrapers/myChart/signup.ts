/**
 * MyChart account *signup* and *activation* — the "I don't have an account yet"
 * branch of onboarding (Vision Implementation plan §7).
 *
 * Reverse-engineered against Denver Health (Epic) on 2026-06-12. See
 * `claude-memory/mychart-signup-recovery-api.md` for the full captured
 * contract. Two real-world entry points:
 *
 *   1. **Activation code** — patient has a code from an enrollment letter or
 *      After-Visit Summary. Modern React SPA at `/MyChart/app/activation`,
 *      JSON APIs, no reCAPTCHA on entry. Most amenable to pure-HTTP scraping.
 *
 *   2. **Self-signup (identity match)** — no code; the patient supplies
 *      demographics (name, DOB, address, optional SSN-last-4 / MRN) and Epic
 *      matches them to a record. Classic server-rendered wizard posting to
 *      `/MyChart/Signup/Standalone/SubmitActivationRequest`.
 *
 * ⚠️ **reCAPTCHA Enterprise gates self-signup on the real portal.** The
 * demographic POST requires a `g-recaptcha-response` token that pure `fetch`
 * cannot mint — in production it must come from a real browser/WebView. We
 * thread it through as an optional `recaptchaToken`; fake-mychart (and CI)
 * have no bot protection so they ignore it. This contradicts the plan's
 * "no bot protection today" assumption, which holds for *login* but not
 * *signup*.
 *
 * Both paths converge on an email/SMS one-time code to confirm contact info,
 * then a final "choose username & password" step that actually creates the
 * account. The post-OTP endpoints could not be captured against the real
 * portal (no access to the test inbox), so their exact request/response
 * shapes here are modeled to Epic conventions and verified against
 * fake-mychart; flag for byte-level verification when real access is available.
 */
import { MyChartRequest } from './myChartRequest';
import { createPreAuthRequest } from './preAuthRequest';
import { getRequestVerificationTokenFromBody } from './util';
import { logger } from '../../shared/logger';

export type SignupGender = 'Female' | 'Male' | 'Unknown';

export type SignupAddress = {
  street: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  /** ISO-ish country code; defaults to US ("1" in Epic's select). */
  country?: string;
};

/** Demographics for self-signup identity matching. */
export type SignupIdentity = {
  firstName: string;
  middleName?: string;
  lastName: string;
  /** MM/DD/YYYY, matching the portal's DateOfBirth field. */
  dateOfBirth: string;
  email: string;
  gender: SignupGender;
  address: SignupAddress;
  /** Last 4 digits of SSN — optional on Denver Health. */
  last4SSN?: string;
  /** Medical record number — optional. */
  mrn?: string;
  mobilePhone?: string;
  homePhone?: string;
};

export type SignupResult = {
  state: 'need_contact_verification' | 'account_exists' | 'invalid' | 'error';
  /** Opaque token threaded into the contact-verification + create-account steps. */
  signupToken?: string;
  /** Masked destination of the one-time code, e.g. "te***@example.com". */
  deliveryMasked?: string;
  mychartRequest: MyChartRequest;
  error?: string;
};

export type ActivationCodeResult = {
  state: 'valid' | 'invalid' | 'error';
  signupToken?: string;
  mychartRequest: MyChartRequest;
  error?: string;
};

export type ContactVerificationResult = {
  state: 'verified' | 'invalid' | 'error';
  error?: string;
};

export type CreateAccountResult = {
  state: 'created' | 'username_taken' | 'invalid' | 'error';
  username?: string;
  error?: string;
};

/** Map our gender enum to Epic's radio value (legalSex0/1/2 order). */
function genderValue(g: SignupGender): string {
  if (g === 'Female') return '0';
  if (g === 'Male') return '1';
  return '2';
}

/**
 * Submit the self-signup demographic form (identity-match path).
 *
 * POSTs to `/Signup/Standalone/SubmitActivationRequest` with the exact field
 * names the browser sends. `recaptchaToken` is the `g-recaptcha-response` value
 * — required by the real portal, ignored by fake-mychart.
 */
export async function submitSignupRequest({
  hostname,
  identity,
  recaptchaToken,
  protocol,
  fetchFn,
  mychartRequest: existingRequest,
}: {
  hostname: string;
  identity: SignupIdentity;
  recaptchaToken?: string;
  protocol?: string;
  fetchFn?: (url: string, init: RequestInit) => Promise<Response>;
  mychartRequest?: MyChartRequest;
}): Promise<SignupResult> {
  const mychartRequest =
    existingRequest ?? (await createPreAuthRequest({ hostname, protocol, fetchFn }));
  if (!mychartRequest) {
    return {
      state: 'error',
      error: 'could not determine MyChart path for ' + hostname,
      mychartRequest: existingRequest as MyChartRequest,
    };
  }

  // Fetch the signup page first to pick up the CSRF token, mirroring the
  // browser (a missing __RequestVerificationToken is a common 403 cause).
  const pageResp = await mychartRequest.makeRequest({ path: '/Signup' });
  const token = getRequestVerificationTokenFromBody(await pageResp.text()) ?? '';

  const form = new URLSearchParams();
  form.set('__RequestVerificationToken', token);
  // NameInput appears three times (first, middle, last) under one field name.
  form.append('NameInput', identity.firstName);
  form.append('NameInput', identity.middleName ?? '');
  form.append('NameInput', identity.lastName);
  form.set('AddressInfo_Country', identity.address.country ?? '1');
  form.set('AddressInfo_Street', identity.address.street);
  form.set('AddressInfo_StreetOtherLines', identity.address.street2 ?? '');
  form.set('AddressInfo_City', identity.address.city);
  form.set('AddressInfo_State', identity.address.state);
  form.set('AddressInfo_Zip', identity.address.zip);
  form.set('DateOfBirth', identity.dateOfBirth);
  form.set('Last4SSN', identity.last4SSN ?? '');
  form.set('Email', identity.email);
  form.set('EmailVerification', identity.email);
  form.set('Gender', genderValue(identity.gender));
  form.set('MobilePhone', identity.mobilePhone ?? '');
  form.set('HomePhone', identity.homePhone ?? '');
  form.set('MRN', identity.mrn ?? '');
  form.set('g-recaptcha-response', recaptchaToken ?? '');

  let resp: Response;
  try {
    resp = await mychartRequest.makeRequest({
      path: '/Signup/Standalone/SubmitActivationRequest',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        __RequestVerificationToken: token,
      },
      body: form.toString(),
    });
  } catch (e) {
    logger.debug('submitSignupRequest error', e);
    return { state: 'error', error: String(e), mychartRequest };
  }

  // The real portal answers with HTML; fake-mychart answers with JSON. Handle
  // both: parse JSON when offered, otherwise sniff the HTML for the
  // account-exists / generic-error markers Epic renders.
  const contentType = resp.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const data = (await resp.json()) as {
      Success?: boolean;
      ErrorCode?: string;
      SignupToken?: string;
      DeliveryMasked?: string;
    };
    if (data.Success && data.SignupToken) {
      return {
        state: 'need_contact_verification',
        signupToken: data.SignupToken,
        deliveryMasked: data.DeliveryMasked,
        mychartRequest,
      };
    }
    if (data.ErrorCode === 'AccountAlreadyExists') {
      return { state: 'account_exists', mychartRequest };
    }
    return { state: 'invalid', error: data.ErrorCode, mychartRequest };
  }

  const body = (await resp.text()).toLowerCase();
  if (body.includes('already') && body.includes('account')) {
    return { state: 'account_exists', mychartRequest };
  }
  if (body.includes('there were some errors') || body.includes('errors found in the form')) {
    return { state: 'invalid', error: 'form_validation_failed', mychartRequest };
  }
  return { state: 'error', error: 'unrecognized signup response', mychartRequest };
}

/**
 * Verify an activation code from an enrollment letter / After-Visit Summary.
 * Epic accepts the code in three dash-separated parts; we accept either the
 * joined string or the raw parts.
 */
export async function verifyActivationCode({
  hostname,
  code,
  dateOfBirth,
  protocol,
  fetchFn,
  mychartRequest: existingRequest,
}: {
  hostname: string;
  code: string;
  dateOfBirth?: string;
  protocol?: string;
  fetchFn?: (url: string, init: RequestInit) => Promise<Response>;
  mychartRequest?: MyChartRequest;
}): Promise<ActivationCodeResult> {
  const mychartRequest =
    existingRequest ?? (await createPreAuthRequest({ hostname, protocol, fetchFn }));
  if (!mychartRequest) {
    return {
      state: 'error',
      error: 'could not determine MyChart path for ' + hostname,
      mychartRequest: existingRequest as MyChartRequest,
    };
  }

  const pageResp = await mychartRequest.makeRequest({ path: '/app/activation' });
  const token = getRequestVerificationTokenFromBody(await pageResp.text()) ?? '';

  try {
    const resp = await mychartRequest.makeRequest({
      path: '/api/signup/VerifyActivationCode',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', __RequestVerificationToken: token },
      body: JSON.stringify({ code: code.trim(), dateOfBirth: dateOfBirth ?? '' }),
    });
    const data = (await resp.json()) as { Success?: boolean; SignupToken?: string };
    if (data.Success && data.SignupToken) {
      return { state: 'valid', signupToken: data.SignupToken, mychartRequest };
    }
    return { state: 'invalid', error: 'activation code not recognized', mychartRequest };
  } catch (e) {
    logger.debug('verifyActivationCode error', e);
    return { state: 'error', error: String(e), mychartRequest };
  }
}

/**
 * Confirm the email/SMS one-time code sent during signup. Shared by both the
 * self-signup and activation-code paths.
 */
export async function verifySignupContactCode({
  mychartRequest,
  signupToken,
  code,
}: {
  mychartRequest: MyChartRequest;
  signupToken: string;
  code: string;
}): Promise<ContactVerificationResult> {
  try {
    const resp = await mychartRequest.makeRequest({
      path: '/api/signup/VerifyContactCode',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signupToken, code: code.trim() }),
    });
    const data = (await resp.json()) as { Success?: boolean };
    return data.Success ? { state: 'verified' } : { state: 'invalid', error: 'code incorrect' };
  } catch (e) {
    logger.debug('verifySignupContactCode error', e);
    return { state: 'error', error: String(e) };
  }
}

/**
 * Final step: pick a username + password, creating the account. After this
 * succeeds the credentials can be used with {@link myChartUserPassLogin}.
 */
export async function createSignupCredentials({
  mychartRequest,
  signupToken,
  username,
  password,
}: {
  mychartRequest: MyChartRequest;
  signupToken: string;
  username: string;
  password: string;
}): Promise<CreateAccountResult> {
  try {
    const resp = await mychartRequest.makeRequest({
      path: '/api/signup/CreateAccount',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signupToken, username: username.trim(), password }),
    });
    const data = (await resp.json()) as { Success?: boolean; ErrorCode?: string };
    if (data.Success) return { state: 'created', username: username.trim() };
    if (data.ErrorCode === 'UsernameTaken') return { state: 'username_taken', error: 'username taken' };
    return { state: 'invalid', error: data.ErrorCode };
  } catch (e) {
    logger.debug('createSignupCredentials error', e);
    return { state: 'error', error: String(e) };
  }
}
