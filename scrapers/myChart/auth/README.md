# `auth` — finding the portal, and getting into it

Everything before the first chart read: working out where a MyChart deployment actually
lives, logging in with a password or a passkey, clearing 2FA, accepting terms, and
enrolling the credentials that make the next login silent.

| | |
| --- | --- |
| **Capabilities** | `register_passkey` · `list_passkeys` · `delete_passkey` · `setup_totp` · `disable_totp` (account-security writes) |
| **Source** | [`login.ts`](login.ts) · [`silentLogin.ts`](silentLogin.ts) · [`softwareAuthenticator.ts`](softwareAuthenticator.ts) · [`setupPasskey.ts`](setupPasskey.ts) · [`setupTotp.ts`](setupTotp.ts) · [`totp.ts`](totp.ts) · [`passkeyLoginRetry.ts`](passkeyLoginRetry.ts) · [`termsAndConditions.ts`](termsAndConditions.ts) · [`blockedInstances.ts`](blockedInstances.ts) |

Everything here runs through the **raw** `MyChartRequest.makeRequest`, not
`makeAuthenticatedRequest` — this is the pre-login world, and it is what makes the session
wrapper safe (see [`../core/`](../core/)).

## Endpoints

### Mount discovery

| Request | Purpose |
| --- | --- |
| `GET /` | the redirect chain that names the deployment prefix |
| `GET /Authentication/Login` | proof that a candidate mount really serves MyChart |

### Password login

| Request | Body | Purpose |
| --- | --- | --- |
| `GET /Authentication/Login` | — | the form, its antiforgery token, and the login controller script |
| `GET <loginpagecontroller.min.js>` | — | says whether the username field is `LoginIdentifier` or `Username` |
| `POST /Authentication/Login/DoLogin` | `<usernameField>=…&Password=…` + hidden fields | log in |

### Two-factor

| Request | Body | Purpose |
| --- | --- | --- |
| `GET /Authentication/SecondaryValidation/GetSMSConsentStrings?noCache=…` | — | consent strings, fetched the way the page does |
| `POST /Authentication/SecondaryValidation/SendCode?noCache=…` | `deliveryMethodEmail=true&resendCode=false&workflow=1` (and variants) | send the code — **skipped entirely for TOTP** |
| `GET /Authentication/SecondaryValidation` | — | the challenge page and its token |
| `POST /Authentication/SecondaryValidation/Validate?noCache=…` | `TwoFactorCode=…&RememberMe=checked&IsPostLogin2FA=false&…&isTOTP=…` | submit the code |
| `GET /inside.asp` | — | the post-2FA landing check |

### Passkey login

| Request | Body | Purpose |
| --- | --- | --- |
| `POST /Authentication/Login/GetPasskeyGetParams?force=true&noCache=…` | — | the WebAuthn challenge |
| `POST /Authentication/Login/DoLogin` | `Type: "PasskeyLogin"` + the assertion | log in with the passkey |

### Enrollment (requires an authenticated session)

| Request | Purpose |
| --- | --- |
| `POST /api/passkey-management/GenerateCreateRequest` | WebAuthn creation options |
| `POST /api/passkey-management/CreatePasskey` | submit the new credential |
| `POST /api/passkey-management/LoadPasskeyInfo` | list registered passkeys |
| `POST /api/passkey-management/DeletePasskey` | remove one |
| `POST /api/secondary-validation/GetTwoFactorInfo` | current 2FA settings |
| `POST /api/secondary-validation/VerifyPasswordAndUpdateContact` | re-verify the password before changing 2FA |
| `POST /api/secondary-validation/TotpQrCode` | the QR payload, carrying the TOTP secret |
| `POST /api/secondary-validation/VerifyCode` | prove the authenticator works |
| `POST /api/secondary-validation/UpdateTwoFactorTotpOptInStatus` | finalize opt-in |

The enrollment endpoints take their antiforgery token from `/Home/CSRFToken` rather than
from an activity page, because they have no activity page — see [`../core/`](../core/) for
how inconsistent that endpoint is across instances.

