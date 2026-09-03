# Read-only MyChart API surface: what we cover and what we don't

Findings from a live probe of a real Epic MyChart instance (passkey login, a non-root deployment
mount) on 2026-08-13. Everything below was actually called against that account. No PII from those
responses is reproduced here.

The gap splits three ways, and the split is what decides the work:

1. [**Model it now**](#1-model-it-now) — useful, and this instance returns real data, so the response
   shape can be captured and rebuilt in fake-mychart today.
2. [**Later, needs a chart that has the data**](#2-later--endpoint-is-live-but-this-account-has-nothing-in-it)
   — useful, but this account returns `{}` or empty arrays, so there is nothing to model a fixture
   from yet.
3. [**Don't implement**](#3-dont-implement) — plumbing, telemetry, UI config, signup funnels. Real
   endpoints, no product value.

## How the surface was enumerated

Three sources, since none is complete alone:

1. **`EpicPx.ReactContext.user.features`** — a 306-entry array inlined into every logged-in page.
   The instance's authoritative feature-flag list (`PATIENTIMPLANTS`, `TRENDSDASHBOARD`,
   `ORGANDONORSU`, `MYCHARTAUDITTRAIL`, …). Says what the deployment *enables*, not what it exposes
   over HTTP.
2. **`POST /Menu/Menu`** — JSON for the whole navigation tree: 54 menu items across 9 submenus, each
   with its `Link`. What a patient can actually click.
3. **`EpicPx.scriptUpdates`** — an inline map of all **230 React activity chunks**
   (`epic.px.client.<activity>.js`, fetchable at `/scripts/lib/pxbuild/<name>.js` with no version
   query). Downloading all 230 and grepping for quoted `/api/<controller>/<Action>` strings yields
   **700 distinct endpoints**.

**We call 48 of those 700.** All 48 are already modelled in fake-mychart, so for practical purposes
*"not supported" and "not in the fake" are the same list*.

### Methodology limit worth knowing

The 700 covers only the **React (`/app/*`) activities**. Older jQuery/Handlebars activities live
under `/areas/<area>/<activity>/scripts/*.min.js` and use non-`/api` routes this sweep could not see.
Care Team is exactly such an activity, and its endpoint was found only by reading
`areas/clinical/careteam/scripts/careteam.min.js` by hand. A second pass over `/areas/**` would
likely surface more.

---

# 1. Model it now

Live on this account, returning real data. Each of these can have its shape captured into
`realShapes.ts` and a fake-mychart route built against it.

## 1a. Care Team — DONE, shipped against this capture

`get_care_team` is implemented (`scrapers/myChart/chart/careTeam.ts`), modelled in fake-mychart
(`/Clinical/CareTeam/Load` + `/LoadExternal`, shape `careTeamLoad` in `realShapes.ts`), and no longer
a declared-but-unimplemented stub — a state the registry no longer has at all. The capture,
re-verified against **four live instances spanning both captured Epic releases** (three behaving as
November 2025, one as August 2025), because this file is the only record of it:

```
POST /Clinical/CareTeam/Load          → 200, the provider list
POST /Clinical/CareTeam/LoadExternal  → 200, outside/Care Everywhere providers (empty on all four)
```

- **Release-independent payload.** All four instances returned the same envelope, the same 23
  provider fields and the same types, across both releases. Nothing here rides on the version the
  way the November-2025-only test-result fields do. The *error surface* is the one thing that
  moves, and it is the generic ASP.NET one, not something care-team-specific.
- **POST-only.** A `GET` is refused with the instance's ASP.NET error surface — a bare 500 on the
  August 2025 release, a 302 to `/Home/FiveHundred` on November 2025 — never the data.
- **The antiforgery token is required**, exactly as on `/api/*`: a token-less POST gets that same
  error surface on all four. The token comes off the `/Clinical/CareTeam` activity page (the
  page never names `CareTeam/Load` itself; the URL lives in `careteam.min.js`).
- The params the page's JS builds (`hfrId`, `sources`, `actions`, `isPrimaryStandalone`) are **all
  optional** — a bare POST with `{}` returned exactly the same list on every instance.
- PascalCase envelope (legacy MVC, not the camelCase `/api/*` convention), 23 provider fields,
  byte-identical field sets on all four instances. Types are **not** all strings:
  `{ ProvidersList: [{ ID (86–88 char opaque string), Name, Photo, NationalProviderID, WebPageUrl,
  InfoBlurbUrl, AboutMeBlurb (ARRAY — empty on every provider of all four), CanViewProviderDetails,
  CanDirectSchedule, CanRequestAppointment, CanMessage, CommCenterMessageUrl, CanRequestCustomAppt,
  HasNoProviderRecord, IsNewSchedulingEnabled, Specialty, Relation (string, and `null` or `""` for a
  provider with no stated role), SchedulableVisitTypes (NULL on all four), DepartmentID,
  Organizations (NULL on all four), IsExternal, CareTeamStatus (NUMBER, 0 on all four),
  CanHideProvider }],
  DescriptiveTitle, TabColorClass, IsCustomApptReqEnabled, CustomRequestAppointmentLink }`
- `Relation` carries the role (the PCP designation appears here); `Specialty` the department
  specialty. **Not every entry is a clinician** — one instance listed the patient's insurance payer
  with `Relation: "Payer"`, no NPI and no specialty. `NationalProviderID`, `Specialty`, `Photo`,
  `WebPageUrl`, `InfoBlurbUrl` and `CommCenterMessageUrl` are all empty strings on some real
  entries, so only `ID` and `Name` can be relied on. `LoadExternal` returns the same envelope with
  its own `ProvidersList`; it was empty on all four accounts.
- `AboutMeBlurb`, `Organizations` and `SchedulableVisitTypes` are **not surfaced by the scraper**:
  an empty array and two nulls, on all four instances, tell you the key exists, not what it holds. They get added when a
  capture shows one populated.
- The scraper refuses to read a missing `ProvidersList` as an empty care team — that silent
  failure is what got the previous implementation withdrawn (#313) — and reports a `LoadExternal`
  it could not read as `externalProvidersUnavailable` rather than as "no outside providers".

## 1b. Chart data with no capability at all

Sizes are the real response bodies.

| Endpoint | Size | What it returns |
| --- | --- | --- |
| `POST /api/pedigree/LoadPedigree` | 28 KB | The full family-history pedigree — family member dictionary, relationships, sex/gender, alive/deceased status, ages, conditions |
| `POST /api/trends-dashboard/LoadTrends` | 9 KB | Trends Dashboard series: grouped trend IDs and readings |
| `POST /api/implants/GetImplants` | 1.9 KB | Implanted devices grouped by body area, with per-implant IDs for detail lookup |
| `POST /api/todo/GetTasks` | 1.9 KB | The patient To Do list — tasks, frequencies, episode/flowsheet linkage, thresholds |
| `POST /api/todo/GetReminderSettings` | 5.8 KB | To Do reminder schedule/config |
| `POST /api/pcp/GetPatientPCPStatus` | 652 B | Current PCP: name, effective date, photo URL, phone, address |
| `POST /api/pharmacies/GetPreferredPharmacies` | 2.0 KB | Preferred pharmacies with delivery methods |
| `POST /api/pharmacies/GetPreferredAndEncounterPharmacies` | 2.1 KB | The above plus encounter-specific pharmacies |
| `POST /api/allergies/LoadReactions` | 5.8 KB | Allergy reaction reference list |
| `POST /api/questionnaire/GetQuestionnaireList` | 3.9 KB | React-era questionnaire list (we call the legacy `/Questionnaire/GetQuestionnaireList`) |

## 1c. Record access and disclosure — live, and squarely on-product

| Endpoint | Size | What it returns |
| --- | --- | --- |
| `POST /api/access-logs/GetThirdPartyAccessLogEntries` | 5.9 KB | **Which third-party app read which category of the record, and when** — named app, named category (Medications, Allergies, Problem List, Demographics, Test Result Details, OAuth2 token grants), timestamp |
| `POST /api/access-logs/GetPortalAccessLogEntries` | 4.8 KB | Every portal access: accessor and timestamp. Accepts `{startIndex, count}` |
| `POST /api/record-download/loaddaterange` | 67 KB | The full visit list behind "Download my record" (CCD): per-visit CSN, ISO date/time, visit type, providers with photo URLs, department with full address |
| `POST /api/record-download/LoadSingleVisits` | 15 KB | The same visits in single-download form |
| `POST /api/record-download/getvdtsettings` | 509 B | View/Download/Transmit settings, incl. password-protected download flags |
| `POST /api/release-of-information/GetROIFormsAndTemplates` | 1.7 KB | ROI forms and templates (we only cover the EHI export templates) |
| `POST /api/sharing-hub/GetSelfServiceActivities` | 339 B | Self-service reports the patient can generate on demand, with template IDs |

## 1d. Results — endpoints beyond the two we use

| Endpoint | Size | What it returns |
| --- | --- | --- |
| `POST /api/test-results/GetWidgetList` | 64 KB | The results widget feed |
| `POST /api/test-results/GetDetailsByCSN` | 2.9 KB | Result details keyed by **encounter CSN** — we only have `GetDetails` by result id. Verified with a real CSN taken from `loaddaterange` |
| `POST /api/test-results/GetCommunityInfo` | 851 B | Happy Together / linked-organization result sources, per-org capability flags |
| `POST /api/test-results/GetResultsReleasePreferences` | 163 B | The patient's result-release preference and the available options |

## 1e. Account, consent and sharing state

| Endpoint | What it returns |
| --- | --- |
| `POST /api/security-settings/GetInitialSettings` | Password last-updated date, which 2FA methods are on, whether TOTP/passkey/device-remember are allowed, deactivation eligibility |
| `POST /api/communicationPreferences/GetPreferences` | **52 KB** — every notification topic × channel preference |
| `POST /api/contact-information/GetContactInfoSettings` | Secure email/mobile on file, verification-pending flags |
| `POST /api/textoptin/GetPhoneNumbers` | SMS opt-in state and whether the number can be changed |
| `POST /api/authorize-sharing/GetCareEverywhereID` | The patient's Care Everywhere ID and signing privileges |
| `POST /api/care-everywhere-opt-out/GetCeConfiguration` | Care Everywhere opt-in state, consent requirements, authorizations on file |
| `POST /api/sharing-hub/GetSecurity` | Which sharing surfaces this patient actually has |
| `POST /api/personalInformation/GetDetailsAboutMeInformation` | The "Details About Me" block |
| `POST /api/personalInformation/GetContextIds` | Opaque patient id + user id — directly useful for the "assert whose chart this is" invariant |
| `POST /api/paperless-settings/GetCombinedPaperless` | Paperless billing/communication state |
| `POST /api/track-my-health/GetExternalAccounts` | Linked external device/data accounts |
| `POST /api/conversations/GetFoldersList` | Message folder counts (inbox/sent/drafts/archive, unread badges) |
| `POST /api/conversations/GetOrganizations` | Linked orgs and per-org messaging capabilities |
| `POST /api/conversations/GetMessageMenuSettings` | Which per-thread actions are available |

---

# 2. Later — endpoint is live, but this account has nothing in it

These returned 200 with `{}` / empty arrays, or a 500 that reads as "no data / feature not
provisioned for this patient" rather than "endpoint doesn't exist". **There is nothing to build a
fixture from yet.** Re-probe on an account that has the data — a different instance, a proxy child
record, or this account after the relevant event.

## 2a. Returned an empty but well-formed envelope

The shape is half-visible, which is a start, but the array contents are not.

| Endpoint | What came back |
| --- | --- |
| `/api/care-plans/GetCarePlans` | `{availableCarePlans: [], activeCarePlans: [], isProxyContext: false}` |
| `/api/requested-records/GetReleaseRecords` | `{pendingReleases: [], currentReleases: [], pastReleases: [], …}` |
| `/api/community-resources/GetSavedCommunityResources` | `{savedCommunityResources: [], …}` |
| `/api/community-resources/GetActiveResourceRecommendations` | `{resources: [], …}` |
| `/api/todo/GetHighlights` | `{highlights: []}` |
| `/api/todo/GetToDoProgress` | `{todoProgress: {}}` |
| `/api/authorizations/GetAuthorizationsList` / `GetAuthorizationDetails` | Capability flags only — no authorizations on file |
| `/api/authorized-users/LoadAuthorizedUsers` | `{success: false}` — no proxies granted on this record |
| `/api/billing-details/GetBenefitsSummary` | `{noCoverageAvailable: true, …}` — no coverage on file |
| `/api/todo/GetPersistentTasks`, `/api/todo/GetToDoChanges` | `{}` |
| `/api/visitcontacts/GetVisitContactInformation` | `{}` |
| `/api/test-results/GetDocumentGenerationInfo` | `{}` |
| `/api/conversations/GetDisclaimer` | `{}` |
| `/api/bill-pay/GetBillPayData`, `/api/billing-details/GetDetailBillSettings` | `{}` |
| `/api/care-everywhere-opt-out/GetAuthorizationOrgs` | `{}` |

## 2b. The new visits API — live, but the request shape isn't pinned down

`/api/visits/{bootstrap,past,upcoming,details,requests}` are **POST-only** (`GET` → 405).
`bootstrap` and `details` return 200 with a populated context object; `past` and `upcoming` return
`{}` for every request body tried (`{numberOfVisits, sortAscending}`, `{pageSize, pageNumber}`, `{}`).
The shape is in `epic.px.client.visits-core.js` and worth extracting — we currently scrape the legacy
`/Visits/VisitsList` HTML plus `LoadUpcoming`, and this would replace both.

## 2c. Inpatient / bedside — 26 endpoints, gated on an active admission

`/api/now/*` — `GetNowInfo`, `GetInpatientSchedule`, `GetMemos`, `GetBedInfo`,
`GetInpatientAppointmentEventDetails`, `GetInpatientMedicationAdministrationEventDetails`,
`GetInpatientSurgeryEventDetails`, `GetInpatientTaskEventDetails`, `GetEncounterSpecificProvider*`.
`MYCHARTNOWINPATIENTENCOUNTERS` is enabled on this instance; `GetNowInfo` returns `{}` because there
is no active admission. This is an entire category — hospital-stay schedule, bedside care team,
memos — that we don't touch and can't model until someone is admitted.

## 2d. 500s that read as "not provisioned for this patient"

Epic returns a generic `{"Message":"An error has occurred."}` that does **not** distinguish "feature
disabled" from "missing required field", so these need re-probing rather than writing off. Proof of
the ambiguity: `/api/goals/LoadPatientGoals` also 500s on a bare `{}` even though `get_goals` works
fine — it just needs the right body.

`/api/insurance-hub/*` (GetCoverageDetails, GetBenefitDetails, GetMemberDetails, GetPlanMembers,
GetIDCardImages, GetEligInfo) · `/api/premium-billing/*` · `/api/insurance/LoadPayers` ·
`/api/coordination-of-benefits/GetBuild` — all consistent with the "no coverage on file" signal from
`GetBenefitsSummary`.

`/api/organ-donor/GetPatientInfo` (flag is on) · `/api/growth-charts/GetGrowthCharts` (pediatric —
try a proxy child record) · `/api/genetic-profile/GetList` · `/api/family-history/LoadFamilyHistoryQuestion` ·
`/api/access-logs/GetClinicianAccessLogEntries` · `/api/day-at-a-glance/LoadPageInfo` ·
`/api/care-journeys/GetCareJourneySettings` · `/api/conversations/GetFilteredConversationList` ·
`/api/todo/GetTaskStatuses`, `/api/todo/GetPatientCreatedTasks` · `/api/self-triage/LoadLandingPageDecisionTrees` ·
`/api/research-studies/GetPageData`.

---

# 3. Don't implement

Real endpoints, no product value. Roughly **two-thirds of the 700** fall here. Recorded so nobody
re-derives the list and spends a day on a typeahead helper.

| Bucket | Count | Examples |
| --- | --- | --- |
| Writes and mutations | ~199 | `Save*`, `Update*`, `Delete*`, `Submit*`, `Pay*`, `Enroll*` — out of scope for a read-only sweep; a few (refills, messages, emergency contacts) we already support deliberately |
| Signup / onboarding / marketing / UI config | ~102 | `enrollment`, `signup`, `activation`, `account-recovery`, `welcome-wizard`, `onboarding`, `branding`, `feature-library`, `mobile-download`, `non-h2g-landing-page` |
| Bedside TV, tablet and device provisioning | ~66 (of which the clinically useful `/api/now/*` are in §2c) | `bedside-tv`, `bedside-provisioning`, `tv-settings-panel`, `GetTabletCode`, `GetMobileBarcodeDataTV` |
| Telemetry, audit-write and analytics beacons | ~51 | `LogViewedActivity`, `LogLoadEducation`, `AuditMessagingShortcut`, `LogFinderMetricBeacon` — these *write* an audit trail, they don't read one (the readable log is `access-logs`, in §1c) |
| Search / typeahead helpers for write workflows | ~34 | `SearchMedications`, `SearchForAllergy`, `SearchDiagnoses`, `SearchProviders`, `SearchAddress`, `GetSearchSuggestions` — they search a global catalogue, not the patient's chart |
| Session, environment and routing plumbing | — | `/api/settings/*` (`IsDebugMode`, `GetDataTileUrlPrefix`, `GetSessionKeepAliveTimeout`, `GetDrivingDirectionsUrl`), `/api/sharing-hub/GetPaths` (route map), `/api/e-signature/GetCurrentDBTimestamp`, `/api/account-management/GetCentralInfo`, `/api/continuing-care/GetSubmissionContext` (echoes the user's own name) |
| Form and page config | — | `/api/demographics/Load*FormConfig`, `/api/community-resources/GetSearchPageSettings`, `/api/scheduling/GetInitialSchedulingData` — describe which fields a form renders, not what's in the chart |
| Static reference catalogues | — | `/api/record-download/GetListOfStatesAndSpecialties` (15 KB), `/api/link-my-accounts/GetSearchSuggestions` (63 KB org directory) — large, static, not patient data |

`POST /Menu/Menu` belongs here too as a *capability*, but it is genuinely useful as **discovery
tooling**: it's the cheapest way to learn what a given instance exposes, and it's how the activity
list above was built.

---

# Suggested order of work

1. ~~**Care team** (§1a)~~ — done: implemented against the capture in §1a.
2. **Third-party access log** (§1c) — which apps read which categories of the record. For a product
   about owning your health data that is close to a headline feature, and it's one POST with `{}`.
3. **Implants, pedigree, trends dashboard, preferred pharmacies, PCP, To Do** (§1b) — six
   self-contained reads, each a single POST with `{}`, each returning real data today.
4. **`GetDetailsByCSN` and the record-download visit list** (§1c/§1d) — richer encounter-level data
   than what we currently pull.
5. **`/api/visits/*`** (§2b) — extract the request shape from the bundle, then decide whether to
   migrate off the legacy visits scrape.
6. **Second sweep over `/areas/**` legacy scripts** — the React sweep structurally cannot see them,
   and Care Team proves that's where real endpoints hide.

Anything added lands in `shared/capabilities/` with a matching fake-mychart route and a
`realShapes.ts` skeleton generated from a live capture, per the fake's faithful-stand-in rule.
