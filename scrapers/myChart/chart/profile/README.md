# `profile`

Who the record belongs to: name, date of birth, MRN and PCP, plus the account's contact
information and addresses.

| | |
| --- | --- |
| **Capabilities** | `get_profile` (read) |
| **Source** | [`profile.ts`](profile.ts) · [`profileHtml.ts`](profileHtml.ts) · [`profile.processor.ts`](profile.processor.ts) |
| **Activity** | `/Home` (print header) and legacy `/PersonalInformation` |

## Endpoints

| Request | Body | Purpose |
| --- | --- | --- |
| `GET /Home` | — | HTML; the `.printheader` div carries `Name \| DOB \| MRN \| PCP` |
| `GET /PersonalInformation` | — | antiforgery token |
| `POST /PersonalInformation/GetContactInformation?noCache=<random>` | `useLoginUserEpt=false` (form-encoded) | email, phones, addresses |

The contact-information call is **best effort**: it is missing on some instances, so a
failure there is recorded and tolerated. The print header is the payload.

## Notes and research

- **This module is load-bearing for patient safety, not just for `get_profile`.**
  `parseProfileHtml` is what [`../../proxy/proxyContext.ts`](../../proxy/proxyContext.ts)
  reads to confirm *which patient* MyChart's server-side session is currently on. Every
  chart-touching capability asserts the active patient before running, and this is the
  primitive that answers it — which is why `getMyChartProfile` keeps a `null` return on an
  unrenewable session rather than throwing mid-verification.
- **Two header formats.** Most instances render the full
  `Name | DOB | MRN | PCP`; MyChart Central-style deployments render `Name | DOB` only, and
  MRN/PCP are picked up separately if they appear at all. Both are parsed; `mrn` and `pcp`
  come back blank on the short form.
- **`/Home` is fetched with `followRedirects: false`** on the identity read. Some instances
  bounce `/Home` through a landing route, and following that blindly would parse a login
  page into a plausible-looking profile. A redirect whose target looks like a login means
  "not signed in" and returns `null`; any other redirect is followed and parsed.
- `getEmail()` exists as a separate narrow read for callers that only need the account
  email — notably the 2FA flows.
- The contact body is large and mostly address-form state; `standard` keeps the real contact
  data and the discrete address parts, `concise` keeps the identity card plus the email.

## Modes: what each mode carries

Part of the processor layer. The rules (never rename a MyChart field, membership by field
name, markup only in `raw`, never invent a shape) and the drop-reason tags used in the
Reasoning column are in [`docs/processor-layer-proposal.md`](../../../../docs/processor-layer-proposal.md);
example output in all four modes is in
[`docs/processor-layer-examples.md`](../../../../docs/processor-layer-examples.md).

Columns: **Field** (MyChart's name, or the derived name), **What it is**,
**Derived** (✓ when the processor computes it from other fields; such a field
is never in `raw`), **Standard / JSON**, **Concise**, **Reasoning** (why the
field is in or out of each of the two).

Fields that share a description and a fate are grouped on one row. A group's
members are all listed so nothing is implied.

## `get_profile`

Two requests: `GET /Home` (HTML; the `.printheader` div carries
`Name | DOB | MRN | PCP`) and `POST /PersonalInformation/GetContactInformation`
(JSON). The scraper today returns `{ name, dob, mrn, pcp, email }` and discards
the rest of the contact-information body.

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `name`, `dob`, `mrn`, `pcp` | Parsed from the `/Home` print header. `mrn`/`pcp` blank on MyChart Central-style instances | ✓ | ✓ | ✓ | Derived from the page HTML. The four facts that identify the record; every consumer needs them. |
| `SecureCommunicationInfo.EmailAddress` | Account email | — | ✓ | ✓ | The contact detail a consumer most often needs; small enough for concise. |
| `SecureCommunicationInfo.MobilePhone`, `HomePhone`, `WorkPhone` | Phone numbers (`HomePhone` / `WorkPhone` sit at the top level of the contact body) | — | ✓ | — | Real contact data. Concise is the identity card, not the address book. |
| `SecureCommunicationInfo.SecureEmail`, `SecureMobile` | Verified-contact copies of the same values | — | — | — | Duplicate of `EmailAddress` / `MobilePhone`. |
| `PreferredDevice` | Preferred contact channel | — | ✓ | — | A stated preference; useful to anyone contacting the patient, not part of identity. |
| `PermanentAddress.FormattedValues[]` | Display lines of the home address | — | ✓ | — | The address as MyChart prints it. Standard carries contact data; concise does not. |
| `PermanentAddress.Street`, `.City`, `.State.Title`, `.Zip`, `.Country.Title`, `.HouseNumber`, `.Building`, `.Floor`, `.Unit`, `.PhoneNumber` | Discrete address parts | — | ✓ | — | For consumers that need structured parts rather than display lines. |
| `TemporaryAddress` (same subset) plus `.StartDateDisplay`, `.EndDateDisplay`, `.StartDateISO`, `.EndDateISO` | Temporary address and its validity window | — | ✓ | — | A second address is a fact; emitted blank when there is none (rule 6). |
| `*.County`, `*.District` objects; `*.State.Number`/`.Abbreviation`/`.Comment`/`.TitleUtf8`/`.AbbreviationUtf8`; same on `Country` | Code-table records behind the address parts | — | — | — | Duplicate of the `.Title` values already kept. |
| `PermanentAddress.IsViewOnly`, `.RequiredFieldNames`, `.Success`, `.IsPending`, `.AllowArbitraryInput`, `.AllowDefaults`, `.CollapsedStatus`; same on `TemporaryAddress` | Address-form state | — | — | — | UI flag. |
| `SecureCommunicationInfo.CanSupportEmail`, `.CanSupportMobile`, `.CanSupportOverwrite`, `.DoesEmailNeedAttention`, `.DoesMobileNeedAttention`, `.IsEmailDeleted`, `.IsMobileDeleted`, `.AreBothDeleted`, `.AreNeitherDeleted`, `.DoBothNeedAttention`, `.DoNeitherNeedAttention`, `.ContactVerificationDisabled` | Verification-banner state | — | — | — | UI flag. |
| `PermanentDefaults[]`, `TemporaryDefaults[]`, `RequiredFieldNames[]`, `ReadOnlyFieldNames[]`, `ValidationErrors[]`, `AllowArbitraryInput`, `AllowDefaults`, `HasEditableField`, `IsPending`, `IsTemporaryAddressDisabled`, `IsNonPatientProxyRecord` | Form configuration | — | — | — | UI flag. |
