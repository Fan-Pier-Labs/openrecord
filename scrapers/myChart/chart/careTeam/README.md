# `careTeam` — what each mode carries

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
