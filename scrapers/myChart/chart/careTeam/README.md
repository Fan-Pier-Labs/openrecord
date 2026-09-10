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
| `POST /api/Providers/GetProviderBioPrivate` | `{ "id": <row's ID> }` | one provider's bio — the NPI lives here, in plain digits |

The list calls are **POST-only** — a GET is refused with the instance's own ASP.NET error surface (a
bare 500 on the August 2025 release, a 302 to `/Home/FiveHundred` on November 2025) rather
than serving the data — and both **require the antiforgery token**, exactly as `/api/*`
routes do. Every parameter the page's own JS sends (`hfrId`, `sources`, `actions`,
`isPrimaryStandalone`) is optional: a bare `{}` returns the identical list.

The envelope is **PascalCase** (`ProvidersList`), not the camelCase the React `/api/*`
routes use — this is a legacy jQuery/Handlebars activity.

The two list calls are independent. Care Everywhere is optional per deployment, so a failure on
the outside-provider arm is not fatal: it is reported as `externalProvidersUnavailable`
rather than as "no outside providers".

The bio call is the React provider-details page's data request, made once per row the page
itself would link to its details (`CanViewProviderDetails`, and not `HasNoProviderRecord`),
in parallel, with the same antiforgery token the list calls used. It takes the row's
encrypted `ID` as sent — no `isIdEncrypted` flag needed (the page adds one on mobile; the
server accepts the id with or without it). An id it cannot resolve — another record's token,
the `NationalProviderID` token, an empty string, bare digits — is HTTP 500
`{"Message":"An error has occurred."}`; a GET is 405; a token-less POST is the ASP.NET
"Runtime Error" HTML page. Each of those is recorded, not thrown: a missing bio costs that
row's `npi`, never the care team.

## Notes and research

