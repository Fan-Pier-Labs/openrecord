# Processor layer: what each capability returns in each mode

A proposal. Nothing here is implemented yet. It covers the scraper layer only:
what every read capability's raw HTTP response contains, and which of those
fields the four output modes carry. How the CLI, the MCPB and the Expo app pick
a mode is a separate change.

The inventory behind every table came from reading each scraper, the captured
live skeletons in `fake-mychart/src/data/realShapes.ts`, the fixtures in
`fake-mychart/src/data/homer.ts`, `realBehavior.integration.test.ts`,
`docs/api-surface-gaps.md`, and the three PRs that already started this work
(#375, #377, #380).

## 1. The layer

Today a scraper does two jobs: it talks to MyChart, and it decides what the
caller gets to see. Those decisions are scattered and inconsistent. Medications
picks 12 fields out of ~150 and throws the rest away. Visits returns all 159
fields of Epic's view model untouched. Labs deletes one field and keeps the other
~120. Notes hand back raw HTML. Preventive care parses an HTML page into records
and the page itself is gone.

The processor layer splits the two jobs.

```
scraper   : MyChartRequest → RawResponse            (network only, no editing)
processor : RawResponse × mode → output              (pure, no network)
```

One processor per scraper, living next to it (`scrapers/myChart/chart/<name>.ts`
gets `<name>.processor.ts`). The capability registry runs the scraper, then the
processor, and the `mode` becomes a parameter every read capability accepts.
Clients pass whichever mode suits them; none of them post-processes.

### Modes

| Mode | What it is | Format |
| --- | --- | --- |
| `raw` | The HTTP response body, byte-for-byte as MyChart sent it. HTML snippets, always-empty fields, wrong fields, Epic's UI flags, everything. | JSON (or the HTML string, for HTML endpoints) |
| `standard` | Everything with any chance of being useful to a consumer. HTML is stripped into new text fields. Fields that are always empty, always wrong, or describe MyChart's own web UI are removed. | Markdown |
| `concise` | The subset of `standard` that answers "what happened / what is it / when / who". | Markdown |
| `json` | Exactly the data behind `standard`, as JSON. | JSON |

`standard` and `json` are one thing rendered two ways. The processor builds one
object (the *standard object*), `json` serializes it, and `standard` renders it
through a shared markdown renderer. `concise` is a projection of the same object,
also rendered to markdown. There is never a field in `standard` that is not in
`json`, or the other way round.

### Rules

1. **Raw is untouched.** Whatever cleanup a scraper does today moves into its
   processor. PR #375's `dropUnusableAbnormalFlags` is the model: the field
   exists in `raw`, and only in `raw`.
2. **A MyChart field is never edited in place, and never shadowed.** A field that
   passes through keeps MyChart's name, casing and value. Anything the processor
   computes gets a *new* name, so one name means one thing everywhere in the
   codebase. `body` is always MyChart's body; the stripped text is `bodyText`.
   `Instant` is always Epic's `/Date(ms)/` string; the parsed value is
   `instantISO`.
3. **Derived-field naming.** Suffix by what was done:
   `<field>Text` for markup stripped to plain text, `<field>ISO` for a
   timestamp normalized to ISO-8601, `<field>Number` for a parsed amount. A field
   the processor synthesizes from several raw fields (a status word, a flattened
   list) gets a plain camelCase name that no MyChart field uses and is listed in
   this document.
4. **Dropping needs evidence.** A field leaves `standard` only for one of the
   reasons in §2, and the processor's comment says which. "Looks useless" is not
   a reason; a patient's data is not recoverable without another round trip.
5. **Handles survive every mode.** Any id another capability takes as input
   (`Csn`, `hnoId`/`hnoDat`/`lrpId`, `hthId`, `image_id`, contact `id`, proxy
   `Id`) is in `standard` and `concise`. A concise view that cannot be followed
   up on is a dead end.
6. **`false`, `0` and empty arrays are kept in `standard`.** "Not refillable"
   and "no known allergies" are answers. `concise` may drop them.
7. **Errors pass through.** A scrape-error shape (`{ error }`), a WAF
   interstitial, a literal `null` from an unknown id: the processor returns it
   unchanged in every mode. Summarizing an error into nothing hides why the
   scrape failed.
8. **No clock, no locale.** Dates come from MyChart's own rendering or from a
   field that carries an explicit instant. The processor never formats an
   instant in the process's local zone (PR #380's reasoning: that moves an
   evening appointment to the wrong day).

### The raw envelope for multi-request scrapers

Half the scrapers issue more than one request (labs is four list calls plus two
or three per order; billing is a page scrape plus three JSON calls per account;
past visits pages). "The raw HTTP response" is therefore a list, not a value.

```ts
type RawResponse = {
  requests: Array<{
    path: string;            // as sent, minus the noCache nonce
    method: 'GET' | 'POST';
    requestBody?: unknown;   // the JSON we posted, when it matters (orderKey, csn…)
    status: number;
    contentType: string;
    body: unknown;           // parsed JSON, or the HTML/text string
  }>;
};
```

For a single-request scraper `raw` mode returns `requests[0].body` directly so a
CLI user sees the endpoint's JSON, not a wrapper. For multi-request scrapers it
returns the envelope. The `standard` object is built from the envelope, so
merging (visits pages, lab detail + trend + report) is processor work, not
scraper work.

## 2. Field classes that get dropped from `standard`, everywhere

These recur across most endpoints. A processor cites the class rather than
re-arguing it.