## Mount discovery

**The hostname a user gives is often not where the portal lives.** Most deployments sit
under a path prefix (`/MyChart/`, `/UCSFMyChart/`, `/prd/`); some are at the domain root;
and many hostnames are vanity aliases for a deployment on a different host entirely
(`patients.mycslink.org` → `mycslink.cedars-sinai.org/mycslink`, `login.wellspan.org` →
`my.wellspan.org/mywellspan`).

The rule is: **the prefix is whatever precedes MyChart's own login route.**

| Redirect target | Prefix |
| --- | --- |
| `/MyChart/` | `MyChart` |
| `/UCSFMyChart/` | `UCSFMyChart` |
| `/prd/Authentication/Login` | `prd` |
| `/Authentication/Login` | `null` — root-mounted |

`null` means *no prefix at all*, not even the separating slash.

### The shapes discovery has to handle

Measured across **every one of the ~750 unique hostnames** in the instance directory, each
candidate mount checked by fetching `<mount>/Authentication/Login` and confirming a real
login page came back ([#215](https://github.com/Fan-Pier-Labs/openrecord/pull/215)). Reading
one hop of the root redirect places about 48 of them wrong, because these are all real:

1. **The bounce is four hops, and only the last one names the mount** (23 hosts):
   `/` → `/MyChart/` → `DefaultAsp` (relative, no leading slash) → `/MyChart/Authentication/Login?`.
   A root-mounted instance's first hop is the bare `DefaultAsp` — a plausible-looking prefix
   that 404s everything after login.
2. **The portal has moved to another host** (~20 hosts): `patients.mycslink.org` →
   `mycslink.cedars-sinai.org/mycslink`, `login.wellspan.org` → `my.wellspan.org/mywellspan`.
   A bare-domain → `www` redirect is this shape too.
3. **The host serves a landing or affiliate-chooser page** that names the mount only in its
   own HTML links, with no redirect to follow.
4. **The redirect is scripted**, not a header:
   `<script>window.location="…/MyDovetale/"</script>`.

So discovery walks the chain to the end the way a browser does — Location headers, meta
refreshes and scripted redirects, on or off the original host. **Nothing is trusted on
sight**: a prefix proven by the chain landing on it is accepted, but a scraped link or a
redirected-to host must serve a real login page first. Only the *host* is ever adopted from
the chain, never the scheme, so a session that starts on HTTPS stays there.

**682 of 750 hosts** resolve to a working login page. Six do not, and cannot: they answer
their root with a bot-block or with a stub that names no mount, so there is nothing in the
response to read. Separately, ~20 hosts sit behind a custom or SSO front end (Okta, IBM
ISAM, VA, Kaiser) that the scraper cannot log into at all, by design — those are not
discovery failures.

The same sweep is why [`../core/`](../core/) caps redirects at 20 and follows 303/307/308:
one host answers `/CRH/` with a 301 to `/CRH/`.

**A root-mounted instance's redirect looks like a prefix and is not.** Cleveland Clinic
answers its root with `Location: ./Authentication/Login?`, whose first path segment is
`Authentication` — read as a prefix, that doubles into
`/Authentication/Authentication/Login/DoLogin`. This is why the rule is "whatever precedes
the login route" rather than "the first path segment", and why fake-mychart models **both**
deployment shapes with CI running one of each: a fake that only serves prefixed instances
cannot catch it.

[`blockedInstances.ts`](blockedInstances.ts) is a small denylist of hosts that are known
not to work, so a user cannot add one. It currently holds `central.mychart.org` (and its
subdomains) — MyChart Central, whose `/Home` print header carries only `Name | DOB`, with
no MRN or PCP (see [`../chart/profile/`](../chart/profile/)).

## Login

- **The username field has two names.** Instances call it either `LoginIdentifier` (newer)
  or `Username`, and which one is read out of the page's own
  `loginpagecontroller.min.js`. `LoginIdentifier` is the default when the script cannot be
  found.
- **`SendCode` parameter names differ per instance**, so the flow tries the known shapes in
  order — `deliveryMethodEmail=true…`, `deliveryMethodSMS=true…`, the legacy
  `deliveryMethodEmail=false…` for SMS — and stops at the first that reports success.
- **`Validate` accepts an email code, an SMS code and a TOTP code identically.** The
  6-digit format is the same whatever the delivery method.
- **"Trust this device"** is sent as `RememberMe=checked`, and stores a cookie that skips
  2FA for 30–90 days depending on the instance.
- **Some instances gate everything behind Terms & Conditions** after login: every request
  redirects to `/Authentication/TermsConditions` until it is accepted.
  [`termsAndConditions.ts`](termsAndConditions.ts) detects the page during login and posts
  the form back with every hidden field intact.

## TOTP

MyChart supports authenticator-app 2FA alongside email and SMS, which is what makes fully
autonomous login possible — no inbox access required.

- **The two methods are OR, not AND.** MyChart's security settings expose "Verify with
  email or text message" and "Verify with authenticator app" as independent switches, with
  "one or more of these methods is required". With both on, the login page offers a choice;
  with only one on, it defaults to that one.
- **With TOTP, `SendCode` is skipped entirely** — the code is generated locally from the
  stored secret, so no email is ever triggered.
- Standard TOTP: HMAC-SHA1, 6 digits, 30-second period, Base32 secret. Generated by
  `totp-generator`; [`totp.ts`](totp.ts) also parses the `otpauth://` URI out of the setup
  QR code.
- The setup flow mirrors the portal's: check current settings → re-verify the password →
  fetch the QR payload (which carries the secret) → verify a generated code → finalize the
  opt-in.
- Combined with the trust-device cookie: first login needs a code, the next 30–90 days need
  nothing, and after that the code is generated silently.

CLI flags for all of this are in [`docs/cli.md`](../../../docs/cli.md#totp-management).

## Passkeys

[`softwareAuthenticator.ts`](softwareAuthenticator.ts) is a **software WebAuthn
authenticator** — it does what `navigator.credentials.create` / `.get` do in a browser,
with an ECDSA P-256 key pair held in a local credential file. That is what lets a headless
client log in with a passkey and skip 2FA entirely.

- **The challenge must be re-encoded.** WebAuthn requires the `challenge` in
  `clientDataJSON` to be **base64url**; MyChart sends it as standard base64. Convert before
  building `clientDataJSON` or every assertion is rejected.
- **The signature counter desyncs, and it is recoverable.** MyChart enforces a
  strictly-increasing WebAuthn counter. The local value falls behind when a login advanced
  the server but the bumped value was never persisted, or when the same passkey is used from
  another device; the server then rejects the assertion as `invalid_login`, which is
  indistinguishable from a bad credential. [`passkeyLoginRetry.ts`](passkeyLoginRetry.ts)
  treats an `invalid_login` as a possible mismatch and retries with the counter bumped, up
  to 10 times. Callers **must persist the credential after a successful login**, or the next
  one starts the dance again.
- Registration and login are separate endpoint families: `/api/passkey-management/*`
  (enrollment, authenticated) versus `/Authentication/Login/GetPasskeyGetParams` +
  `DoLogin` with `Type: "PasskeyLogin"` (login, unauthenticated).
- The passkey and TOTP endpoints are deliberately logged **status-only**: their headers
  carry `Set-Cookie` and their bodies carry WebAuthn challenges and the TOTP secret.

## Silent login

[`silentLogin.ts`](silentLogin.ts) is the non-interactive ladder every client's session
renewal hook uses: **saved passkey (with counter retry) → username + password → TOTP-secret
2FA**. Anything needing a human — an emailed code, a password prompt — is out of scope by
definition; this exists so `makeAuthenticatedRequest` can renew an expired session mid-scrape
with nobody at the keyboard, and when no silent path works it says so rather than blocking.

Each client stores credentials differently, so they are supplied as parameters, and
`wireSilentReauthentication` turns the result into the `reauthenticate` hook the session
wrapper calls.