**Guessing this shape is not an option here.** A wrong guess does not fail visibly — it
renders as *"you have no care team"*, and telling a patient they have no providers when they
have several is the failure mode this codebase treats as unacceptable. So the contract below
is a capture, verified against **two live instances, one on each Epic release we model**
([#379](https://github.com/Fan-Pier-Labs/openrecord/pull/379)); envelope keys and all 23
provider fields were identical on both.

Five field facts that are not what they look like, each pinned by a test:

- **`NationalProviderID` is not an NPI, and the NPI is one request away.** The field holds the
  NPI Epic-encrypted — a `WP-$…$…` token in the same envelope as `ID` and `DepartmentID`: a
  16-byte prefix and 32 bytes of ciphertext under a key that never leaves the server, so
  nothing client-side turns it into digits — and it is empty where the provider has none.
  It is raw-only: a field called "NationalProviderID" in `standard` sent callers straight
  into `lookup_npi`, which rejects it on the check digit, and nothing takes it as input. The
  server holds the key, so the server is asked: the page's own "provider details" link posts
  the row's `ID` to `GetProviderBioPrivate`, whose answer carries `npi` in plain digits.
  That is the derived `npi`. Evidence, four live instances, 12 care-team rows: the list field
  was encrypted on exactly the 10 rows whose bio carried an NPI and empty on the 2 that did
  not (a payer, and a provider one instance has no NPI on file for); every NPI was 10 digits
  and check-digit valid and named that provider in the NPI registry (7/7 on the first
  instance also matched by the state license number the bio lists beside it).

- **`AboutMeBlurb` is an array, not a string.** It is empty on every provider of both
  instances, so its element shape is unknown — reading it as text yields an empty string
  forever, so the scraper does not surface it. `Organizations` and `SchedulableVisitTypes`
  are `null` on both and are unsurfaced for the same reason.
- **`CareTeamStatus` is a number**, not a string.
- **`Relation` can be `null`** as well as `""`, for a provider with no stated role. It is
  also where the **PCP designation** lives, and an entry there can be the insurance payer
  rather than a clinician — which is why it is in `concise`.
- **The antiforgery token is required on these legacy routes**, exactly as on `/api/*`. A
  fake that gates only `/api/*` accepts a request real MyChart refuses.

**How the bio endpoint was found**, for the next legacy activity: the care team page's
`areas/clinical/careteam/scripts/careteam.min.js` is fetchable without a login on any
instance, and its `providerdetails` click handler builds `app/providers/details?id=<ID>`
(`&isIdEncrypted=1` on mobile) — a React activity, whose bundle
`scripts/lib/pxbuild/epic.px.client.providers.js` names `/api/Providers/GetProviderBioPrivate`
and a `providerDetails` component destructuring `npi`. An unauthenticated sweep of the
instance directory found that bundle naming the endpoint on 1292 of the 1338 instances that
serve the care team; the 14 real exceptions run Epic releases from February 2025 and earlier,
where `/app/providers/details` does not exist yet (the rest are directory entries whose mount
has moved). There, the bio call fails and `npi` is null.

The tokens are **stable within a session**: two `Load` calls seconds apart returned
byte-identical `ID`, `NationalProviderID` and `DepartmentID` on 7/7 rows, which the page's
own `deduplicateProvidersList` relies on (it merges the two lists on `NationalProviderID`
equality). They are **not the same across endpoints**: the same clinician carries a
different token on the care team, a past visit and a conversation, so a cache keyed by
token only ever saves a repeat of the same call. The bio endpoint resolves those other
tokens too — 57/57 provider ids from past and upcoming visits, the conversation list and
the message recipients answered with the provider's bio on one instance — which is what a
provider-wide `npi` would build on. Whether a token survives a new login is untested; this
scraper never needs it to, since it resolves the bio in the session that listed it.

**Never "you have no care team":** a non-2xx, a non-JSON body, or JSON with no
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
instances across both releases), then `POST /api/Providers/GetProviderBioPrivate`
per linked row (camelCase React envelope, 45 fields, verified on four instances).

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `ProvidersList[].Name` | Name | — | ✓ | ✓ | Who. |
| `ProvidersList[].Relation` | Role on the team; `null` or `""` for no stated role | — | ✓ | ✓ | The PCP designation lives here, and an entry can be the insurance payer rather than a clinician; a reader needs it to interpret the row. |
| `ProvidersList[].Specialty` | Specialty | — | ✓ | ✓ | What kind of provider. |
| `ProvidersList[].IsExternal` | Outside provider | — | ✓ | ✓ | An outside provider is reached differently. |
| `fromExternalList` | Came from `LoadExternal` | ✓ | ✓ | ✓ | Derived. Distinct from `IsExternal`, which the internal list can also set. |
| `externalProvidersUnavailable` | `LoadExternal` failed | ✓ | ✓ | ✓ | Derived. A partial care team presented as the whole one is the failure the scraper exists to prevent. |
| `npi` | The provider's NPI, from the bio's `npi` for this row's `ID` | ✓ | ✓ | ✓ | Derived. The real-world identifier, and what `lookup_npi` takes; `null` means the bio was not fetched, did not answer, or carried none (nurses, medical assistants, a payer) — not that the field was withheld. |
| `ProvidersList[].ID` | Opaque provider id | — | ✓ | — | Identifier; detail. |
| `ProvidersList[].DepartmentID` | Department id | — | ✓ | — | Identifier; detail. |
| `ProvidersList[].CanMessage` | Reachable through `send_message` | — | ✓ | — | Tells a consumer whether a follow-up write is possible; detail. |
| `DescriptiveTitle` | Page title ("Your Care Team") | — | ✓ | — | Harmless; detail. |
| `ProvidersList[].NationalProviderID` | The NPI, Epic-encrypted; `""` where there is none | — | — | — | Internal. The name sent callers into `lookup_npi`, which rejects it on the check digit; nothing takes it as input, and `npi` carries the digits. |
| `ProvidersList[].AboutMeBlurb` | Provider bio | — | — | — | Always empty: `[]` on every provider of four instances. |
| `ProvidersList[].Organizations`, `.SchedulableVisitTypes` | Organizations and visit types | — | — | — | Always empty: `null` on all four. |
| `ProvidersList[].CareTeamStatus` | Status code | — | — | — | Always empty: `0` on all four. |
| `ProvidersList[].Photo`, `.WebPageUrl`, `.InfoBlurbUrl`, `.CommCenterMessageUrl` | Photo and links | — | — | — | Asset / portal link. |
| `ProvidersList[].CanViewProviderDetails`, `.CanDirectSchedule`, `.CanRequestAppointment`, `.CanRequestCustomAppt`, `.HasNoProviderRecord`, `.IsNewSchedulingEnabled`, `.CanHideProvider` | Scheduling UI | — | — | — | UI flag. |
| `TabColorClass`, `IsCustomApptReqEnabled`, `CustomRequestAppointmentLink` | Page config | — | — | — | Asset / UI flag / portal link. |
| bio `name`, `nameLastFirst`, `gender`, `credentials`, `specialties`, `specialtyIds`, `locations[]` (name, address, phone, coordinates), `licenses[]` (state, number), `isInternal`, `providerPatientRelation` | The rest of the provider bio, populated on every clinician | — | — | — | Fetched for `npi`; raw-only until a provider-profile capability gives them a home — a clinic address and a state license are a provider directory, not the care team, and `name` and `specialties` duplicate the row. |
| bio `photoUrl`, `staticPhotoUrl`, `bioPath`, `bioSlug`, `bioId`, `id`, `webPageUrl`, `allPublicationsUrl` | Photo, portal links, the bio's own tokens | — | — | — | Asset / portal link / internal. |
| bio `race`, `ethnicity`, `languages`, `clinicalInterests`, `aboutMe`, `videos`, `patientGroupsSeen`, `seesNewPatients`, `standardFilterNames`, `nrxFilterNames`, `managedCareFilterName`, `rating`, `reviews`, `educationEntries`, `publications`, `affiliations`, `keywords`, `boardCertifications`, `hospitalAffiliations`, `completedCulturalTraining`, `specialtySearchTerms` | Bio sections | — | — | — | Always empty: `[]`, `""` or zeros on every provider of the instance captured in full; element shapes unseen. |