| Class | Examples | Why |
| --- | --- | --- |
| **Web-UI affordances** | `IsRescheduleEnabled`, `CanShowECheckIn`, `showRefillButton`, `hasUpdateSecurity`, `CanHideProvider`, `ShouldShowECheckInInGuideBanner` | Say which buttons MyChart's own page renders. No information about the patient. Visits alone has ~90 of them. |
| **Portal navigation** | `quickLinkDictionary`, `legacyMessageDetailsUrl`, `contentLinkURL`, `WebPageUrl`, `healthIssuesUrl`, `medicationsUrl`, `visitDetailsURL`, `replyUrl` | Relative URLs into the web portal. Useless outside a browser session. |
| **Photos, logos, icons, colors** | `LogoUrl`, `PhotoUrl`, `PhotoBlobToken`, `HasPhotoOnBlob`, `PhotoClass`, `iconPath`, `thumbnailImage*`, `TabColor`, `TabColorClass`, `iconKey` | Presentation assets. |
| **The organization blob** | `Organization` / `organization` objects with `IsSSO`, `IncompleteH2GSetup`, `PayerOrgDetails`, `hasValidRefreshToken`, `showInRefreshBanner`, `DiscreteAddress`, `isMyChartCentral`… | Appears verbatim on every row of visits, medications, immunizations, the activity feed. Only `OrganizationName` (and `Address` where a location matters) carries anything. Keep the name as a scalar on the row; drop the object. |
| **Care Everywhere / DXR plumbing** | `showDxrRefreshBanner`, `showDxrBannerAction`, `preTextStringKey`, `isExternal`, `linkType`, `currentlyLoadingData`, `errorLoadingData`, `LoadingOrgNames`, `ErrorOrgNames`, `ManualOrgNames` | State of MyChart's cross-organization data loading, not chart content. |
| **Client/session context** | `isProxyContext`, `isProxyView`, `hostedInIFrame`, `userSettings` (vitals), `devicePlatform`, `isBedsideTablet`, `isDataTileContext`, `IsClientTime`, `ClientTimeZoneMarker` | Describes the caller, not the chart. |
| **Server internals** | `__Status`, `__UpdateableSettings` (EHI export), `PageNonce`, `SerializedIndex`, `dte`, `Dat`, `EncBillingSystem`, `Token`, `ImagePath`, `BlobToken`, `Receipt.ViewReceiptOptions` | Continuation tokens, Epic's 1840-epoch day counts, blob keys. Needed by the *scraper* to fetch things, not by a reader. Some stay as handles where a follow-up needs them (statement PDFs). |
| **Same fact, several renderings** | Visit `Date`/`Time`/`ShortDate`/`Month`/`DateOfMonth`/`Year`/`HighlightDate` beside `Instant` and `PrimaryDate`; `contentAsHtml` beside `contentAsString`; `combinedRTFNarrativeImpression` beside `narrative`+`impression`; `StartDayOfMonth`/`StartMonth`/`StartYear` beside `StartDateDisplay` | Keep one canonical rendering plus the machine-readable instant. |
| **Provably empty or wrong on every captured instance** | `abnormalFlagCategoryValue` (always `"Unknown"`, #375), `author.displayName` (always `""`, names live in `users`/`viewers`), `AboutMeBlurb` (always `[]`), `Organizations`/`SchedulableVisitTypes` (always `null`), `CareTeamStatus` (always `0`), conversation `organizationId` (always `""`), `IsPastVisit` (false on rows `LoadPast` returned) | Documented per capability below, with the source of the evidence. |
| **Release-specific noise** | `canGenerateLLMSummary`, `feedbackSubmitted`, `isBedsideTablet` (November 2025 only) | Present on one Epic release and absent on the other; none describes the patient. |

Everything not in one of these classes stays in `standard`.

## 3. Per-capability proposals

Format for each: the endpoints (what `raw` is), the `standard` object, what is
dropped and why, the `concise` projection, and what has to move out of the
scraper to make `raw` honest.

Field names in `standard` are MyChart's own unless marked **(derived)**.

---

### `get_profile`

**Raw.** Two requests: `GET /Home` (HTML; the `.printheader` div carries
`Name | DOB | MRN | PCP`) and `POST /PersonalInformation/GetContactInformation`
(JSON, skeleton `getContactInformation`: `PermanentAddress`,
`TemporaryAddress`, `SecureCommunicationInfo`, `HomePhone`, `WorkPhone`,
`PreferredDevice`, plus form-config fields). The scraper today returns only
`{ name, dob, mrn, pcp, email }`; the whole contact-information body is thrown
away.

**Standard.**

| Field | Source | Note |
| --- | --- | --- |
| `name`, `dob`, `mrn`, `pcp` **(derived)** | parsed from `/Home` HTML | Only fields the HTML endpoint yields. `mrn` and `pcp` are empty on MyChart Central-style instances. |
| `SecureCommunicationInfo.EmailAddress` | JSON | Today's `email`. |
| `SecureCommunicationInfo.MobilePhone`, `HomePhone`, `WorkPhone` | JSON | |
| `PreferredDevice` | JSON | |
| `PermanentAddress.FormattedValues[]`, `.Street`, `.City`, `.State.Title`, `.Zip`, `.Country.Title` | JSON | `FormattedValues` is the display form; the discrete parts are for consumers that need them. |
| `TemporaryAddress` (same subset) plus `.StartDateDisplay`, `.EndDateDisplay` | JSON | Only when `TemporaryAddress.Street` is non-empty. |

**Dropped.** `IsViewOnly`, `RequiredFieldNames`, `ReadOnlyFieldNames`,
`ValidationErrors`, `PermanentDefaults`/`TemporaryDefaults`,
`AllowArbitraryInput`, `AllowDefaults`, `HasEditableField`, `IsPending`,
`IsTemporaryAddressDisabled`, `IsNonPatientProxyRecord`, every
`CanSupport*`/`Does*NeedAttention`/`Is*Deleted`/`Are*` flag in
`SecureCommunicationInfo`, `ContactVerificationDisabled`, the
`County`/`District` objects with their `Utf8` duplicates. All form config.

**Concise.** `name`, `dob`, `mrn`, `pcp`, `EmailAddress`.

**Moves out of the scraper.** The regex parse of the print header, and the
email pick. Raw mode returns both bodies.

---

### `get_health_summary`

**Raw.** `POST /api/health-summary/FetchHealthSummary` and
`POST /api/health-summary/FetchH2GHeader`. The scraper keeps six fields. The
header body is ~500 lines and embeds a copy of the upcoming-visits view model.

**Standard.**

| Field | Note |
| --- | --- |
| `header.patientAge`, `header.bloodType` | |
| `header.height.value`, `header.height.dateRecorded`, `header.weight.value`, `header.weight.dateRecorded` | |
| `patientFirstName` | |
| `isPatientAdmitted` | A real clinical state. Dropped by the scraper today. |
| `conditionList[]`, `journeyList[]`, `actionPlans[]` | Element shapes uncaptured (empty on every captured account). Pass through whatever comes; do not model. |
| `lastVisit.date`, `lastVisit.visitType`, `nextVisit.date`, `nextVisit.visitType` | From the H2G header. `nextVisit` is dropped by the scraper today. |

**Dropped.** `quickLinkDictionary` (portal links), `schoolReportInfo`
(`schoolReportID` is a report handle we have no capability for),
`canAccessSharingHub`, `isProxyContext`, `lastVisit.visitDetailsURL`,
`.openRemotely`, `.mode`, `.visitCategory`, and the whole
`upcomingVisitsList` (a camelCase duplicate of `get_upcoming_visits`; one
capability per fact).

**Concise.** `patientAge`, `bloodType`, `height.value`, `weight.value` with
their dates, `isPatientAdmitted` only when true, `lastVisit`, `nextVisit`.

---

### `get_medications`

**Raw.** `POST /api/medications/LoadMedicationsPage`. ~150 fields per
prescription; the scraper keeps 12.

**Standard**, per prescription (under `communityMembers[].prescriptionList.prescriptions[]`, flattened):

| Field | Note |
| --- | --- |
| `id` | The real MyChart id. See the `medicationKey` note below. |
| `name`, `patientFriendlyName.text`, `patientFriendlyName.caption` | |
| `sig`, `sigTranslationFromOrder` | The translation is the plain-language version. |
| `dateToDisplay`, `dateDisplayKey`, `formattedDateNoted`, `startDate`, `lastUpdateInstant` | `dateDisplayKey` says what `dateToDisplay` means ("Started", "Last filled"). |
| `prescriptionNumber` | |
| `authorizingProvider.name`, `orderingProvider.name` | |
| `isPatientReported`, `isClinicReported`, `isPendingUpdate`, `pendingUpdateType` | |
| `isAnticoagulationMed`, `isFrequencyPRN`, `criticalMedMessage` | |
| `classList[]` | Drug class. |
| `varianceComment`, `previousTakingDiffSig`, `previousTakingDiffSigInstant` | How the patient reported taking it differently. |
| `refillDetails.isRefillable`, `.refillStatus`, `.refillsRemaining`, `.hasRefillsRemaining`, `.refillExpirationDate`, `.refillWarningCode`, `.scheduledFillDate`, `.externalFillRequestDate`, `.nextDispenseDate` | |
| `refillDetails.writtenDispenseQuantity`, `.writtenDispenseUnit`, `.writtenDispenseAmount`, `.daySupply` | |
| `refillDetails.lastDispense.dispenseQuantity`, `.dispenseUnit`, `.dispenseAmount`, `.dispenseDate`, `.isRxReady`, `.costDetails.formattedCopay`, `.delivery.formattedShipDate` | |
| `refillDetails.owningPharmacy.name`, `.phoneNumber`, `.formattedAddress[]`, `.hours[]`, `.isPreferred` | |
| `organizationName` **(derived)** | `organization.organizationName`, only when the account spans more than one organization. |
| top-level `getPatientFirstName` | |
| `prescriptionList.numRefillsDueSoon`, `.pickups[]`, `.deliveries[]`, `.inProgressWorkRequests[]` | The last three are uncaptured shapes; pass through. |

**Dropped.** Every `show*`/`draw*`/`has*ColDetail`/`enable*`/`allow*`
flag, `isSelected`, `target`, `isSigRTL`, `isTranslationFromOrderRTL`,
`providerDisplayKey`, `iconPath`, `contentLinkURL`, `prescriptionListType`,
`highlightMedIsHidden`, `proxiesWhoCantAccessConfMeds`,
`outpatientPause*`, `varianceReason` (contains the literal key
`epic.Core.Data.ICommentable.CommentClientEditable`), the three copies of the
organization blob, `owningPharmacy.supportedDeliveryMethods`/`deliveryFee`/
`paymentMethods`/`departmentID`/`isIntegrated`/`hasCreditCardPayments`/
`isPatientMessagingEnabled`, `costDetails.paymentCards`/`hasPaymentCard`/
`isBilledToAccount`, `refillButtonHoverCode`, `refillButtonStatus`,
`refillsRemainingKey`, `rxFlags`, `currentFillDat`, `doesWorkRequestContainHiddenMed`,
`arePharmaciesAvailableForRefill`, `medSettings`, `medicationsUrl`,
`hostedInIFrame`, `backToContextSet`, `isProxyView`, `showPatientAdmittedBanner`.

**Concise.** `name`, `patientFriendlyName.text`, `sig`, `dateToDisplay` with
`dateDisplayKey`, `authorizingProvider.name`, `isRefillable`,
`refillsRemaining`, `owningPharmacy.name`, and `isPatientReported` when true.

**Note: `medicationKey` is not a MyChart field.** The captured skeleton has
`id`; `medicationKey` exists only in the fake's fixture, and `request_refill`
posts it as `{ medicationKey }` to `/api/medications/RequestRefill`. Either the
real request shape is `{ id }` or it is something not yet captured. Out of scope
here, but the processor should surface `id` and not invent `medicationKey`.

---

### `get_allergies`

**Raw.** `POST /api/allergies/LoadAllergies`. The captured account had no
allergies, so the `dataList` element shape is unverified; the scraper hedges
with `allergyItem.*` and flat fallbacks.

**Standard.** `dataList[]` elements passed through whole (both nesting
guesses), `allergiesStatus`, `dateOfBirth`. When a capture arrives, narrow to
`name`, `formattedDateNoted`, `type`, `reaction`, `severity`, `id`.

**Dropped.** `hasUpdateSecurity`, `hasStandAloneUpdateSecurity`,
`showDxrRefreshBanner`, `showDxrBannerAction`, `preTextStringKey`.

**Concise.** `name`, `reaction`, `severity`. An empty list renders as
"No allergies on file" (rule 6).

---

### `get_health_issues`

**Raw.** `POST /api/HealthIssues/LoadHealthIssuesData`. Each `dataList` entry
carries `healthIssueItem` and an identical-shaped `localItem`, plus
`externalItems[]` / `externalOrgs[]` for Care Everywhere copies.

**Standard.** `healthIssueItem.name`, `.formattedDateNoted`, `.id`,
`.isReadOnly`; `externalItems[]` and `externalOrgs[]` passed through (shape
uncaptured; they are the other organizations' versions of the same problem);
`hasLocalInstance`.

**Dropped.** `localItem` (duplicate of `healthIssueItem`), `action`,
`contentLinkURL`, `contentLinkPath`, `target`, the page-level flags,
`healthIssuesUrl`, `dateOfBirth` (already in profile), `alwaysShowSearchMore`.

**Concise.** `name`, `formattedDateNoted`.

---

### `get_vitals`

**Raw.** `POST /api/track-my-health/GetFlowsheets` and, per flowsheet, one or
more `POST /api/track-my-health/GetFlowsheetReadings` pages. Today the
scraper regroups readings by row, dedupes page overlaps and returns
`Flowsheet[]`; that regrouping becomes processor work.

**Standard.** One entry per flowsheet row (vital type):

| Field | Note |
| --- | --- |
| `rows[].name`, `rows[].id`, `rows[].unitsDisplayName`, `rows[].valueType`, `rows[].decimalPlaces` | Row metadata. |
| `readings[].instantTakenIso`, `.timeZone` | The zone is the clinic's; dropped today, and it is what makes the instant interpretable. |
| `readings[].stringValue`, `.numericValue` | Both kept. `value` **(derived)** is the first non-empty of the two (today's `readingValue` logic). |
| `readings[].isAbnormal`, `.entryType`, `.documentationSource`, `.valueType` | |
| flowsheet `name`, `status`, `startDateIso`, `endDateIso`, `instructions` | A flowsheet is an episode ("Blood pressure monitoring"); its instructions are care instructions. |
| `rowGroups[]` | Which rows belong together (a BP systolic/diastolic pair). |

**Dropped.** `userSettings` (session context), `episodeId`/`templateId`/
`fsdId`/`sourceRowId`/`line` (internal ids), `hasMoreData` (unreliable, see the
scraper comment), `entryMode`, `hasEpisodeData`, `dataType`.

**Concise.** Per vital type: name, units, the most recent reading (date +
value), and the count of readings. Abnormal readings in the last N are listed.

---

### `get_immunizations`

**Raw.** `POST /api/immunizations/LoadImmunizations`.

**Standard.** Per immunization: `name`, `id`, `formattedAdministeredDates[]`,
`organizationName` **(derived)** from the enclosing `organization`.

**Dropped.** The organization blob, `showViewDetailsLink`,
`showPersonalNotes`, `immunizationsUrl`.

**Concise.** `name` and the most recent administered date, with the count of
doses.

---

### `get_preventive_care`

**Raw.** `GET /HealthAdvisories`: an HTML page. There is no JSON endpoint.
`raw` mode returns the page string.

**Standard.** The parsed records the scraper produces today, all **(derived)**
since none is a MyChart field: `name`, `status` (`overdue` / `not_due` /
`completed` / `unknown`), `overdueSince`, `notDueUntil`, `completedDate`,
`previouslyDone[]`. Plus `pageText` **(derived)**, the block-separated text of
the advisories section, so a consumer can see what the parser saw when a row
comes out `unknown`.

**Concise.** `name` and `status`, overdue items first, with their date.

**Moves out of the scraper.** `parseRows` / `parseLines`. The scraper returns
the HTML.

---

### `get_medical_history`

**Raw.** `POST /api/histories/LoadHistoriesViewModel`. The scraper keeps
diagnoses, surgeries and family members and **drops the whole
`socialHistory` block** (smoking, smokeless tobacco, alcohol).

**Standard.**

| Field | Note |
| --- | --- |
| `medicalHistory.diagnoses[].diagnosisName`, `.diagnosisDate`; `medicalHistory.medicalHistoryNotes` | |
| `surgicalHistory.surgeries[].surgeryName`, `.surgeryDate`; `surgicalHistory.surgicalHistoryNotes` | |
| `familyHistoryAndStatus.familyMembers[].relationshipToPatientName`, `.statusName`, `.conditions[]`, `.nameOrAlias`, `.sexName`, `.relativeAge`, `.relativeAgeEnd` | Age fields dropped today. |
| `familyHistoryAndStatus.familyHistoryNotes`, `.familyStatusNotes` | Dropped today. |
| `socialHistory.smokingHistory.smokingTobaccoStatus`, `.smokingTobaccoTypes[]`, `.tobaccoUse`, `.smokingTobaccoQuitDate` | Dropped today. Clinically load-bearing. |
| `socialHistory.smokelessHistory.smokelessTobaccoStatus`, `.smokelessTobaccoTypes[]`, `.smokelessQuitDate` | |
| `socialHistory.alcoholHistory.alcoholUse`, `.alcoholAmount`, `.alcoholUnit`; `socialHistory.socialHistoryNotes` | |

**Dropped.** `familyMemberId`, `relationshipToPatientId`, `sexId`,
`genderId`, `statusId`, `removeFamilyMember`, `createdOnClient`, `changes[]`,
`show*QuitDate`, `isProxy`, `isShareEverywhere`.

**Concise.** Diagnoses (name + date), surgeries (name + date), family
members as "relationship: conditions", smoking status, alcohol use.

---

### `get_goals`

**Raw.** `POST /api/goals/LoadCareTeamGoals` and `POST /api/goals/LoadPatientGoals`.

**Standard.** Whatever each list's elements carry, passed through, with
`source` **(derived)** = `care_team` | `patient`.

**Dropped.** `quickLinkDictionary`, `hasChartGraphSecurity`,
`isSharingNotesEnabled` (page-level).

**Concise.** `name`, `status`, `targetDate` where present.

**Note: the patient-goal shape is unverified and probably wrong.** The
captured `loadPatientGoals` element has `goalId`, `goalType`, `readings[]`,
`complianceType`, `lastUpdatedDate`, `creationDate`. It has no `name`,
`description`, `status`, `startDate` or `targetDate`. Those five exist only in
the fixture, which `conformToShape` serves alongside the real keys. Against a
real instance with patient goals, today's scraper would return five empty
strings per goal. The processor should pass the element through until a capture
settles it.

---

### `get_upcoming_visits` and `get_past_visits`

**Raw.** `POST /Visits/VisitsList/LoadUpcoming` (three buckets:
`InProgressVisits`, `NextNDaysVisits`, `LaterVisitsList`) and
`POST /Visits/VisitsList/LoadPast`, paged with `SerializedIndex` (10 visits
per organization per page). `raw` for past visits is the envelope of every page
fetched; the per-organization merge the scraper does today is processor work.

The visit object is ~160 fields. The date family, since it is the confusing part:

| Field | What it is | Keep? |
| --- | --- | --- |
| `Instant` | `/Date(1761851400000)/`, epoch millis, absolute | yes; `instantISO` **(derived)** beside it |
| `PrimaryDate` | `MM/DD/YYYY hh:mm:ss AM`, clinic-local, no zone | yes (the clinic's own rendering) |
| `TimeZone` | the department's zone name | yes |
| `Date`, `Time`, `ShortDate`, `Month`, `DateOfMonth`, `Year`, `HighlightDate`, `IsAM` | locale renderings of the same instant | no |
| `Dat` | Epic 1840-epoch day count | no |
| `IsClientTime`, `ClientTimeZoneMarker` | about the caller | no |
| `IsTimeToBeDetermined`, `IsHideVisitTime` | whether a time is meaningful | yes; `concise` omits the time when either is set |

**Standard**, per visit:

| Group | Fields |
| --- | --- |
| Handles | `Csn` (fallback `CsnForECheckIn`), `Id`, `ReferenceID` |
| When | `Instant`, `instantISO` **(derived)**, `PrimaryDate`, `TimeZone`, `IsTimeToBeDetermined`, `IsHideVisitTime`, `DurationInMinutes`, `ArrivalTime`, `AdmissionDateRange.Start`/`.End`, `DischargeDate`, `RescheduledDatString` |
| What | `VisitTypeName`, `IsUsingFallbackVisitTypeName`, `EncounterType`, `EncounterIsSurgery`, `EncounterIsEDVisit`, `IsPreadmission`, `ChiefComplaint`, `Diagnoses[].Code`/`.Description`, `SurgicalProcedures[].Name`/`.Instructions`/`.Providers[].Name`, `Cases[].Description`, `ComponentVisits[]` (`Csn`, `VisitTypeName`, `PrimaryDate`), `PatientNextStepInstructions` |
| Who | `PrimaryProviderName` (fallback `PrimaryProvider.Name`), `Providers[].Name`, `Providers[].Department.Name`, `OtherProviders[].Name`, `GuestPatientFirstName` |
| Where | `PrimaryDepartment.Name`, `.Address[]`, `.PhoneNumber`, `.Specialty.Title`, `.Instructions[].Text`, `.ArrivalLocation`, `.TimeZone`; `PreadmissionLocation` (same subset); `organizationName` **(derived)** from `Organization.OrganizationName` |
| Status | `IsCanceled`, `IsNoShow`, `LeftWithoutSeen`, `InProgress`, `IsArrived`, `IsConfirmed`, `IsCancelRequestSent`, `ConfirmationStatus`, `ArrivalStatus`; `status` **(derived)**, one word from those flags in PR #380's order, with `IsPastVisit` never consulted for a `LoadPast` row |
| Mode | `Telemedicine.IsTelemedicine`, `.TelemedicineMode`, `EVisit.IsEVisit`, `TelehealthMode`, `IsInHomeVisit` |
| Money | `Copay.Amount`, `Copay.IsPaid`, `HasPaymentInfo`, `IsFullyPaid` |
| Records available | `IsClinicalNoteAvailable`, `IsNotesOnly`, `IsClinicalInformationAvailable`, `HasDownloadSummaryLink`, `IsVisitSummaryEnabled` (say whether `get_visit_notes` / `get_visit_avs` are worth calling) |
| Container | `HasMoreData` per organization (past), bucket name **(derived)** for upcoming, `count` **(derived)** |

**Dropped.** Everything else: the ~90 `Is*Enabled`/`Can*`/`Has*Feature`/
`Show*`/`Should*` affordances, the entire `ECheckIn` object and its dozen
sibling flags, `SelfArrival*`, `GeolocationArrival`, `ArrivalAdditionalActions`,
`ProxyRequestMinorForm*`, `OrganizationLinks`, `PrimaryOrganizationLink`,
`EncodedOrgID`, `UnverifiedProxyJumpUrl`, `EncryptedLvvId`, `Telemedicine.TelemedicineUrl`,
`EVisit.EVisitUrl`, `UserMyChartStatus`, `IsCEOptedIn`, `ShowPFIOLink`,
`FeedbackQnrIDs`, `PastVisitBucket`, `OwnedBy`, `IsLocal`, `IsNonEpic`,
`IsSingleProvider`, `NumberOfOthers`, `HasProcedures`/`NumberOfProcedures`
(derivable), `EpisodeDetails.GestationalAge` (keep if non-empty: it is
clinical), provider photo fields, the three organization blobs, the top-level
`ViewBagProperties`, `SerializedIndex`, `CanSearch`/`CanAllSearch`/`CanSort`/
`AutoRenderThisSet`/`SkippedSomeResults`, `Organizations` map, `HighlightDays`,
`HasPVG`, and **`IsPastVisit`** (documented false on rows `LoadPast` itself
returned; the capability that was called already says which side of now the
visit is on).

**Concise**, per visit: `PrimaryDate` (time omitted when hidden or TBD),
`VisitTypeName`, `status`, provider, `PrimaryDepartment.Name`, `Csn`,
`ChiefComplaint`, diagnoses as "Description (Code)", procedures, admission
range for inpatient stays, `organizationName` when the account spans
organizations, and `notes_available` / `summary_available` **(derived)** when
true. Upcoming adds the bucket. This is PR #377's `VisitSummary` plus the
status word from PR #380.

**Moves out of the scraper.** Page merging (`pastVisits`'s accumulator) and
`visitTimestamp`. The scraper fetches pages until the window is covered and
returns them; the processor merges.

---

### `get_visit_notes`

**Raw.** `POST /api/visit-notes/GetVisitNotes` `{ CSN, FromPvdPage }`. An
unknown CSN answers a literal JSON `null` (rule 7: passed through in every
mode).

**Standard.** `lrpID`, `depPhoneNumber`, `isAtLeastOneNoteSensitive`,
`noteList[].hnoID`, `.hnoDAT`, `.displayName`, `.iso`, `.isAddendum`,
`.isNoteSensitive`, `.provider.name`, `.provider.magicID`,
`.attachments[]` (uncaptured shape; pass through), plus `csn` **(derived)**
echoing the input so the result is self-describing.

**Dropped.** `provider.hasPhotoOnBlob`.

**Concise.** Per note: `displayName`, `iso`, `provider.name`, and the three
handles (`hnoID`, `hnoDAT`, `lrpID`), because a concise listing whose only
purpose is choosing a note to open must carry what `get_note_content` takes.

**Note.** Today's scraper renames `hnoID` → `hnoId`, `hnoDAT` → `hnoDat`,
`lrpID` → `lrpId`, and the `get_note_content` parameters use the renamed
spelling. Under rule 2 the standard object keeps MyChart's spelling; the
capability parameters can keep theirs (they are our API, not MyChart's).

---

### `get_note_content` and `get_visit_avs`

**Raw.** `POST /api/report-content/LoadReportContent` with
`reportMnemonic: 'OPEN_NOTES'` (note) or `'AMB_AVS'` (summary):
`{ reportContent, reportCss, baseFontSize, stylesheets[] }`. `reportContent`
is an HTML fragment.

**Standard.** `reportContent` (the HTML, untouched) and `reportContentText`
**(derived)**: the fragment converted to plain text with block structure
preserved as line breaks, headings kept as their own lines, `<ul>/<li>` as
bullet lines, tables as rows of cells separated by tabs. Also
`reportContentMarkdown` **(derived)** if the markdown renderer can do better
than plain text for headings and lists; that is the field the `standard`
markdown view shows.

**Dropped.** `reportCss`, `baseFontSize`, `stylesheets[]`. Styling only.

**Concise.** `reportContentText`, unchanged. A note has no shorter faithful
form; a model can summarize it, a processor must not.

**Moves out of the scraper.** Nothing today (it already returns the HTML), but
the processor gains the HTML-to-text conversion. The converter is shared with
letters, lab reports and lab RTF fields, and must be XSS-safe when a client
later renders it: parse to a tree, never re-emit the markup.

---

### `get_letters` and `get_letter_details`

**Raw.** `POST /api/letters/GetLettersList` (`letters[]`, `users{}`,
`departments{}`) and `POST /api/letters/GetLetterDetails` `{ hnoId, csn }`
→ `{ bodyHTML }`, or literal `null` for an unknown id.

**Standard (list).** Per letter `dateISO`, `reason`, `viewed`, `hnoId`,
`csn`, `empId`, plus `providerName` **(derived)** resolved through
`users[empId].name`. Sorted newest first with unparseable dates last (today's
scraper behavior, now processor behavior). `departments{}` passed through if
ever non-empty.

**Dropped.** `users[].photoUrl`; the `users` map itself once names are
resolved onto rows.

**Standard (details).** `bodyHTML` untouched and `bodyHTMLText` **(derived)**.

**Concise.** List: `dateISO`, `reason`, `providerName`, `hnoId` + `csn`,
unviewed first. Details: `bodyHTMLText`.

---

### `get_documents`

**Raw.** `POST /api/documents/viewer/LoadOtherDocuments`.

**Standard.** `documents[]` passed through whole.

**Concise.** `title`, `documentType`, `date`, `providerName`.

**Note.** There is no captured skeleton for this endpoint; the six fields the
scraper reads (`id`, `title`, `documentType`, `date`, `providerName`,
`organizationName`) exist only in the fixture. Same pattern that bit goals,
upcoming orders, the activity feed and education materials before their
captures. Pass through until captured.

---

### `get_lab_results`

**Raw.** For each `groupType` in 0..3, `POST /api/test-results/GetList`
(the fake, faithful to real, serves one combined list for 0 and 1 and a 500 for
the rest). Then per unique order key: `POST /api/test-results/GetDetails`,
`POST /api/past-results/GetMultipleHistoricalResultComponents`, and, when
`reportDetails.reportID` is set, `POST /api/report-content/LoadReportContent`.
`raw` is the envelope of all of them. Today the scraper nests the report
content into `reportDetails.reportContent` and the trends into
`historicalResults`, and deletes `abnormalFlagCategoryValue` (#375). All of
that becomes processor work; `raw` carries the flag, the literal `"Unknown"`
included.

**Standard**, per order (the `GetDetails` body, joined to its trend and report):

| Group | Fields |
| --- | --- |
| Order | `orderName`, `key` |
| Result (`results[]`) | `name`, `key`, `isAbnormal` (kept, but see the note), `hasComment`, `warningType`, `warningMessage` |
| Metadata (`orderMetadata`) | `orderProviderName`, `authorizingProviderName`, `readingProviderName`, `resultTimestampDisplay`, `prioritizedInstantISO`, `prioritizedInstantDisplay`, `latestUpdateInstantISO`, `collectionTimestampsDisplay`, `specimensDisplay`, `resultStatus`, `resultType`, `associatedDiagnoses[]`, `resultingLab.name`, `.address[]`, `.phoneNumber`, `.labDirector`, `.cliaNumber`, `.accreditationType` |
| Components (`resultComponents[]`) | `componentInfo.componentID`, `.name`, `.commonName`, `.units`; `componentResultInfo.value`, `.numericValue`, `.isValueRtf`, `.referenceRange.low`, `.high`, `.displayLow`, `.displayHigh`, `.lowerBoundExclusive`, `.upperBoundExclusive`, `.formattedReferenceRange`; `componentComments.contentAsString`; `valueText` **(derived)**: `value` with RTF stripped when `isValueRtf` |
| Narrative (`studyResult`) | `narrative.contentAsString`, `.signingInstantTimestamp`; `impression.contentAsString`, `.signingInstantTimestamp`; `addenda[].contentAsString`, `.signingInstantTimestamp`; `transcriptions[]`, `ecgDiagnosis[]` (uncaptured; pass through) |
| Notes | `resultNote.contentAsString`, `resultLetter.contentAsString`, `providerComments[]` (`commentText`, `providerName`, `commentDate`) |
| Report | `reportDetails.reportID`, `.isDownloadablePDFReport`, and the joined `LoadReportContent` body as `reportContent` (HTML) plus `reportContentText` **(derived)** |
| Trend (joined from the historical call, keyed by `componentID`) | `historicalResults[id].name`, `.commonName`, `.units`, `.oldestResultISO`, `.historicalResultData[].dateISO`, `.value`, `.numericValue`, `.referenceRange.formattedReferenceRange` |
| Imaging-only | `imageStudies[]`, `scans[]`, `fdiLink.redirectUrl` (passed through; consumed by `get_imaging_results`) |

**Dropped.**

| Field | Reason |
| --- | --- |
| `componentResultInfo.abnormalFlagCategoryValue`, historical `abnormalFlagCategoryValue` | Literal `"Unknown"` on 175 of 175 captured components across both releases, including out-of-range ones (#375). Raw only. |
| `historicalResults[].showAbnormalFlag`, `.hideGraph` | Per-graph display bits, not per-value verdicts. |
| `contentAsHtml` on every rich-text block, `combinedRTFNarrativeImpression` | Duplicates of `contentAsString` and of narrative + impression. |
| `isRTF`, `hasContent` on rich-text blocks | `hasContent` is not trusted (#380 reads the string); `isRTF` is about the source format. Keep `isValueRtf` on components because it says whether `valueText` differs from `value`. |
| `showName`, `showDetails`, `shouldHideHistoricalData`, `shareEverywhereLogin`, `showProviderNotReviewed`, `tooManyVariants`, `hasAllDetails`, `hideEncInfo`, `orderLimitReached`, `ordersDeduplicated`, `isEnhancedAskAQuestionActive`, `shouldShowBedsideActiveView` | UI affordances. |
| `baseSingleMessageUrl`, `fullMultipleMessagesUrl`, `relatedConversationIds`, `hiddenProxies`, `geneticProfileLink` | Portal links and plumbing. |
| `canGenerateLLMSummary`, `feedbackSubmitted`, `isBedsideTablet` | November 2025 only; not about the patient. |
| `orderMetadata.read`, `.resultType` numeric on the list body, `.authorizingProviderID`, `.unreadCommentingProviderName` | Read-state and ids. |
| `reportDetails.reportVars`, `.reportContext`, `.openRemotely`; `historicalResults.reportID`, `.orderedComponentIDs` | Fetch plumbing. |
| `indicators[]`, `variants[]` | Uncaptured and empty on every capture; genetic-result plumbing. Revisit on capture. |
| The whole `GetList` body (`newResultGroups`, `newResults`, `newProviderPhotoInfo`, `newComments`, `organizationLoadMoreInfo`, `areResultsFullyLoaded`, …) | Every fact in it is repeated by `GetDetails`. Two useful bits are lifted onto the order: `isInpatient`, `isEDVisit`, `formattedAdmitDate`, `formattedDischargeDate` from the group. |

**Concise.** Per result: `name`, date (`prioritizedInstantISO`, else
`resultTimestampDisplay`), `resultStatus`, `orderProviderName`, then one line
per component: `name`: `value` `units` (`formattedReferenceRange`), followed by
up to 8 most-recent trend points as `dateISO: value` (sorted before capping, as
#380 does). Narrative, impression, result note and result letter text when
present. This is PR #380's `condenseLabResults` minus its `flag` field.

**Note on abnormality.** `results[].isAbnormal` was `false` on all 39 captured
results, including those with out-of-range components. It stays in `standard`
because it is a real MyChart field and some instance may set it, but neither
mode derives an abnormal verdict from the reference range. That is a client
judgement (the Expo alert code makes it, on its own).

---

### `get_imaging_results`

**Raw.** The same requests as labs (the scraper re-runs the whole list +
details fetch and filters for imaging by name keywords and by content), plus,
per imaging result with an FDI context, `POST` to the FdiData endpoint for the
SAML URL. Filtering, `narrative`/`impression`/`reportText`/`resultDate`/
`orderProvider` lifting, and the `image_id` encoding are all processor work.

**Standard.** The lab `standard` object for the matching orders, plus:

| Field | Note |
| --- | --- |
| `image_id` **(derived)** | Base64url of `{ fdi, ord }`, the handle `download_imaging_study` takes. Extracted from the report HTML's `data-fdi-context` or from `fdiLink.redirectUrl`. |
| `index` **(derived)** | Position in the list; the fallback handle. |
| `hasViewableImages` **(derived)** | `image_id` present. |
| `imageStudies[].studyDescription`, `.modality`, `.studyDate`, `.numberOfImages` | |
| `isImagingByName`, `isImagingByContent` **(derived)** | Why this order was classified as imaging, so a mis-filed result is explainable. |

**Dropped (beyond the lab drops).** `samlUrl` and `viewerUrl`: single-use,
expire in a minute or two, and are the one thing in the payload that acts like
a credential. Raw only. `fdiContext` as a pair (the encoded `image_id`
replaces it). `imageStudies[].viewerUrl`, `.studyId`, `scans[].viewerUrl`.

**Concise.** `orderName`, date, `resultStatus`, `orderProviderName`,
`readingProviderName`, `impression` text, `narrative` text, series
(description / modality / image count), `image_id` or "no viewable images".
PR #380's `condenseImaging`.

---

### `download_imaging_study`

Media, not JSON: the four modes do not apply. Unchanged.

---

### `get_messages`

**Raw.** `POST /api/conversations/GetConversationList`. The scraper returns
the body untouched today.

**Standard.**

| Field | Note |
| --- | --- |
| `legacyXUnreadCount` | Inbox unread count. |
| `conversations[].hthId`, `.subject`, `.previewText`, `.hasAttachments`, `.hasUrgentMsgs`, `.hasTasks`, `.hasMoreMessages`, `.messageType`, `.tags.Unread` | |
| `conversations[].audience[].name` | Who the thread is with. |
| `conversations[].messages[].wmgId`, `.isUnread`, `.deliveryInstantISO`, `.body`, `.attachments[].name`, `.fileExtension`, `.tasks[]`, `.suggestedActions[]` | Last two uncaptured; pass through. |
| `conversations[].messages[].bodyText` **(derived)** | `body` with markup stripped. Whether real bodies carry HTML is not settled by the captures; the fixture is plain text. Emit `bodyText` regardless so consumers have one field to read. |
| `conversations[].messages[].senderName` **(derived)** | Resolved as the portal does: `wprKey` → `viewers[].name`; `empKey` → `userOverrideNames[empKey]` else `users[empKey].name`; `displayName` last. |
| `conversations[].messages[].isFromPatient` **(derived)** | `wprKey` set and `empKey` absent. |
| `localSummary.hasMoreConversations`, `.oldestLoadedInstantISO` | Whether the inbox has older threads than this page. |

**Dropped.** `author.displayName` (empty on every message of every captured
instance; names only resolve through the maps), `users`/`viewers` maps once
names are resolved onto messages, `contexts[]`, `tags.Messages`,
`legacyMessageDetailsUrl`, `hasLoadAllUsers`, `allowBulkActions`, `userKeys[]`,
`viewerKeys[]`, `maskedUserNames[]`, `showOtherViewersOption`,
`organizationId` (empty on all four captured instances), `users[].photoUrl`,
`.outOfContact*`, `.providerId`, `viewers[].isShown`, `.isSelected`,
`localSummary.pagingInfo`/`.numberLoaded`/`.newestLoadedInstantISO`/
`.oldestSearchedInstantISO`, `externalSummaries`, `attachments[].dcsId`/
`.etxId`/`.legacyUrlForCommunityJump`/`.organizationId`/`.type`.

**Concise.** Per conversation: `hthId`, `subject`, with (audience names),
unread / urgent when true, message count, and each inlined message as
`senderName`, `deliveryInstantISO`, `bodyText`. `previewText` only when no
messages were inlined. PR #380's `condenseMessages` plus sender resolution.

---

### `get_message_thread`

**Raw.** `POST /api/conversations/GetConversationDetails` `{ id }` then, while
`hasMoreMessages`, `POST /api/conversations/GetConversationMessages`
`{ id, startInstantISO }` paging backwards. `raw` is the envelope. The
scraper's backwards paging stays in the scraper (it is fetch logic); the merge
into one ascending list is processor work, as is name resolution.

**Standard.** From details: `hthId`, `subject`, `totalMessages`, `numUnread`,
`hasPreviouslyViewed`, `replyFlags.canReply`, `replyFlags.cannotReplyReason`,
`audience[].name`, `hasAttachments`, `hasUrgentMsgs`. Messages merged
ascending with the same per-message fields and derived `senderName`,
`isFromPatient`, `bodyText` as in `get_messages`. `truncated` **(derived)**
when paging stopped at the cap with `hasMoreMessages` still true.

**Dropped.** As for `get_messages`, plus `lastViewedByStaffMsgId` /
`firstUnreadMsgId` (three captured instances send one, one sends the other; a
field only some instances share is not a contract), `lastViewedByStaffInstantISO`,
`replyUrl`.

**Concise.** `subject`, participants, then every message as
`senderName` · `deliveryInstantISO` · `bodyText`, oldest first. A thread has no
shorter faithful form.

**Note.** Today's `ThreadMessage` renames `wmgId` → `messageId`,
`deliveryInstantISO` → `sentDate`, `body` → `messageBody`. Rule 2 keeps
MyChart's names.

---

### `get_message_recipients` and `get_message_topics`

**Raw.** `POST /api/medicaladvicerequests/GetMedicalAdviceRequestRecipients`
(a bare array on captured instances; the scraper also tolerates six wrapper
keys) and `POST /api/medicaladvicerequests/GetSubtopics` (`topicList[]`).

**Standard (recipients).** `displayName`, `specialty`, `pcpTypeDisplayName`,
`recipientType`, `oocContext` (out-of-contact; means messages will not be read
promptly), `userId`, `departmentId`, `poolId`, `providerId`.

**Dropped.** `photoUrl`, `organizationId` (always empty).

**Concise (recipients).** `displayName`, `specialty`, `pcpTypeDisplayName`.
The ids are plumbing `send_message` resolves by name (PR #380).

**Standard / concise (topics).** `displayName`, `value`. Nothing to drop but
the page-level `organizationId`.

---

### `get_billing`

**Raw.** `GET /Billing/Summary` (HTML; `.ba_card` per guarantor account,
yielding guarantor number, patient name, amount due and the `ID`/`Context`
pair), then per account `GET /Billing/Details/GetVisits`,
`GET /Billing/Details/GetStatementList`, `GET /Billing/Details/LoadPaymentList`
and `GET /Billing/Details` (HTML; `EncID` for PDF downloads). `raw` is the
envelope. Card parsing and the per-account join become processor work.

**Standard**, per account:

| Group | Fields |
| --- | --- |
| Account **(derived from the summary HTML)** | `guarantorNumber`, `patientName`, `amountDue` (`Number`) |
| Visits | The union of `UnifiedVisitList`, `VisitList`, `InformationalVisitList`, `NoBalanceVisitList`, `BadDebtVisitList`, `PaymentPlanVisitList`, `AdvanceBillVisitList`, `ContestedVisitList`, `AdjustmentVisitList`, de-duplicated on (`HospitalAccountId`, `StartDate`, `Description`, `SelfAmountDueRaw`) with `category` **(derived)** naming the source list. `NotPaymentPlanVisitList` and `VisitAutoPayVisitList` are filtered views of the same rows and are not merged (PR #380's reasoning). |
| Per visit | `StartDateDisplay`, `DateRangeDisplay`, `Description`, `Patient`, `Provider`, `HospitalAccountDisplay`, `HospitalAccountId`, `PrimaryPayer`, `BillingSystemDisplay`, `ChargeAmount`, `InsuranceAmountDue`, `InsuranceAmountDueRaw`, `InsurancePaymentAmount`, `InsuranceEstimatedPaymentAmount`, `SelfAmountDue`, `SelfAmountDueRaw`, `SelfPaymentAmount`, `SelfAdjustmentAmount`, `SelfDiscountAmount`, `SelfBadDebtAmount`, `SelfPaymentPlanAmountDue`, `NotOnPlanAmount`, `ContestedChargeAmount`, `ContestedPaymentAmount`, `IsPatientNotResponsible`, `PatientNotResponsibleYet`, `IsOnPaymentPlan`, `IsBadDebtHAR`/`IsBadDebtVisit`, `IsClosedHospitalAccount`, `PatFriendlyAccountStatusAccessibleText`, `EstimateInfo.EstimateAmount`/`.EstimateStatus`, `AgencyInformation.Name`/`.PhoneNumber` (collections agency: a patient wants to know) |
| Per visit, line items | `ProcedureList[].Description`, `.Amount`, `.SelfAmountDue`, `.InsuranceAmountDue`, `.IsContested`; `ProcedureGroupList[].Description`, `.Amount`, `.PaymentList[]` (date, `Description`, `PaymentAmountDisplay`); `CoverageInfoList[].CoverageName`, `.Billed`, `.Covered`, `.PendingInsurance`, `.RemainingResponsibility`, `.Copay`, `.Deductible`, `.Coinsurance`, `.NotCovered`, `.Benefits[]` |
| Account-level | `Data.CanMakePayment`, `.HasUnconvertedPBVisits`, `.PartialPaymentPlanAlert.Banner.HeaderText`/`.DetailText` (a payment-plan warning is information), `.UndistributedPayments[]` |
| Statements | `DataStatement.StatementList[]` and `DataDetailBill.StatementList[]`: `FormattedDateDisplay`, `DateDisplay`, `Description`, `StatementAmountDisplay`, `IsRead`, `IsDetailBill`, `ServiceDateStart`, `ServiceDateEnd`, `RecordID`; `IsPaperless` at list level |
| Payments | `PaymentList[].FormattedDateDisplay`, `.Description`, `.SubText`, `.PaymentAmountDisplay`, `.UndistributedAmountDisplay`, `.Receipt.DisplayNumber` |
| Totals **(derived)** | `totalDue` across accounts |

**Dropped.** `Success`, `Index`, `GroupType`, `BillingSystem` (numeric),
`IsSBO`, `StartDate`/`StartDayOfMonth`/`StartMonth`/`StartYear` (Epic
day-count and split renderings of `StartDateDisplay`), `StartDateAccessibleText`,
`SuppressDayFromDate`, `IsExpanded`, `BlockExpanding`, `AlwaysShowDetails`,
`LevelOfDetailLoaded`, `Show*Help`, `ShowVisitAutoPay`, `VisitAutoPay`
(enrollment UI), `CanAddToPaymentPlan`, `IsLTCSeries`, `VisitStatusesEqualToClosed`,
`PatFriendlyAccountStatus` (numeric; the accessible text is kept),
`VisitBadDebtScenario`, `IsUnpayableHAR`, `EmptyVisitEstimateID`,
`IsPaymentPlanEstimate`, `IsResolvedEstimatedPPAccount`, the `Filters` and
`URL*` fields, the rest of `Banner`, `ShouldShowADACopyright`, `billType`,
`IsStatement`, `StatementDisplayDate`; statement `Show`, `Date`/`DayOfMonth`/
`Month`/`Year`, `LinkText`, `LinkDescription`, `ImagePath`, `Token`, `PrintID`,
`IsEB`, `Format`, `EncBillingSystem`, `URLStatement`, the paperless-signup
flags and the three `*String` UI labels; payment `ID`/`ElementID`/`Index`,
`DayOfMonth`/`Month`/`Year`, `HtmlSubText`, `CoverageInfo` (null on capture),
`Receipt` internals (`BlobToken`, `ViewReceiptOptions`, `PrintStatus`, …),
`Is*Adj`, `CanEdit`/`CanCancel` and their option objects, `ConsentDocument`,
card-expiry flags; the `encBillingId` and `id`/`context` pair (fetch plumbing;
stay in `raw`).

**Concise.** Per account: `patientName`, `guarantorNumber`, `amountDue`; visits
with a non-zero `SelfAmountDueRaw` or `InsuranceAmountDueRaw` as date ·
description · provider · charges · insurance paid · you owe; statements as date
· amount · unread; payments as date · amount. PR #380's `condenseBilling`.

---

### `get_insurance`

**Raw.** `GET /Insurance`, HTML. `raw` returns the page.

**Standard.** The parsed coverages, all **(derived)**: `planName`,
`subscriberName`, `memberId`, `groupNumber`, `details[]`, and
`hasCoverages`. Plus `pageText` **(derived)** as for preventive care.

**Concise.** `planName`, `memberId`, `groupNumber`.

**Note.** The selectors the scraper uses (`.coverage-card`, `.plan-name`,
`.member-id`, …) match the fake's page and nothing captured from a real
instance; the captured account had no coverage on file and every
`/api/insurance-hub/*` endpoint answered 500 (`api-surface-gaps.md` §2d). The
processor is a placeholder until a coverage page is captured. `pageText` is
what makes the placeholder honest.

---

### `get_care_team`

**Raw.** `POST /Clinical/CareTeam/Load` and `POST /Clinical/CareTeam/LoadExternal`
(PascalCase legacy envelope, 23 provider fields, byte-identical on four live
instances across both releases).

**Standard**, per provider from either list: `ID`, `Name`, `Relation`,
`Specialty`, `NationalProviderID`, `DepartmentID`, `CanMessage`,
`IsExternal`, `fromExternalList` **(derived)**; plus `externalProvidersUnavailable`
**(derived)** when `LoadExternal` failed, and the envelope's `DescriptiveTitle`.

**Dropped.** `AboutMeBlurb` (always `[]`), `Organizations` and
`SchedulableVisitTypes` (always `null`), `CareTeamStatus` (always `0`),
`Photo`, `WebPageUrl`, `InfoBlurbUrl`, `CommCenterMessageUrl`,
`CanViewProviderDetails`, `CanDirectSchedule`, `CanRequestAppointment`,
`CanRequestCustomAppt`, `HasNoProviderRecord`, `IsNewSchedulingEnabled`,
`CanHideProvider`, `TabColorClass`, `IsCustomApptReqEnabled`,
`CustomRequestAppointmentLink`.

**Concise.** `Name`, `Relation` (the PCP designation lives here; `null` and
`""` both render as no stated role), `Specialty`, and `(outside provider)` when
external. Note that an entry can be the patient's insurance payer, not a
clinician.

---

### `get_referrals`

**Raw.** `POST /api/referrals/listReferrals`.

**Standard.** `referralList[].internalId`, `.externalId`, `.status`,
`.statusString`, `.creationDate`, `.start`, `.end`, `.referredByProviderName`,
`.referredToProviderName`, `.referredToFacility`; page-level `canSeeAuthorizations`
(whether the instance shows authorization detail at all).

**Dropped.** `dte` (Epic day count of `creationDate`), `canSendMessage`,
`shouldRedirect`.

**Concise.** `statusString`, `referredToProviderName` / `referredToFacility`,
`referredByProviderName`, `start`, `end`.

---

### `get_upcoming_orders`

**Raw.** `POST /api/upcoming-orders/GetUpcomingOrders`: three maps
(`orderGroupList`, `orderList`, `providerList`) keyed by id.

**Standard.** `orderList` values passed through whole, with `providerName`
**(derived)** resolved from `providerList` when the order carries a provider
key, and `orderGroupList` passed through. The order value shape is uncaptured
(every captured account had the maps empty), so nothing is dropped inside it.

**Dropped.** `upcomingOrdersSettings`.

**Concise.** `orderName`, `orderType`, `status`, `orderedDate`,
`orderedByProvider` where those names turn out to be right.

---

### `get_questionnaires`, `get_care_journeys`

**Raw.** `POST /Questionnaire/GetQuestionnaireList` and
`POST /api/care-journeys/GetCareJourneys`. Neither has a captured skeleton;
the field names the scrapers read are fixture-only.

**Standard.** Passed through whole. **Concise.** For questionnaires `name`,
`status`, `dueDate`; for journeys `name`, `status`, `providerName`. Both
tentative until captured. Note that `api-surface-gaps.md` lists a React-era
`/api/questionnaire/GetQuestionnaireList` that returns real data on the probed
account, so the endpoint itself may change.

---

### `get_activity_feed`

**Raw.** `POST /api/item-feed/FetchItemFeed` `{ maxItems: 50, offset: 0 }`.
Items sit under `singleItemFeedViewModels[].feedItems` (some releases also
`todayItems` / `forYouItems`), one view model per patient record the account
can see.

**Standard.** Per view model `displayName` (which patient), `eptId`; per
item `identifier`, `displayText`, `titleDisplayText`, `announcementBody`,
`type`, `defaultType`, `priority`, `priorityInstant`, `priorityInstantISO`
**(derived)**, `groupCount`, `topicId`, `primaryAction.uriDisplayText`.

**Dropped.** `phone`/`email`/`smsActive`/`allTextEnabled`/`allEmailEnabled`/
`canEditInfo` (a contact-info nag item's own fields), every `*Action.uri`/
`uriId`/`uriType`/`uriIconKey`/`uriAccessibleText`/`isHidden`, `iconKey`,
`subiconKey`, `shouldShowWatermark`, `isH2GEnabled`, `photoUrl`, `tabColor`,
`zeroStateIconKey`, `isSelected`, and the whole `linkedAccountsViewModel`
(covered by `get_linked_accounts`).

**Concise.** `priorityInstantISO` · `displayText`, newest first, with the
patient name when the account has more than one record.

---

### `get_education_materials`

**Raw.** `POST /api/education/GetPatEducationTitles`, a bare array.

**Standard.** `elementId`, `eduKey`, `displayName`, `assignedDate`,
`numTopics`, `wasAssignedThisVisit`, `numPagesReviewed`, `numPagesUnderstood`,
`numPagesQuestions` (progress through the material).

**Dropped.** `numPoints`, `isAdmitted`, `encounterContext`,
`canUserTrackUnderstanding`, `thumbnailImage`, `thumbnailImageBlobToken`,
`thumbnailIcon`, `tvSupported`, `removeThumbnails`.

**Concise.** `displayName`, `assignedDate`.

---

### `get_ehi_export`

**Raw.** `POST /api/release-of-information/GetEHIETemplates`.

**Standard.** `ehieTemplates[].id`, `.name`, `.description`; `existingEHIE`,
`isNoBuildEhie`.

**Dropped.** `hideAdditionalComments`, `__Status`, `__UpdateableSettings`
(throttle and queue settings of the server itself).

**Concise.** `name`, `description`.

---

### `get_linked_accounts`

**Raw.** `POST /Community/Shared/LoadCommunityLinks`. `OrgList` is a map of
~50-field organization records; `Spotlight[]` suggests organizations to link.

**Standard.** Per `OrgList` entry: `OrganizationName`, `OrganizationId`,
`LinkType`, `UserActionStatus`, `DisplayAddress[]`,
`LastEncounterDetail.Patient`/`.Physician`/`.Department`/`.Date`/`.Time`,
`LastAccessTokenDateTime`, `IsDisabled`, `IsInvalidCeLink`, `InvalidLinkReason`,
`ErrorMessage`, `NeedCeAuth`; page-level `HomeOrgName`, `CEOptOut`,
`ForwardedLinks[]`.

**Dropped.** `LogoUrl`, the terms URLs, every `Show*`/`Can*`/`Should*`/
`Display*` flag, `HiddenFromMyChart`, throttling and refresh-token fields,
`PayerOrgDetails`, `NewSubjectList`, `Spotlight[]`, `AutoQueryList`,
`InProgressList`, `Fhir*`, `IsNPP`, `IsSelfVerified`, `H2GHasBeenViewed`,
`IsConsentNeeded`, `HideAskLater`, `HasSearchableOrgs`.

**Concise.** `OrganizationName` and the last-encounter line when present.

---

### `get_emergency_contacts`

**Raw.** `POST /api/personalInformation/GetRelationships`.

**Standard.** Per contact: `id`, `formattedName`, `relationToPatient.name`,
`isPrimaryContact`, `isEmergencyContact` (present on only one captured
instance; absent means true, since the page is the emergency-contact page),
`contactInformation.phoneNumbers[]` (`phoneNumber`, `type`), `.emailAddress`,
`.address.formattedValues[]`; page-level `hideEmergencyContacts`.

**Dropped.** `relationToPatient.labelText`/`.isInactive`,
`isLinkedToOtherPatient`, `isHCA`, `isAddressLinkedToPatient`, the discrete
address parts (`formattedValues` carries them), `savedSuccessfully`,
`isPending`, `isVRK`, `relationToPatientChoices[]`, `requiredFields`,
`vrkFields`, `hasEndOfLifePageMnemonic`, `isViewOnly`.

**Concise.** `formattedName`, `relationToPatient.name`, first phone number,
`id`.

---

### `list_proxy_targets`

**Raw.** `GET /Home` (the proxy selector markup or script block) and, where the
instance serves it, `GET /ProxySwitch` JSON (`ProxySubjectList[]`). Discovery
has three surfaces; `raw` is whichever was used.

**Standard.** Per record `Id`, `DisplayName`, `IsSelf`, `IsSelected` with
`selectionKnown` **(derived)**; `active_patient` and `profile_name`
**(derived)**, as the capability returns today. This capability already
returns a designed shape rather than MyChart's; the only change is that `raw`
becomes available.

**Dropped.** `Ids[]`, `PhotoUrl`, `PhotoMagicId`, `BlobToken`, `TabColor`,
`LinkUrl`, `Loading`, `Disabled`, `ServiceAreaAbbreviationList`, the language
list and the `Show*` flags.

**Concise.** `DisplayName`, `(self)`, `(active)`.

---

### Write capabilities

`send_message`, `send_reply`, `delete_message`, `request_refill`,
`add_emergency_contact`, `update_emergency_contact`, `remove_emergency_contact`
return `{ success, error? }` plus a few echo fields. `raw` returns the
endpoint's response body (a conversation id string, an HTTP status with an
error page). The other modes return today's shape. No processor logic beyond
that.

## 4. What moves out of the scrapers

| Scraper | Logic that becomes processor work |
| --- | --- |
| `profile.ts` | Print-header regex, email pick from `SecureCommunicationInfo`. |
| `healthSummary.ts`, `medications.ts`, `allergies.ts`, `healthIssues.ts`, `immunizations.ts`, `medicalHistory.ts`, `goals.ts`, `letters.ts`, `documents.ts`, `referrals.ts`, `upcomingOrders.ts`, `questionnaires.ts`, `careJourneys.ts`, `activityFeed.ts`, `educationMaterials.ts`, `ehiExport.ts`, `otherMyCharts.ts`, `emergencyContacts.ts`, `careTeam.ts`, `notes.ts` (list) | The field projection into the local `type`. |
| `vitals.ts` | Regrouping readings by row, page de-duplication, `readingValue`. Paging stays. |
| `preventiveCare.ts`, `insurance.ts`, `bills.ts` (summary cards) | HTML parsing. |
| `visits/visits.ts` | Per-organization page merge, `visitTimestamp`. Paging stays. |
| `labs/labResults.ts` | `dropUnusableAbnormalFlags`, nesting the report and trend bodies onto the order, imaging classification, narrative lifting, FDI extraction and `image_id` encoding. The SAML fetch stays in the scraper (it is a request). |
| `messages/messageThreads.ts` | Ascending merge of pages, `senderName`, `isPatientAuthor`, the `ThreadMessage` rename. Paging stays. |
| `bills/bills.ts` | The per-account join of visits, statements, payments. |

Everything that issues a request stays where it is. Everything that reads a
response and decides what to keep moves.

## 5. Relationship to the three PRs

- **#375** drops `abnormalFlagCategoryValue` inside the scraper. Under this
  proposal the drop lives in the labs processor and `raw` keeps the field.
  The research in that PR's comment is the evidence the processor cites.
- **#377** adds `summary` on the capability and `full_detail` on the MCPB
  tool, with a `shared/summaries.ts` visits projection. That projection is the
  visits `concise` mode above. `full_detail: true` becomes `mode: 'raw'`.
- **#380** adds `condense.ts` in the MCPB with seven hand-written condensers
  and a generic prune, plus a `get_raw_data` tool. The seven condensers are the
  `concise` processors for visits, labs, imaging, billing, messages and
  recipients, with their `text()`/`rec()`/`row()` helpers reusable as-is. The
  generic prune is what `standard` does for null/empty scalars on every
  capability. `get_raw_data` is `mode: 'raw'` on the ordinary tool.

None of the three should merge as written; each should be re-cut against the
processor layer once it exists.

## 6. Open questions

1. **Concise as JSON.** The brief defines `json` as `standard`-as-JSON. A
   consumer that wants the concise projection as data has no mode. Suggest
   `mode` become two orthogonal parameters, `detail: raw | standard | concise`
   and `format: markdown | json`, with `raw` ignoring `format`.
2. **The markdown renderer.** One generic renderer (objects as heading +
   definition lists, arrays of objects as tables when flat, nested otherwise)
   keeps `standard` and `json` provably the same data. Per-capability markdown
   templates read better but are a second place for a field to go missing.
   Suggest generic for `standard`, hand-written for `concise`.
3. **`medicationKey`.** Fixture-only; `request_refill` posts it. Needs a
   capture of the real refill request before the medications processor can
   name the handle.
4. **Uncaptured shapes.** Patient goals, allergies, documents, questionnaires,
   care journeys, upcoming orders, insurance. The processors pass elements
   through until `realShapes.ts` has them. The fake should stop inventing
   element fields for these (it currently does, and the scrapers were written
   against the inventions).
5. **Message bodies.** Plain text or HTML on real instances? `bodyText` is
   emitted either way; the answer decides whether `standard` markdown shows
   `body` or `bodyText`.
6. **Type names.** The scrapers' exported types (`Medication`, `Visit`,
   `LabTestResult`, …) become the types of the `standard` objects. The raw
   types are the MyChart shapes, which `realShapes.ts` already describes; the
   processors can be typed against skeletons generated from it rather than a
   second hand-written copy.
