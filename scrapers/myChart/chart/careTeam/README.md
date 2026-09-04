# `careTeam`

The providers on the patient's care team — this organization's, and outside providers
reached through Care Everywhere — each with their role, specialty and NPI.

| | |
| --- | --- |
| **Capabilities** | `get_care_team` (read) |
| **Source** | [`careTeam.ts`](careTeam.ts) · [`careTeam.processor.ts`](careTeam.processor.ts) |
| **Activity** | Legacy jQuery `/Clinical/CareTeam` |

## Endpoints

| Request | Body | Purpose |
| --- | --- | --- |
| `GET /Clinical/CareTeam` | — | antiforgery token |
| `POST /Clinical/CareTeam/Load` | `{}` | this organization's providers |
| `POST /Clinical/CareTeam/LoadExternal` | `{}` | outside / Care Everywhere providers |

Both are **POST-only** — a GET is refused with the instance's own ASP.NET error surface (a
bare 500 on the August 2025 release, a 302 to `/Home/FiveHundred` on November 2025) rather
than serving the data — and both **require the antiforgery token**, exactly as `/api/*`
routes do. Every parameter the page's own JS sends (`hfrId`, `sources`, `actions`,
`isPrimaryStandalone`) is optional: a bare `{}` returns the identical list.

The envelope is **PascalCase** (`ProvidersList`), not the camelCase the React `/api/*`
routes use — this is a legacy jQuery/Handlebars activity.

The two calls are independent. Care Everywhere is optional per deployment, so a failure on
the outside-provider arm is not fatal: it is reported as `externalProvidersUnavailable`
rather than as "no outside providers".

## Notes and research

This capability has been **built, withdrawn and rebuilt**, and the reason is worth keeping.

- The first implementation was guesses: three HTML container selectors and four name
  selectors, six JSON wrapper keys and four spellings per field — and it read the
  **message-recipients** endpoint as a stand-in for the care team. Nothing came from a
  capture; fake-mychart had been written to match the guesses, so the tests proved only that
  the code agreed with itself. [#312](https://github.com/Fan-Pier-Labs/openrecord/pull/312)
  trimmed the invented field names; [#313](https://github.com/Fan-Pier-Labs/openrecord/pull/313)
  withdrew the capability entirely and made it `comingSoon`.
- Why so drastic: **a wrong guess here does not fail visibly. It renders as "you have no
  care team."** Telling a patient they have no providers when they have several is the
  failure mode this codebase treats as unacceptable.
- [#379](https://github.com/Fan-Pier-Labs/openrecord/pull/379) rebuilt it against a real
  capture and then verified that capture against **two live instances, one on each Epic
  release we model**. Envelope keys and all 23 provider fields were identical on both.
- Four things the live probe corrected, each now pinned by a test:
  - **`AboutMeBlurb` is an array, not a string** (empty on every provider of both
    instances, so its element shape is still unknown). Reading it as text would have
    produced an empty string forever.
  - **`CareTeamStatus` is a number**, not a string.
  - **The antiforgery token is required on these legacy routes.** fake-mychart had been
    enforcing it on `/api/*` only, so it was accepting a request real MyChart refuses.
  - **`Relation` can be `null`** as well as `""`, for a provider with no stated role.
- `Relation` is also where the **PCP designation** lives, and an entry there can be the
  insurance payer rather than a clinician — which is why it is in `concise`.
- **Never "you have no care team":** a non-2xx, a non-JSON body, or JSON with no
  `ProvidersList` array all throw. Only an actual empty `ProvidersList` returns an empty
  list.

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

## `get_care_team`

`POST /Clinical/CareTeam/Load` and `POST /Clinical/CareTeam/LoadExternal`
(PascalCase legacy envelope, 23 provider fields, byte-identical on four live
instances across both releases).

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `ProvidersList[].Name` | Name | — | ✓ | ✓ | Who. |
| `ProvidersList[].Relation` | Role on the team; `null` or `""` for no stated role | — | ✓ | ✓ | The PCP designation lives here, and an entry can be the insurance payer rather than a clinician; a reader needs it to interpret the row. |
| `ProvidersList[].Specialty` | Specialty | — | ✓ | ✓ | What kind of provider. |
| `ProvidersList[].IsExternal` | Outside provider | — | ✓ | ✓ | An outside provider is reached differently. |
| `fromExternalList` | Came from `LoadExternal` | ✓ | ✓ | ✓ | Derived. Distinct from `IsExternal`, which the internal list can also set. |
| `externalProvidersUnavailable` | `LoadExternal` failed | ✓ | ✓ | ✓ | Derived. A partial care team presented as the whole one is the failure the scraper exists to prevent. |
| `ProvidersList[].ID` | Opaque provider id | — | ✓ | — | Identifier; detail. |
| `ProvidersList[].NationalProviderID` | NPI | — | ✓ | — | Real-world identifier; detail. |
| `ProvidersList[].DepartmentID` | Department id | — | ✓ | — | Identifier; detail. |
| `ProvidersList[].CanMessage` | Reachable through `send_message` | — | ✓ | — | Tells a consumer whether a follow-up write is possible; detail. |
| `DescriptiveTitle` | Page title ("Your Care Team") | — | ✓ | — | Harmless; detail. |
| `ProvidersList[].AboutMeBlurb` | Provider bio | — | — | — | Always empty: `[]` on every provider of four instances. |
| `ProvidersList[].Organizations`, `.SchedulableVisitTypes` | Organizations and visit types | — | — | — | Always empty: `null` on all four. |
| `ProvidersList[].CareTeamStatus` | Status code | — | — | — | Always empty: `0` on all four. |
| `ProvidersList[].Photo`, `.WebPageUrl`, `.InfoBlurbUrl`, `.CommCenterMessageUrl` | Photo and links | — | — | — | Asset / portal link. |
| `ProvidersList[].CanViewProviderDetails`, `.CanDirectSchedule`, `.CanRequestAppointment`, `.CanRequestCustomAppt`, `.HasNoProviderRecord`, `.IsNewSchedulingEnabled`, `.CanHideProvider` | Scheduling UI | — | — | — | UI flag. |
| `TabColorClass`, `IsCustomApptReqEnabled`, `CustomRequestAppointmentLink` | Page config | — | — | — | Asset / UI flag / portal link. |
