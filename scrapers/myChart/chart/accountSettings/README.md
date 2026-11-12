# `accountSettings`

The rest of the account's settings pages: paperless enrollment, when new test
results are released, sign-in security, text-message consent and Care
Everywhere sharing. One read, five sections.

| | |
| --- | --- |
| **Capabilities** | `get_account_settings` (read, `lessFrequentlyUsed`) |
| **Source** | [`accountSettings.ts`](accountSettings.ts) · [`accountSettings.processor.ts`](accountSettings.processor.ts) |
| **Activities** | React `/app/paperless-settings`, `/app/test-results`, `/app/security-settings`, `/app/text-opt-in`, `/app/care-everywhere-opt-out` |

## Endpoints

Each section `GET`s its own activity page for the token, then:

| Request | Body | Section |
| --- | --- | --- |
| `POST /api/paperless-settings/GetCombinedPaperless` | `{}` | `paperless` |
| `POST /api/test-results/GetResultsReleasePreferences` | `{}` | `resultsRelease` |
| `POST /api/security-settings/GetInitialSettings` | `{}` | `security` |
| `POST /api/textoptin/GetConsentData` | `{}` | `textMessaging` |
| `POST /api/care-everywhere-opt-out/GetCeConfiguration` | `{}` | `careEverywhere` |

Every bundle names the matching writes (`UpdateCombinedPaperless`,
`SetUpTwoFactorOptInOut`, `UpdateSMSOptIn`, `UpdateCareEverywhereStatus`, …).
This scraper calls none of them.

## Notes and research

Probed on **five real instances in November 2026, across two Epic releases**:
all five endpoints answered 200 with `{}` on all five instances, each from its
own activity page.

- **Each section is tolerated on its own.** A section whose request failed is
  `null` and its endpoint is named in `unavailable`, so an org that hasn't
  turned one page on still returns the other four, and "unknown" never reads
  as "off". All five failing is a failed read and throws.
- **Paperless `status` is a number**, decoded with
  `epic.px.client.paperless-settings`' own table: `-1` NotEligible, `1`
  SignedUp, `2` Declined, `3` NoResponse, `4` Mixed (`0` is the bundle's
  NotLoaded placeholder and is never sent). The four features are billing
  statements, EOBs, premium invoices and after-visit summaries. Invoices were
  NotEligible on all five, EOBs on four.
- **`chosenRRPreference` was `""` on all five** — no choice made, so the org's
  default release timing applies. All five offered the same two options ("as
  soon as possible" / "wait"); an org that offers none was not seen.
- **`GetConsentData` differs between releases.** Four instances send
  `secondarySenders`; the fifth, on the other release, sends
  `additionalSenders` for the same list. The processor keeps whichever key was
  sent, under its own name. `shortCodesConsent` is keyed by SMS short code.
- **`security` is read-only state the account-security capabilities change**
  (`setup_totp`, `register_passkey`). `systemMethodsList` is undecoded and
  dropped.
- **`/app/test-results` is shared with `get_lab_results`**; the release
  preference has no activity of its own.

## Modes: what each mode carries

Part of the processor layer — rules in
[`docs/processor-layer-proposal.md`](../../../../docs/processor-layer-proposal.md),
examples in [`docs/processor-layer-examples.md`](../../../../docs/processor-layer-examples.md).

## `get_account_settings`

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `paperless.{billingInfo,eobInfo,invoiceInfo,avsInfo}.status` | Raw enrollment code | — | ✓ | — | Kept beside its decode; detail. |
| `paperless.*.statusName` | Decoded enrollment | ✓ | ✓ | ✓ | The answer. |
| `paperless.*.allowSignup`, `.allowCancel` | What the patient may change | — | ✓ | — | Detail. |
| `paperless.billingInfo.isLTCEnabled`, `.hasAnAuthUser`, `*.showNoNotifsPopup`, `showContactInfo`, `expandID` | Page config | — | — | — | UI flag. |
| `resultsRelease.options[]` (`value`, `titleUtf8`) | The choices this org offers | — | ✓ | — | Detail. |
| `resultsRelease.chosenRRPreference` | The choice, `""` when none | — | ✓ | — | Raw; detail. |
| `resultsRelease.chosenRRPreferenceTitle` | The chosen option's title | ✓ | ✓ | ✓ | The answer; null means the org default. |
| `security.passwordLastUpdated`, `.twoFactorEmailSmsOn`, `.twoFactorTOTPOn` | Sign-in state | — | ✓ | ✓ | The questions people ask. |
| `security.twoFactorRequired`, `.allowEmailSmsToggle`, `.allowTotpToggle`, `.passkeyLoginAvailable`, `.rememberWebDevices`, `.rememberWebDevicesAllowed`, `.passwordChangeAvailable`, `.isMyChartCentral`, `.deactivateAccountAllowed` | What the org allows | — | ✓ | — | Detail. |
| `security.isUserOptedIntoPreviewFeatures`, `.arePreviewFeaturesEnabled`, `.nativeLoginAllowed`, `.commPrefAvailable`, `.isUserDoubleActivated`, `.hasPersonalInformationSecurity`, `.systemMethodsList` | Page config, undecoded codes | — | — | — | UI flag / undecoded. |
| `textMessaging.consentData.shortCodesConsent` | Consent per short code | — | ✓ | ✓ | The answer. |
| `textMessaging.consentData.phone` | Number texts go to | — | ✓ | — | Contact data. |
| `textMessaging.primarySender`, `.secondarySenders[]` / `.additionalSenders[]` (`shortCode`, `displayName`, `termsAndConditionsURL`) | Who sends the texts | — | ✓ | — | Detail; key kept as the release sent it. |
| `textMessaging.*.callToAction`, `.privacyPolicyURL`, `.hasRcsSender` | Consent copy | — | — | — | Page text. |
| `careEverywhere.isPatientOptedIn` | Record shared through Care Everywhere | — | ✓ | ✓ | The answer. |
| `careEverywhere.canChangeCeStatus`, `.doesPatientReqConsent`, `.hasAuthsOnFile`, `.needsAuthorization` | Sharing rules | — | ✓ | — | Detail. |
| `careEverywhere` remaining fields (`dxtId`, `authorizationRequirements`, `authNotReqReason`, `authReqReason`, `mcesAccessLevel`, `orgLogo`, …) | Undecoded codes and page config | — | — | — | Undecoded / UI flag. |
| `unavailable` | Endpoints that failed | ✓ | ✓ | ✓ | A gap, never an "off". |
