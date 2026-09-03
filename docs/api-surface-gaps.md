# Read-only MyChart API surface: what to build, in order of conviction

Findings from a live probe of a real Epic MyChart instance (passkey login, a non-root deployment
mount) on 2026-08-13, re-sorted on 2026-09-03 against what the product already ships. Everything
below was actually called against that account. No PII from those responses is reproduced here.

**This file is a ranking, not an inventory.** The 700 endpoints the sweep found are mostly worthless
to us, and the original version of this doc buried that: it sorted by *"does this account return
data"*, which is a property of the account, not of the endpoint. What decides the work is **how much
a patient learns from an endpoint that they cannot already learn from a capability we ship.** Sorted
that way, the list is short. Two tiers are worth building; everything after that is filler.

## The two things to know before picking anything up

**1. Nothing below can be built without a fresh capture.** fake-mychart holds every response to a
skeleton generated from a live instance (`realShapes.ts` + `conformToShape`), and this document
records *sizes and prose*, not field names — except for Care Team, which was captured properly and
shipped. So the real first step for any item here is a probe that dumps the response body, not a
scraper. See [Discovery tooling](#discovery-tooling).

**2. Redundancy is the main thing that kills an endpoint.** Several entries that looked like new
categories are re-cuts of data we already return. Those overlaps are called out per row below and
are the single biggest change from the previous version of this ranking.

---

# Tier 1 — build these

Real patient data, no meaningful overlap with a shipped capability, and each is one POST.

## 1.1 Record access logs — `POST /api/access-logs/GetThirdPartyAccessLogEntries` (5.9 KB)

**The strongest item on the list.** Named third-party app × named category of the record
(Medications, Allergies, Problem List, Demographics, Test Result Details, OAuth2 token grants) ×
timestamp. Nothing we ship answers "who has been reading my chart", and for a product whose whole
pitch is owning your health data, that question is close to a headline feature rather than a gap.
One POST with `{}`.

Ship `POST /api/access-logs/GetPortalAccessLogEntries` (4.8 KB) in the same capability — every portal
access with accessor and timestamp, paged via `{startIndex, count}`. The two together are the
patient-visible audit trail. (`GetClinicianAccessLogEntries` 500s on this account; see
[Tier 4](#tier-4--blocked-on-data-not-on-a-decision).)

Note the direction of the arrow: the ~51 `Log*`/`Audit*` endpoints in [Tier 5](#tier-5--dont-build)
*write* this trail. `access-logs` is the only thing that reads it.

## 1.2 Implanted devices — `POST /api/implants/GetImplants` (1.9 KB)

Implanted devices grouped by body area, with per-implant ids for detail lookup. **Zero overlap** —
no capability we ship carries implants, and `get_medical_history`'s surgical history records the
procedure, not the device left behind. It is also the rare read with a concrete safety use (MRI
compatibility, device recalls) rather than a browsing use. One POST with `{}`.

## 1.3 Patient To Do list — `POST /api/todo/GetTasks` (1.9 KB)

Tasks with frequencies, episode/flowsheet linkage and thresholds. Novel — the closest thing we ship
is `get_upcoming_orders`, which is what was ordered, not what the patient is being asked to do. The
one entry here that is *actionable* rather than historical.

Skip its siblings: `GetReminderSettings` (5.8 KB) is notification config, and `GetHighlights` /
`GetToDoProgress` / `GetPersistentTasks` / `GetToDoChanges` came back empty.

---

# Tier 2 — build if the capture is cheap

Real, but narrower: each is either a richer cut of something we already return, or account state
rather than health data. Worth doing on a day when a probe session is already open; not worth
opening one for.

## 2.1 `POST /api/record-download/loaddaterange` (67 KB)

The visit list behind "Download my record": per-visit CSN, ISO date/time, visit type, providers with
photo URLs, department with full street address. Overlaps `get_past_visits`, but is strictly richer —
and the CSNs are the *key material* that unlocks `GetDetailsByCSN` ([Tier 3](#tier-3--marginal)).
Value is mostly as a key source, which is why it sits here and not in Tier 1.

Its siblings are not worth it: `LoadSingleVisits` (15 KB) is the same visits in another envelope, and
`getvdtsettings` (509 B) is download config.

## 2.2 `POST /api/security-settings/GetInitialSettings`

Password last-updated date, which 2FA methods are on, whether TOTP/passkey/device-remember are
allowed, deactivation eligibility. Not health data — but it is the one account-hygiene read with a
question a patient actually asks ("is my 2FA on?"), and we already *write* into exactly this space
(`setup_totp`, `register_passkey`, `list_passkeys`). Reading back the state we mutate is cheap
coherence.

## 2.3 `POST /api/personalInformation/GetContextIds` — **probe before building**

Returns an opaque patient id plus user id. This is interesting for one specific reason: it may close
a real hole in the **"never read a chart without asserting whose it is"** invariant. Today
`assertProxyReadContext` can only warn about *"an unknown patient (this MyChart instance does not
report which record is active)"* when proxy targets were recovered from the React context block,
which carries no selection flag (`selectionKnown: false` in `proxyContext.ts`). A server-side answer
to "which record is active" would replace that hedge with a fact.

The catch: it is only useful if its patient id lives in the same id space as the `WP-…` ids on
`ProxyTarget`. If it doesn't correlate, it is an opaque string we can't map to a name, and the item
drops to Tier 5. **One probe decides this**, and it is the highest-information probe on the list.

---

# Tier 3 — marginal

Live and real, but each mostly re-states something a shipped capability already returns. Listed with
what it actually adds, so nobody re-litigates them.

| Endpoint | Overlaps | What it genuinely adds | Verdict |
| --- | --- | --- | --- |
| `POST /api/pharmacies/GetPreferredAndEncounterPharmacies` (2.1 KB) | `get_medications` already returns `owningPharmacy` per prescription: name, phone, formatted address, hours, **`isPreferred`** | Pharmacies with no active prescription attached, delivery methods, encounter-specific pharmacies | Small. If ever built, build **only this one** — it is a superset of `GetPreferredPharmacies` (2.0 KB), so shipping both is two capabilities for one fact |
| `POST /api/pedigree/LoadPedigree` (28 KB) | `get_medical_history` returns `familyHistoryAndStatus.familyMembers` with relationship, conditions, status, sex and relative age | The relationship *graph* between members (not just each member's relation to the patient), deceased status, richer ages | The previous ranking put this third overall on 28 KB alone. Most of those bytes are a structure we already flatten correctly. Real, but not the win the size suggests |
| `POST /api/pcp/GetPatientPCPStatus` (652 B) | `get_care_team` carries the PCP designation in `Relation` | Effective date, direct phone, address, photo URL | Tiny |
| `POST /api/trends-dashboard/LoadTrends` (9 KB) | `get_vitals` and `get_lab_results` are the underlying readings | A UI grouping of series we already fetch | An aggregation of our own data. Skip unless a client wants the grouping |
| `POST /api/test-results/GetDetailsByCSN` (2.9 KB) | `get_lab_results` uses `GetDetails` by result id | The same details keyed by encounter CSN instead | Worth it only if it surfaces results the list omits — unverified, and that is the whole question |
| `POST /api/test-results/GetCommunityInfo` (851 B) | — | Happy Together / linked-org result sources and per-org flags | Provenance metadata, not results |
| `POST /api/test-results/GetWidgetList` (64 KB) | `get_lab_results` | The home-page widget feed | 64 KB of a view we already have the data for |
| `POST /api/test-results/GetResultsReleasePreferences` (163 B) | — | One preference value | Settings |

## Consent, sharing and account settings — one block, low conviction

Real endpoints, all account/consent state rather than record content. If a "privacy and sharing
posture" capability is ever wanted, these are its parts and they should ship as **one** capability,
not thirteen. Absent that product decision, none is worth a capability of its own.

`communicationPreferences/GetPreferences` (**52 KB** of notification topic × channel checkboxes) ·
`contact-information/GetContactInfoSettings` (overlaps `get_profile`) · `textoptin/GetPhoneNumbers` ·
`authorize-sharing/GetCareEverywhereID` · `care-everywhere-opt-out/GetCeConfiguration` ·
`sharing-hub/GetSecurity` · `sharing-hub/GetSelfServiceActivities` ·
`personalInformation/GetDetailsAboutMeInformation` · `paperless-settings/GetCombinedPaperless` ·
`track-my-health/GetExternalAccounts` · `release-of-information/GetROIFormsAndTemplates` (we already
cover the EHI export templates) · `conversations/GetFoldersList` · `conversations/GetOrganizations` ·
`conversations/GetMessageMenuSettings` (the last three are messaging-UI state, not messages).

---

# Tier 4 — blocked on data, not on a decision

Live endpoints that returned `{}`, empty arrays, or a generic 500 on this account. **Nothing can be
modelled from them yet**, so they are not work items — they are re-probe targets. Ordered by what
they'd be worth *if* the data appeared.

1. **`/api/insurance-hub/*`** — `GetIDCardImages`, `GetCoverageDetails`, `GetBenefitDetails`,
   `GetMemberDetails`, `GetPlanMembers`, `GetEligInfo`. `get_insurance` today gives plan name,
   subscriber, member id and group number, parsed out of HTML. Benefits, eligibility and **a photo of
   the insurance card** are all genuinely additive and genuinely wanted. Consistent with the "no
   coverage on file" signal from `billing-details/GetBenefitsSummary` (`{noCoverageAvailable: true}`),
   so re-probe on an account with active coverage. Same for `/api/premium-billing/*`,
   `/api/insurance/LoadPayers`, `/api/coordination-of-benefits/GetBuild`.
2. **`/api/now/*`** — 26 endpoints, an entire category we don't touch: hospital-stay schedule, bedside
   care team, memos, bed info, per-event details for appointments/med administration/surgery/tasks.
   `MYCHARTNOWINPATIENTENCOUNTERS` is enabled; `GetNowInfo` returns `{}` because there is no active
   admission. High value, unprobeable without one.
3. **`/api/care-plans/GetCarePlans`** — returned a well-formed but empty envelope
   (`{availableCarePlans: [], activeCarePlans: [], isProxyContext: false}`). Care plans are real
   clinical content with no analogue in what we ship.
4. **`/api/growth-charts/GetGrowthCharts`** — pediatric; try a proxy child record. Novel, and the
   proxy surface to test it already exists.
5. **`/api/organ-donor/GetPatientInfo`** (flag is on) · `/api/genetic-profile/GetList` ·
   `/api/requested-records/GetReleaseRecords` · `/api/authorizations/*` ·
   `/api/authorized-users/LoadAuthorizedUsers` (`{success: false}` — no proxies on this record) ·
   `/api/day-at-a-glance/LoadPageInfo` · `/api/self-triage/LoadLandingPageDecisionTrees` ·
   `/api/research-studies/GetPageData` · `/api/community-resources/*` ·
   `/api/family-history/LoadFamilyHistoryQuestion` · `/api/care-journeys/GetCareJourneySettings` ·
   `/api/conversations/GetFilteredConversationList` · `/api/todo/GetTaskStatuses`,
   `GetPatientCreatedTasks` · `/api/visitcontacts/GetVisitContactInformation` ·
   `/api/test-results/GetDocumentGenerationInfo` · `/api/bill-pay/GetBillPayData` ·
   `/api/billing-details/GetDetailBillSettings` · `/api/care-everywhere-opt-out/GetAuthorizationOrgs` ·
   `/api/conversations/GetDisclaimer`.

**A 500 is not a "no".** Epic returns a generic `{"Message":"An error has occurred."}` that does not
distinguish "feature disabled" from "missing a required field". Proof: `/api/goals/LoadPatientGoals`
also 500s on a bare `{}`, and `get_goals` works fine — it just needs the right body.

## `/api/visits/*` — a migration, not a gap

`{bootstrap, past, upcoming, details, requests}` are POST-only (`GET` → 405). `bootstrap` and
`details` return a populated context object; `past` and `upcoming` return `{}` for every body tried
(`{numberOfVisits, sortAscending}`, `{pageSize, pageNumber}`, `{}`). The shape is in
`epic.px.client.visits-core.js`.

Filed here rather than in a build tier because it returns **no data we don't already have** — we
scrape the legacy `/Visits/VisitsList` HTML plus `LoadUpcoming` today, and both work. This is a
future-proofing migration against Epic retiring the legacy activity, worth doing when that retirement
looks close, not before.

---

# Tier 5 — don't build

Roughly **two-thirds of the 700**. Recorded so nobody re-derives the list and spends a day on a
typeahead helper.

| Bucket | Count | Examples |
| --- | --- | --- |
| Writes and mutations | ~199 | `Save*`, `Update*`, `Delete*`, `Submit*`, `Pay*`, `Enroll*` — out of scope for a read-only sweep; a few (refills, messages, emergency contacts) we already support deliberately |
| Signup / onboarding / marketing / UI config | ~102 | `enrollment`, `signup`, `activation`, `account-recovery`, `welcome-wizard`, `onboarding`, `branding`, `feature-library`, `mobile-download`, `non-h2g-landing-page` |
| Bedside TV, tablet and device provisioning | ~66 (the clinically useful `/api/now/*` are in Tier 4) | `bedside-tv`, `bedside-provisioning`, `tv-settings-panel`, `GetTabletCode`, `GetMobileBarcodeDataTV` |
| Telemetry, audit-write and analytics beacons | ~51 | `LogViewedActivity`, `LogLoadEducation`, `AuditMessagingShortcut`, `LogFinderMetricBeacon` — they *write* the audit trail that §1.1 reads |
| Search / typeahead helpers for write workflows | ~34 | `SearchMedications`, `SearchForAllergy`, `SearchDiagnoses`, `SearchProviders`, `SearchAddress`, `GetSearchSuggestions` — a global catalogue, not the patient's chart |
| Session, environment and routing plumbing | — | `/api/settings/*` (`IsDebugMode`, `GetDataTileUrlPrefix`, `GetSessionKeepAliveTimeout`, `GetDrivingDirectionsUrl`), `/api/sharing-hub/GetPaths`, `/api/e-signature/GetCurrentDBTimestamp`, `/api/account-management/GetCentralInfo`, `/api/continuing-care/GetSubmissionContext` |
| Form and page config | — | `/api/demographics/Load*FormConfig`, `/api/community-resources/GetSearchPageSettings`, `/api/scheduling/GetInitialSchedulingData` — which fields a form renders, not what's in the chart |
| Static reference catalogues | — | `/api/record-download/GetListOfStatesAndSpecialties` (15 KB), `/api/link-my-accounts/GetSearchSuggestions` (63 KB org directory) — large, static, not patient data |

Two entries were **demoted here from the previous "model it now" section**, and the corrections
matter more than the entries:

- **`POST /api/allergies/LoadReactions`** (5.8 KB) — the allergy *reaction reference list*: the
  catalogue you pick from when reporting an allergy. It is a global catalogue, so it belongs with the
  search/typeahead helpers above. It returns "real data" on every account, which is exactly why
  sorting by "did this account return data" misfiled it.
- **`POST /api/questionnaire/GetQuestionnaireList`** (3.9 KB) — the React-era list. We already call the
  legacy `/Questionnaire/GetQuestionnaireList` and it works. Same data, newer route; see the
  `/api/visits/*` note above for when that kind of swap becomes worth it.

---

# Discovery tooling — useful, but not scrapers

Two of the three enumeration sources are worth keeping as **dev-scripts under `dev-scripts/`**, never
as capabilities. Neither returns patient data; both answer "what does this instance expose", which is
a question we ask when adding scrapers, not one a patient asks.

- **`POST /Menu/Menu`** — JSON for the whole navigation tree (54 items across 9 submenus, each with
  its `Link`). The cheapest way to learn what a given instance enables. We are not navigating a menu,
  so it has no place in the core scrapers.
- **`EpicPx.scriptUpdates`** — an inline map of all 230 React activity chunks, fetchable at
  `/scripts/lib/pxbuild/<name>.js` with no version query. Downloading all 230 and grepping for quoted
  `/api/<controller>/<Action>` strings is what produced the 700. Pure reconnaissance.

The third source, **`EpicPx.ReactContext.user.features`** (a 306-entry feature-flag array inlined into
every logged-in page), says what the deployment *enables*, not what it exposes over HTTP — useful
alongside the other two, useless alone.

A dev-script combining all three, plus a body-dumping probe, is the actual unblocker for this
document: it turns every "worth it if the shape is X" above into a decidable question.

## What the sweep structurally could not see

The 700 covers only the **React (`/app/*`) activities**. Older jQuery/Handlebars activities live under
`/areas/<area>/<activity>/scripts/*.min.js` and use non-`/api` routes this sweep cannot see. **Care
Team is exactly such an activity** — the one shipped win from this whole document — and its endpoint
was found only by reading `areas/clinical/careteam/scripts/careteam.min.js` by hand.

That is the strongest argument in this file for a second sweep: the React sweep found 700 endpoints of
which maybe five are worth building, while a hand-read of one legacy script found a capability we
shipped. **A pass over `/areas/**` has a better hit rate than anything left in Tier 3.**

---

# Shipped: Care Team

`get_care_team` is implemented (`scrapers/myChart/chart/careTeam/`), modelled in fake-mychart
(`/Clinical/CareTeam/Load` + `/LoadExternal`, shape `careTeamLoad` in `realShapes.ts`). The capture is
kept here because this file is its only record — re-verified against **four live instances spanning
both captured Epic releases** (three behaving as November 2025, one as August 2025).

```
POST /Clinical/CareTeam/Load          → 200, the provider list
POST /Clinical/CareTeam/LoadExternal  → 200, outside/Care Everywhere providers (empty on all four)
```

- **Release-independent payload.** All four instances returned the same envelope, the same 23 provider
  fields and the same types, across both releases. Nothing here rides on the version the way the
  November-2025-only test-result fields do. The *error surface* is the one thing that moves, and it is
  the generic ASP.NET one, not something care-team-specific.
- **POST-only.** A `GET` is refused with the instance's ASP.NET error surface — a bare 500 on the
  August 2025 release, a 302 to `/Home/FiveHundred` on November 2025 — never the data.
- **The antiforgery token is required**, exactly as on `/api/*`: a token-less POST gets that same error
  surface on all four. The token comes off the `/Clinical/CareTeam` activity page (the page never names
  `CareTeam/Load` itself; the URL lives in `careteam.min.js`).
- The params the page's JS builds (`hfrId`, `sources`, `actions`, `isPrimaryStandalone`) are **all
  optional** — a bare POST with `{}` returned exactly the same list on every instance.
- PascalCase envelope (legacy MVC, not the camelCase `/api/*` convention), 23 provider fields,
  byte-identical field sets on all four instances. Types are **not** all strings:
  `{ ProvidersList: [{ ID (86–88 char opaque string), Name, Photo, NationalProviderID, WebPageUrl,
  InfoBlurbUrl, AboutMeBlurb (ARRAY — empty on every provider of all four), CanViewProviderDetails,
  CanDirectSchedule, CanRequestAppointment, CanMessage, CommCenterMessageUrl, CanRequestCustomAppt,
  HasNoProviderRecord, IsNewSchedulingEnabled, Specialty, Relation (string, and `null` or `""` for a
  provider with no stated role), SchedulableVisitTypes (NULL on all four), DepartmentID, Organizations
  (NULL on all four), IsExternal, CareTeamStatus (NUMBER, 0 on all four), CanHideProvider }],
  DescriptiveTitle, TabColorClass, IsCustomApptReqEnabled, CustomRequestAppointmentLink }`
- `Relation` carries the role (the PCP designation appears here); `Specialty` the department specialty.
  **Not every entry is a clinician** — one instance listed the patient's insurance payer with
  `Relation: "Payer"`, no NPI and no specialty. `NationalProviderID`, `Specialty`, `Photo`,
  `WebPageUrl`, `InfoBlurbUrl` and `CommCenterMessageUrl` are all empty strings on some real entries,
  so only `ID` and `Name` can be relied on. `LoadExternal` returns the same envelope with its own
  `ProvidersList`; it was empty on all four accounts.
- `AboutMeBlurb`, `Organizations` and `SchedulableVisitTypes` are **not surfaced by the scraper**: an
  empty array and two nulls, on all four instances, tell you the key exists, not what it holds. They
  get added when a capture shows one populated.
- The scraper refuses to read a missing `ProvidersList` as an empty care team — that silent failure is
  what got the previous implementation withdrawn (#313) — and reports a `LoadExternal` it could not
  read as `externalProvidersUnavailable` rather than as "no outside providers".

---

# Order of work

1. **A capture dev-script** — `/Menu/Menu` + `scriptUpdates` + `features`, plus a body dumper. Every
   item below is gated on it, and it is the only thing here that isn't.
2. **Access logs** (Tier 1.1) — the headline read, and the one nothing else in the product answers.
3. **`GetContextIds` probe** (Tier 2.3) — cheapest probe, highest information: it either hardens the
   active-patient invariant or drops to Tier 5, and one response decides which.
4. **Implants, then To Do** (Tier 1.2, 1.3) — two self-contained reads with no overlap.
5. **A second sweep over `/areas/**`** — better expected hit rate than everything left in Tier 3.
6. Tier 2 leftovers, opportunistically, whenever a probe session is already open.

Anything added lands in `shared/capabilities/` with a matching fake-mychart route and a `realShapes.ts`
skeleton generated from a live capture, per the fake's faithful-stand-in rule.
