# `profile` — what each mode carries

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
