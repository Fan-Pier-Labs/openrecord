# MyChart Signup & Account Recovery API (Reverse-Engineered 2026-06-12)

Captured live from Denver Health (`mychart.denverhealth.org`, Epic) with Playwright.
This documents the **no-account / signup / forgot-login** flows the Vision Implementation plan §7 calls the biggest gap.

> No credentials stored here — contract only. Test data used during capture was fake ("Test Patient").

## Entry points (from login page)

- **"Sign up"** → `/MyChart/accesscheck.asp` → redirects to `/MyChart/app/activation` (modern React SPA).
- **"Forgot login information?"** → `/MyChart/app/account-recovery/recovery-choice`.

## 1. Activation-code signup — `/MyChart/app/activation`

- Modern React SPA. **No reCAPTCHA** on entry.
- "Sign up with an activation code": 3-part code input (`xxxxx-xxxxx-xxxxx`) → Next.
- "No activation code? Continue" / "Sign up with your information" → `/MyChart/Signup` (demographic self-signup, below).
- After a valid code: verify identity → choose username/password.

## 2. Self-signup (identity) — `/MyChart/Signup` → `/mychart/signup`

Classic Epic server-rendered multi-step wizard. **Single form `SignupDemographic_Form`**, client-side stepped (URL anchor changes `#0`,`#1`...), POSTed once at the end.

- **POST** `https://<host>/MyChart/Signup/Standalone/SubmitActivationRequest`
- Response is **HTML** (not JSON). On failure it re-renders the demographic page with "There were some errors found in the form." (e.g. email already has an account).
- **⚠️ reCAPTCHA Enterprise (invisible) gates this POST.** Field `g-recaptcha-response` is required. Sitekey `6LeWSnYsAAAAAGnTdC3yQnjxwk7MUyWDUjGrp_i6`. Token comes from `https://www.google.com/recaptcha/enterprise/...` (`userverify` POST on submit). **This is a hard blocker for pure-HTTP on-device signup — needs a real browser/WebView context to mint the token.** (Contradicts plan §2.4 "no bot protection today" — true for login, NOT for self-signup.)

### Wizard steps
1. **Demographics** (form fields below).
2. **"Verify Identity with a Third-Party"** — Experian-style IDV. Buttons: `startThirdParty` ("Verify now") / `verifyLater` ("Skip third-party verification"). Skippable.
3. **Email/SMS one-time code** to confirm contact info ("confirm your contact information using a one-time code on the next page").
4. **Choose username & password.**

### Demographic form fields (`SignupDemographic_Form`)
- `__RequestVerificationToken` (CSRF, hidden)
- `NameInput` ×3 (same name = first, middle, last)
- `AddressInfo_Country` (select, US=`1`), `AddressInfo_Street`, `AddressInfo_StreetOtherLines` (textarea), `AddressInfo_City`, `AddressInfo_State` (select; CO=`6`), `AddressInfo_Zip`, `AddressInfo_County` (select)
- `DateOfBirth` (MM/DD/YYYY), `Last4SSN` (password, **optional**), `MRN` (**optional**)
- `Email`, `EmailVerification`
- `Gender` (radio: `legalSex0`=Female, `legalSex1`=Male, `legalSex2`=Unknown)
- `MobilePhone`, `HomePhone`
- `token` (hidden, empty), `g-recaptcha-response`, `JSC` (user_prefs), `HDIM` (user_prefs2)
- Nav metrics: `__NavigationRequestMetrics`, `__NavigationRedirectMetrics`, `__RedirectChainIncludesLogin`, `__CurrentPageLoadDescriptor`, `__RttCaptureEnabled`
- **Required** (Epic JS validation, no HTML5 `required`): first+last name, full address (street/city/state/zip), DOB, email+verify, gender. SSN/MRN/phone optional. Address fields also fetch `POST /MyChart/PersonalInformation/GetAddressConfiguration` + `/GetAddressFilter` + `/api/address/SearchAddress`.

## 3. Account recovery (unified username + password) — `/MyChart/app/account-recovery`

Modern React SPA hitting JSON APIs. **No reCAPTCHA** on the choice/entry pages.

- `/MyChart/app/account-recovery/recovery-choice`: choose "Recover my MyChart account" vs "Recover my Epic ID".
- `/MyChart/app/account-recovery`: enter email **or** mobile phone previously used for two-step verification → "Send code".
- **POST** `/MyChart/api/account-recovery/GetAccountRecoverySettings`
  - Request: `{ "contactInfo": "<email-or-phone>" }`, CSRF via `__RequestVerificationToken` header.
  - **Verified response:** `{ "allowEmail": true, "allowSMS": true, "consentStrings": { "showSMSConsent": true, "callToAction": "Text messages related to your relationship with Denver Health ... Message and data rates may apply ..." } }`
- Then send-code → verify-code → recover (reveals username + lets you set a new password). Exact send/verify endpoint names NOT yet captured (likely `/MyChart/api/account-recovery/*`).

## Architectural implications for the app

1. **Self-signup requires a WebView** (reCAPTCHA Enterprise). Pure `fetchFn` HTTP can't mint `g-recaptcha-response`. Activation-code signup + account-recovery do NOT show reCAPTCHA on their initial steps and may be doable over HTTP.
2. **Email/SMS OTP is unavoidable** in both self-signup and recovery — the app must prompt the user to enter the code from their email/SMS.
3. fake-mychart has no bot protection (by design), so the simulator/CI E2E exercises the contract *without* reCAPTCHA; real-portal verification of the post-OTP username/password endpoints is still TODO (couldn't read the test inbox).
