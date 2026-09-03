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

One parameter, `mode`, with those four values. `standard` and `json` are one
thing rendered two ways: the processor builds one object (the *standard
object*), `json` serializes it, and `standard` renders it through a generic
markdown renderer. `concise` is a projection of the same object, rendered by
the same generic renderer. There is no per-capability markdown template: a
field that is in the object is on the page, so nothing can go missing between
the two formats. There is never a field in `standard` that is not in `json`, or
the other way round, and the tables below have one column for the pair. `raw`
has no column: every MyChart field is in it by definition, and no derived field
is.

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
   (`Csn`, `hnoID`/`hnoDAT`/`lrpID`, `hthId`, `image_id`, contact `id`, proxy
   `Id`) is in `standard` and `concise`. A concise view that cannot be followed
   up on is a dead end.
6. **Membership is decided by the field's name, never by its value.** Each
   mode has a fixed field list per capability. A field on the list is emitted
   every time, including when its value is `false`, `0`, `""`, `null` or `[]`:
   "not refillable" and "no allergies on file" are answers, and a reader must
   be able to tell "none" from "not looked at". A field that is empty on every
   captured instance is off the list for `standard` and `concise` (the
   provably-empty class in §2). A field that carries data on some responses
   and not others is on the list, and the processor never looks at the value
   to decide whether to emit it. The unmerged condensers' `row()` helper,
   which drops a key when its value is empty, violates this and is not
   carried over.
7. **Errors pass through.** A scrape-error shape (`{ error }`), a WAF
   interstitial, a literal `null` from an unknown id: the processor returns it
   unchanged in every mode. Summarizing an error into nothing hides why the
   scrape failed.
8. **No clock, no locale.** Dates come from MyChart's own rendering or from a
   field that carries an explicit instant. The processor never formats an
   instant in the process's local zone (PR #380's reasoning: that moves an
   evening appointment to the wrong day).
9. **Markup stays in `raw`.** A field that carries HTML or RTF (`reportContent`,
   `bodyHTML`, a message `body`, a lab `value` with `isValueRtf`) is not on the
   `standard` or `concise` list. Those modes carry the derived `<field>Text`
   instead: plain text, block elements as line breaks, headings on their own
   lines, list items as bullets, table rows as tab-separated cells. The
   converter parses to a tree and never re-emits markup, so nothing it
   produces is ever rendered as HTML downstream.
10. **Never invent a shape.** A processor projects only field names that a
    captured real response has shown. Where the element shape has never been
    captured, the processor passes the element through whole and the table
    says so. Fixture fields that exist only in the fake are not evidence.

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

## 2. Reasons that recur in the tables

The reasoning column in §3 uses these short names so the argument is written
once. Anything not covered by one of these is spelled out on the row.

| Name | Meaning |
| --- | --- |
| **UI flag** | A boolean saying which button or panel MyChart's own web page renders (`IsRescheduleEnabled`, `showRefillButton`, `CanHideProvider`). No information about the patient. |
| **portal link** | A relative URL into the web portal. Useless outside a browser session. |
| **asset** | Photo, logo, icon, thumbnail, color, blob token. Presentation only. |
| **org blob** | The ~20-field organization object MyChart repeats on every row (`IsSSO`, `IncompleteH2GSetup`, `PayerOrgDetails`, `hasValidRefreshToken`, …). Only `OrganizationName` (and an address where a location matters) carries anything; it is lifted onto the row as a scalar. |
| **DXR plumbing** | State of MyChart's Care Everywhere / cross-organization data loading (`showDxrRefreshBanner`, `LoadingOrgNames`, `linkType`). Not chart content. |
| **session context** | Describes the caller, not the chart (`isProxyContext`, `userSettings`, `devicePlatform`, `IsClientTime`). |
| **internal** | Continuation tokens, Epic 1840-epoch day counts, blob keys, report variables, nonces. Needed by the scraper to fetch, not by a reader. A few stay as handles where a follow-up capability needs them. |
| **duplicate** | The same fact in another rendering that is kept (`Date` beside `Instant`, `contentAsHtml` beside `contentAsString`). |
| **always empty** | Empty, null or a constant on every captured instance, with the source of the evidence named. |
| **release-only** | Present on one Epic release and absent on the other, and not about the patient. |
| **uncaptured** | The element shape has never been seen on a real instance; passed through whole until a capture exists. |
| **handle** | An id another capability takes as input. Kept in every mode (rule 5). |
| **derived** | Computed by the processor from the raw fields named. Not in `raw`. |

## 3. Per-capability tables

Columns: **Field** (MyChart's name, or the derived name), **What it is**,
**Standard / JSON**, **Concise**, **Reasoning** (why the field is in or out of
each of the two).

Fields that share a description and a fate are grouped on one row. A group's
members are all listed so nothing is implied.

---

### `get_profile`

Two requests: `GET /Home` (HTML; the `.printheader` div carries
`Name | DOB | MRN | PCP`) and `POST /PersonalInformation/GetContactInformation`
(JSON). The scraper today returns `{ name, dob, mrn, pcp, email }` and discards
the rest of the contact-information body.

| Field | What it is | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | --- |
| `name`, `dob`, `mrn`, `pcp` | Parsed from the `/Home` print header. `mrn`/`pcp` blank on MyChart Central-style instances | ✓ | ✓ | Derived from the page HTML. The four facts that identify the record; every consumer needs them. |
| `SecureCommunicationInfo.EmailAddress` | Account email | ✓ | ✓ | The contact detail a consumer most often needs; small enough for concise. |
| `SecureCommunicationInfo.MobilePhone`, `HomePhone`, `WorkPhone` | Phone numbers | ✓ | — | Real contact data. Concise is the identity card, not the address book. |
| `SecureCommunicationInfo.SecureEmail`, `SecureMobile` | Verified-contact copies of the same values | — | — | Duplicate of `EmailAddress` / `MobilePhone`. |
| `PreferredDevice` | Preferred contact channel | ✓ | — | A stated preference; useful to anyone contacting the patient, not part of identity. |
| `PermanentAddress.FormattedValues[]` | Display lines of the home address | ✓ | — | The address as MyChart prints it. Standard carries contact data; concise does not. |
| `PermanentAddress.Street`, `.City`, `.State.Title`, `.Zip`, `.Country.Title`, `.HouseNumber`, `.Building`, `.Floor`, `.Unit`, `.PhoneNumber` | Discrete address parts | ✓ | — | For consumers that need structured parts rather than display lines. |
| `TemporaryAddress` (same subset) plus `.StartDateDisplay`, `.EndDateDisplay`, `.StartDateISO`, `.EndDateISO` | Temporary address and its validity window | ✓ | — | A second address is a fact; emitted blank when there is none (rule 6). |
| `*.County`, `*.District` objects; `*.State.Number`/`.Abbreviation`/`.Comment`/`.TitleUtf8`/`.AbbreviationUtf8`; same on `Country` | Code-table records behind the address parts | — | — | Duplicate of the `.Title` values already kept. |
| `PermanentAddress.IsViewOnly`, `.RequiredFieldNames`, `.Success`, `.IsPending`, `.AllowArbitraryInput`, `.AllowDefaults`, `.CollapsedStatus`; same on `TemporaryAddress` | Address-form state | — | — | UI flag. |
| `SecureCommunicationInfo.CanSupportEmail`, `.CanSupportMobile`, `.CanSupportOverwrite`, `.DoesEmailNeedAttention`, `.DoesMobileNeedAttention`, `.IsEmailDeleted`, `.IsMobileDeleted`, `.AreBothDeleted`, `.AreNeitherDeleted`, `.DoBothNeedAttention`, `.DoNeitherNeedAttention`, `.ContactVerificationDisabled` | Verification-banner state | — | — | UI flag. |
| `PermanentDefaults[]`, `TemporaryDefaults[]`, `RequiredFieldNames[]`, `ReadOnlyFieldNames[]`, `ValidationErrors[]`, `AllowArbitraryInput`, `AllowDefaults`, `HasEditableField`, `IsPending`, `IsTemporaryAddressDisabled`, `IsNonPatientProxyRecord` | Form configuration | — | — | UI flag. |

---

### `get_health_summary`

`POST /api/health-summary/FetchHealthSummary` and
`POST /api/health-summary/FetchH2GHeader`. The scraper keeps six fields; the
header body is ~500 lines and embeds a copy of the upcoming-visits view model.

| Field | What it is | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | --- |
| `header.patientAge` | Age as MyChart renders it | ✓ | ✓ | Top-line fact; the point of the summary. |
| `header.bloodType` | Blood type | ✓ | ✓ | Top-line fact. |
| `header.height.value`, `.dateRecorded` | Latest height | ✓ | ✓ | Top-line fact; the date says how current it is. |
| `header.weight.value`, `.dateRecorded` | Latest weight | ✓ | ✓ | Top-line fact. |
| `patientFirstName` | First name | ✓ | — | Real, but `get_profile` is the identity capability. |
| `isPatientAdmitted` | Currently an inpatient | ✓ | ✓ | A clinical state the scraper drops today. Whether the patient is in hospital right now belongs in the shortest view. |
| `conditionList[]`, `journeyList[]`, `actionPlans[]` | Conditions, care journeys, action plans | ✓ | — | Uncaptured; passed through whole. Out of concise until the element shape is known. |
| `schoolReportInfo.schoolReportTitle`, `.schoolReportID` | School health form | — | — | Internal: a report id no capability fetches. |
| `quickLinkDictionary.*` | Ten portal URLs | — | — | Portal link. |
| `canAccessSharingHub`, `isProxyContext` | Caller state | — | — | Session context. |
| `lastVisit.date`, `.visitType`; `nextVisit.date`, `.visitType` | Most recent and next visit | ✓ | ✓ | Two dates a reader asks for first. `nextVisit` is dropped by the scraper today. |
| `lastVisit.visitDetailsURL`, `.openRemotely`, `.mode`, `.visitCategory`; same on `nextVisit` | Link and rendering hints | — | — | Portal link / UI flag. |
| `upcomingVisitsList[]` | camelCase copy of `get_upcoming_visits` | — | — | Duplicate; one capability per fact. |

---

### `get_medications`

`POST /api/medications/LoadMedicationsPage`. ~150 fields per prescription
under `communityMembers[].prescriptionList.prescriptions[]`; the scraper keeps 12.

| Field | What it is | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | --- |
| `id` | MyChart's prescription id | ✓ | ✓ | Handle: the id a refill request will need. See the `medicationKey` note. |
| `name` | Order name (drug, strength, form) | ✓ | ✓ | The medication. |
| `patientFriendlyName.text`, `.caption`, `.captionType` | Plain-language name | ✓ | ✓ (`text`) | The name a patient recognizes; the caption explains the friendly name and is detail. |
| `sig` | Directions | ✓ | ✓ | How to take it. |
| `sigTranslationFromOrder` | Plain-language directions | ✓ | — | Same instruction in friendlier words; standard keeps both, concise keeps the canonical one. |
| `dateToDisplay`, `dateDisplayKey` | A date and what it means ("Started", "Last filled") | ✓ | ✓ | The date MyChart chose to show, with its meaning; without the key the date is ambiguous. |
| `formattedDateNoted`, `startDate`, `lastUpdateInstant`, `hasFutureStartDate` | Other dates on the order | ✓ | — | Chronology detail. |
| `prescriptionNumber` | Rx number | ✓ | — | What a pharmacy asks for; not part of a summary. |
| `authorizingProvider.name`, `orderingProvider.name` | Prescribers | ✓ | ✓ (authorizing) | Who prescribed. The two usually agree; concise keeps the authorizing one. |
| `authorizingProvider.id`, `.type`, `.hasPhotoOnBlob`; same on `orderingProvider` | Provider ids and photo flag | — | — | Internal / asset. |
| `isPatientReported`, `isClinicReported` | Who reported the medication | ✓ | ✓ (`isPatientReported`) | A patient-reported entry was never prescribed here; a reader must know. Emitted when false too (rule 6). |
| `isPendingUpdate`, `pendingUpdateType` | Patient-submitted change awaiting review | ✓ | — | The list may be about to change; detail. |
| `isAnticoagulationMed`, `isFrequencyPRN`, `criticalMedMessage` | Clinical flags | ✓ | — | Clinically meaningful flags; standard-level detail. |
| `classList[]` | Drug class | ✓ | — | Real pharmacology; detail. |
| `varianceComment`, `previousTakingDiffSig`, `previousTakingDiffSigInstant`, `previousTakingDiffSigCSN` | How the patient reported taking it differently | ✓ | — | Adherence information; detail. |
| `varianceReason.comment`, `.epic.Core.Data.ICommentable.CommentClientEditable` | Same comment plus a serializer artifact | — | — | Duplicate of `varianceComment`; the second key is an Epic serializer leak. |
| `refillDetails.isRefillable`, `.refillsRemaining`, `.hasRefillsRemaining` | Refill state | ✓ | ✓ | Whether a refill can be requested is the most common question about a medication. |
| `refillDetails.refillStatus`, `.refillExpirationDate`, `.refillWarningCode`, `.scheduledFillDate`, `.externalFillRequestDate`, `.nextDispenseDate` | Refill detail | ✓ | — | Detail behind the refill state. |
| `refillDetails.writtenDispenseQuantity`, `.writtenDispenseUnit`, `.writtenDispenseAmount`, `.daySupply` | Quantity per fill | ✓ | — | Detail. |
| `refillDetails.lastDispense.dispenseQuantity`, `.dispenseUnit`, `.dispenseAmount`, `.dispenseDate`, `.isRxReady`, `.dispenseType` | Last fill | ✓ | — | Detail. |
| `refillDetails.lastDispense.costDetails.formattedCopay`, `.copay`, `.isCopayPending`; `refillDetails.costDetails.*` (same) | Copay | ✓ | — | Money the patient owes; detail. |
| `*.costDetails.paymentCards[]`, `.hasPaymentCard`, `.isBilledToAccount` | Payment-method state | — | — | UI flag. |
| `refillDetails.lastDispense.amountDue`, `.workRequestFee`, `.workRequestFeeDue`, `.isPaymentValidForDeliveryMethod` | Delivery payment state | — | — | UI flag for the pay button. |
| `refillDetails.lastDispense.delivery.formattedShipDate`, `.formattedAddress[]`, `.shipmentTrackingInfo[]` | Mail-order delivery | ✓ | — | Where and when a shipment went; detail. |
| `refillDetails.owningPharmacy.name`, `.phoneNumber`, `.formattedAddress[]`, `.hours[]`, `.isPreferred` | Pharmacy | ✓ | ✓ (`name`) | Where to pick it up; the name alone answers the summary question. |
| `refillDetails.owningPharmacy.id`, `.departmentID`, `.isIntegrated`, `.hasCreditCardPayments`, `.showDrivingDirections`, `.isPatientMessagingEnabled`, `.supportedDeliveryMethods[]` | Pharmacy plumbing and delivery options | — | — | Internal / UI flag. |
| `refillDetails.refillButtonHoverCode`, `.refillButtonStatus`, `.refillsRemainingKey`, `.arePharmaciesAvailableForRefill`, `.showLastDispenseQuantity`, `.rxFlags[]`, `.currentFillDat`, `.doesWorkRequestContainHiddenMed` | Refill-button state | — | — | UI flag / internal. |
| `organizationName` | `organization.organizationName` lifted onto the row | ✓ | — | Derived. Which health system holds the prescription; matters on multi-organization accounts and is emitted on all (rule 6). |
| `organization.*` (on the prescription, the list and the community member) | The organization object, three times | — | — | Org blob. |
| `target`, `isSigRTL`, `isTranslationFromOrderRTL`, `providerDisplayKey`, `showProviderInMedsCard`, `drawProviderDetailsLink`, `isSelected`, `showPrescriptionCardBottomDetails`, `showPrescriptionCardBottom`, `showDeleteButton`, `showRefillButton`, `showRefillStatus`, `showWaitingForInsuranceAuth`, `showOrderLevelStatus`, `showBannerMessage`, `showDuplicateWarning`, `showHomeHealthPendingUpdateWarning`, `showSig`, `showPendingUndoDeleteButton`, `showPendingUndoAddButton`, `disableValidation`, `prescriptionListType`, `hasPrescriptionColDetail`, `hasRefillColDetail`, `hasPharmacyColDetail`, `showDrivingDirections`, `showMessagePharmacyAction`, `showCostDetails`, `showPayButton`, `highlightMedIsHidden`, `proxiesWhoCantAccessConfMeds[]`, `showProxiesWhoCantAccessList`, `showOutpatientPauseWarning`, `outpatientPauseSummary`, `outpatientPauseExtraText`, `outpatientPauseDupMismatchType`, `iconPath`, `contentLinkURL`, `isPreviousTakingDiffSigRTL` | Card rendering | — | — | UI flag / portal link / asset. |
| `prescriptionList.numRefillsDueSoon` | Count of refills due | ✓ | — | A real count; derivable but cheap to keep. |
| `prescriptionList.pickups[]`, `.deliveries[]`, `.inProgressWorkRequests[]` | Pending pharmacy work | ✓ | — | Uncaptured; passed through. |
| `prescriptionList.previousTakingValuesDate` | Date of the last "taking differently" review | ✓ | — | Chronology detail. |
| `prescriptionList.isPossiblyFiltered`, `.medicationsVerified`, `.showPreviousTakingValues`, `.showNotificationBanners`, `.showFilteredWarning`, `.showRefillButton`, `.showRefillDisclaimer`, `.onHealthSummaryPage`, `.loadingOrgNames`, `.hasOrgsLoading`, `.errorOrgNames`, `.hasOrgsWithErrors`, `.manualOrgNames`, `.hasOrgsManual`, `.showPrescriptionListWithTwoColumns`, `.showFreeTextPrescriptionInput`, `.showPrescriptionList`, `.enableDummyValidationCheckbox`, `.showDxrRefreshBanner`, `.showDxrBannerAction`, `.pretextStringKey`, `.showManagePharmacyLink` | List rendering and DXR state | — | — | UI flag / DXR plumbing. |
| `communityMembers[].context`, `.isPossiblyFiltered`, `.medicationsVerified`, `.showPreviousTakingValues`, `.isExternal`, `.showLoadingIndicator`, `.showAddMedicationBox`, `.showCommunityMemberOnInitialLoad`, `.showPersonalNotes`, `.requiresLoading`, `.showPrescriptionListWithTwoColumns`, `.enableSelectionMode`, `.useRxNormForSearch`, `.alwaysShowSearchMore`, `.showRespondByPreferences`, `.showMessageViewerOptions`, `.allowFreeTextPharmacy`, `.allowPickUpDateTimeInput`, `.allowMedsRefill`, `.areMedsPaidByPatient`, `.showEstimatedRxCost` | Per-organization page config | — | — | UI flag. |
| `getPatientFirstName` | First name | ✓ | — | Real; `get_profile` is the identity capability. |
| `showPatientAdmittedBanner`, `isProxyView`, `enableSelectionMode`, `hostedInIFrame`, `backToContextSet`, `medSettings.*`, `medicationsUrl` | Page config | — | — | UI flag / session context / portal link. |

**`medicationKey` is not a MyChart field.** The captured skeleton has `id`;
`medicationKey` exists only in the fake's fixture, and `request_refill` posts it
as `{ medicationKey }` to `/api/medications/RequestRefill`. Either the real
request shape is `{ id }` or it is something not yet captured. Out of scope
here, but the processor surfaces `id` and does not invent `medicationKey`.

---

### `get_allergies`

`POST /api/allergies/LoadAllergies`. The captured account had no allergies, so
the `dataList` element shape is unverified; the scraper hedges with
`allergyItem.*` and flat fallbacks.

| Field | What it is | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | --- |
| `dataList[]` | One allergy per element, whole | ✓ | ✓ | Uncaptured; passed through whole. When captured, standard narrows to `name`, `formattedDateNoted`, `type`, `reaction`, `severity`, `id` and concise to `name`, `reaction`, `severity`. The list is emitted empty too: "no allergies on file" is the answer most readers want (rule 6). |
| `allergiesStatus` | Status code of the allergy list (reviewed / unreviewed) | ✓ | ✓ | Says whether an empty list means "none" or "not reviewed"; that distinction is the whole value of the field. |
| `dateOfBirth` | Patient DOB | ✓ | — | Real; already in `get_profile`, kept here because the endpoint sends it and it costs nothing. |
| `hasUpdateSecurity`, `hasStandAloneUpdateSecurity` | Whether the patient may edit | — | — | UI flag. |
| `showDxrRefreshBanner`, `showDxrBannerAction`, `preTextStringKey` | Care Everywhere banner state | — | — | DXR plumbing. |

---

### `get_health_issues`

`POST /api/HealthIssues/LoadHealthIssuesData`.

| Field | What it is | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | --- |
| `dataList[].healthIssueItem.name` | Problem name | ✓ | ✓ | The problem. |
| `dataList[].healthIssueItem.formattedDateNoted` | Date noted | ✓ | ✓ | When it entered the chart. |
| `dataList[].healthIssueItem.id` | Problem id | ✓ | — | No capability takes it yet; kept in standard as an identifier. |
| `dataList[].healthIssueItem.isReadOnly` | Patient may not edit | ✓ | — | Weak signal, but real and cheap. |
| `dataList[].healthIssueItem.action` | Pending patient-edit action code | — | — | UI flag. |
| `dataList[].localItem.*` | Identical copy of `healthIssueItem` | — | — | Duplicate. |
| `dataList[].externalItems[]`, `.externalOrgs[]`, `.hasLocalInstance` | Other organizations' versions of the same problem | ✓ | — | Uncaptured; passed through. Cross-organization detail. |
| `dataList[].contentLinkURL`, `.contentLinkPath`, `.target` | Education link | — | — | Portal link. |
| `hasUpdateSecurity`, `hasStandAloneUpdateSecurity`, `alwaysShowSearchMore`, `showDxrRefreshBanner`, `showDxrBannerAction`, `preTextStringKey`, `healthIssuesUrl` | Page config | — | — | UI flag / DXR plumbing / portal link. |
| `dateOfBirth` | Patient DOB | — | — | Duplicate of `get_profile`. |

---

### `get_vitals`

`POST /api/track-my-health/GetFlowsheets`, then per flowsheet one or more
`POST /api/track-my-health/GetFlowsheetReadings` pages. Regrouping readings by
row and de-duplicating page overlaps become processor work; paging stays in the
scraper.

| Field | What it is | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | --- |
| `flowsheets[].name` | Episode name ("Blood pressure monitoring") | ✓ | ✓ | What the readings are for. |
| `flowsheets[].status`, `.startDateIso`, `.endDateIso`, `.instructions` | Episode state and care instructions | ✓ | — | The instructions are care instructions; detail. |
| `flowsheets[].episodeId`, `.templateId`, `.entryType`, `.entryMode`, `.hasEpisodeData` | Episode plumbing | — | — | Internal. |
| `flowsheets[].hasMoreData` | Paging hint | — | — | Always wrong: false while older readings exist (scraper comment). |
| `rows[].id` | Row (vital type) id | ✓ | — | Internal handle that ties readings to rows; concise groups by name instead. |
| `rows[].name` | Vital type ("Weight", "Pulse") | ✓ | ✓ | The measurement. |
| `rows[].unitsDisplayName` | Units | ✓ | ✓ | A value without units is not a value. |
| `rows[].rowType`, `.valueType`, `.decimalPlaces` | Value formatting | ✓ | — | Tells a consumer how to render; detail. |
| `rowGroups[].id`, `.name`, `.rowIds[]` | Which rows belong together (systolic/diastolic) | ✓ | — | Structure a consumer needs to pair readings; detail. |
| `readings[].rowId` | Which vital type | ✓ | ✓ | Ties the reading to its row. |
| `readings[].instantTakenIso` | When taken, clinic-local, no zone | ✓ | ✓ | The date of every reading. |
| `readings[].timeZone` | The zone of `instantTakenIso` | ✓ | — | What makes the instant interpretable; dropped today. Concise shows the clinic-local time as MyChart does. |
| `readings[].stringValue`, `.numericValue` | The value; string rows fill one, numeric rows the other | ✓ | — | Both raw forms kept in standard so nothing is lost. |
| `value` | First non-empty of the two, as a string | ✓ | ✓ | Derived from `stringValue` / `numericValue`; the one field a reader looks at. |
| `readings[].isAbnormal` | Flagged abnormal | ✓ | ✓ | The one verdict MyChart does give on vitals. Emitted when false (rule 6). |
| `readings[].entryType`, `.documentationSource` | Who recorded it (clinic, patient, device) | ✓ | — | Provenance; detail. |
| `readings[].id`, `.fsdId`, `.sourceRowId`, `.line`, `.valueType`, `.dataType`, `.decimalPlaces` | Storage ids and formatting | — | — | Internal, or duplicate of the row's formatting. |
| `userSettings.*` | Session, device, patient ids | — | — | Session context. |

Concise renders per vital type: name, units, the most recent reading, the
number of readings, and the abnormal readings.

---

### `get_immunizations`

`POST /api/immunizations/LoadImmunizations`.

| Field | What it is | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | --- |
| `organizationImmunizationList[].orgImmunizations[].name` | Vaccine | ✓ | ✓ | The vaccine. |
| `…orgImmunizations[].formattedAdministeredDates[]` | Every dose date | ✓ | ✓ | The doses; a vaccine record is its dates. |
| `…orgImmunizations[].id` | Immunization id | ✓ | — | Identifier; no capability takes it. |
| `organizationName` | `organization.organizationName` lifted onto the row | ✓ | — | Derived. Which system administered it; detail. |
| `organizationImmunizationList[].organization.*` | The organization object | — | — | Org blob. |
| `organizationImmunizationList[].showViewDetailsLink`, `showPersonalNotes`, `immunizationsUrl` | Page config | — | — | UI flag / portal link. |

---

### `get_preventive_care`

`GET /HealthAdvisories`, an HTML page. There is no JSON endpoint. Parsing moves
out of the scraper.

| Field | What it is | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | --- |
| `name` | Screening name | ✓ | ✓ | Derived from the page. The screening. |
| `status` | `overdue` / `not_due` / `completed` / `unknown` | ✓ | ✓ | Derived. The point of the page. |
| `overdueSince`, `notDueUntil`, `completedDate` | The date that goes with the status | ✓ | ✓ | Derived. A status without its date is half an answer. |
| `previouslyDone[]` | Prior completion dates | ✓ | — | Derived. History; detail. |
| `pageText` | Block-separated text of the advisories section | ✓ | — | Derived. Lets a consumer check what the parser saw when a row comes out `unknown`; the parser is heuristic and this is its audit trail. |

---

### `get_medical_history`

`POST /api/histories/LoadHistoriesViewModel`. The scraper keeps diagnoses,
surgeries and family members and drops the whole `socialHistory` block.

| Field | What it is | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | --- |
| `medicalHistory.diagnoses[].diagnosisName`, `.diagnosisDate` | Past diagnoses | ✓ | ✓ | Core history. |
| `medicalHistory.medicalHistoryNotes` | Free-text notes | ✓ | — | Clinician prose; detail. |
| `surgicalHistory.surgeries[].surgeryName`, `.surgeryDate` | Past surgeries | ✓ | ✓ | Core history. |
| `surgicalHistory.surgicalHistoryNotes` | Free-text notes | ✓ | — | Detail. |
| `familyHistoryAndStatus.familyMembers[].relationshipToPatientName`, `.conditions[]` | Relative and their conditions | ✓ | ✓ | Family history is what a clinician asks for. |
| `…familyMembers[].statusName` | Living / deceased | ✓ | ✓ | Part of family history as clinicians record it. |
| `…familyMembers[].nameOrAlias`, `.sexName`, `.relativeAge`, `.relativeAgeEnd` | Relative detail | ✓ | — | Age at diagnosis or death is clinically relevant; dropped today. Detail. |
| `…familyMembers[].familyMemberId`, `.relationshipToPatientId`, `.sexId`, `.genderId`, `.statusId` | Code-table ids | — | — | Internal. |
| `…familyMembers[].removeFamilyMember`, `.createdOnClient`, `.changes[]` | Edit-form state | — | — | UI flag. |
| `familyHistoryAndStatus.familyHistoryNotes`, `.familyStatusNotes` | Free-text notes | ✓ | — | Dropped today; detail. |
| `socialHistory.smokingHistory.smokingTobaccoStatus`, `.tobaccoUse` | Smoking status | ✓ | ✓ | Dropped entirely today. One of the first questions in any history. |
| `socialHistory.smokingHistory.smokingTobaccoTypes[]`, `.smokingTobaccoQuitDate` | Smoking detail | ✓ | — | Detail behind the status. |
| `socialHistory.smokelessHistory.smokelessTobaccoStatus`, `.smokelessTobaccoTypes[]`, `.smokelessQuitDate` | Smokeless tobacco | ✓ | — | Detail. |
| `socialHistory.alcoholHistory.alcoholUse` | Alcohol use | ✓ | ✓ | Same standing as smoking status. |
| `socialHistory.alcoholHistory.alcoholAmount`, `.alcoholUnit` | Alcohol amount | ✓ | — | Detail. |
| `socialHistory.socialHistoryNotes` | Free-text notes | ✓ | — | Detail. |
| `socialHistory.*.show*QuitDate`, `socialHistory.isProxy`, `isShareEverywhere` | Rendering and caller state | — | — | UI flag / session context. |

---

### `get_goals`

`POST /api/goals/LoadCareTeamGoals` and `POST /api/goals/LoadPatientGoals`.

| Field | What it is | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | --- |
| `careTeamGoals[]` | Goals set by the care team, whole | ✓ | ✓ | Uncaptured (empty on every captured account); passed through whole. |
| `patientGoals[]` | Goals set by the patient, whole | ✓ | ✓ | Uncaptured; passed through. See the note. |
| `source` | `care_team` or `patient`, on each goal | ✓ | ✓ | Derived from which endpoint answered. Who set the goal changes what it means. |
| `hasChartGraphSecurity`, `isSharingNotesEnabled`, `quickLinkDictionary.*` | Page config | — | — | UI flag / portal link. |

**The patient-goal shape is unverified and probably wrong.** The captured
`loadPatientGoals` element has `goalId`, `goalType`, `readings[]`,
`complianceType`, `lastUpdatedDate`, `creationDate`. It has no `name`,
`description`, `status`, `startDate` or `targetDate`; those five exist only in
the fixture, which `conformToShape` serves alongside the real keys. Against a
real instance with patient goals, today's scraper returns five empty strings per
goal. Once captured, concise narrows to name, status and target date, whatever
those are called.

---

### `get_upcoming_visits` and `get_past_visits`

`POST /Visits/VisitsList/LoadUpcoming` (three buckets: `InProgressVisits`,
`NextNDaysVisits`, `LaterVisitsList`) and `POST /Visits/VisitsList/LoadPast`,
paged with `SerializedIndex` (10 visits per organization per page). `raw` for
past visits is the envelope of every page fetched; the per-organization merge
becomes processor work.

One table for the visit object, shared by both capabilities, then one for each
container.

| Field | What it is | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | --- |
| **Handles** | | | | |
| `Csn` | Encounter id | ✓ | ✓ | Handle: what `get_visit_notes` and `get_visit_avs` take. |
| `CsnForECheckIn` | Same id as used by e-check-in | ✓ | — | The fallback when `Csn` is blank on some rows (#377); standard keeps it so the fallback is visible. |
| `Id`, `ReferenceID` | Appointment ids | ✓ | — | Identifiers; no capability takes them. |
| **When** | | | | |
| `Instant` | `/Date(ms)/`, absolute | ✓ | — | The machine-readable time, in Epic's own encoding. |
| `instantISO` | `Instant` as ISO-8601 UTC | ✓ | — | Derived from `Instant`. For consumers that sort or compute; concise shows the clinic's rendering instead (rule 8). |
| `PrimaryDate` | `MM/DD/YYYY hh:mm:ss AM`, clinic-local, no zone | ✓ | ✓ | The clinic's own rendering of when the visit is; the safest date to show a reader. |
| `TimeZone` | The department's zone name | ✓ | — | What makes `PrimaryDate` interpretable; detail. |
| `IsTimeToBeDetermined`, `IsHideVisitTime` | Whether the clock time is meaningful | ✓ | ✓ | The renderer prints "time TBD" when either is true; both fields are emitted regardless (rule 6). |
| `DurationInMinutes`, `HasDuration` | Scheduled length | ✓ | — | Detail. |
| `ArrivalTime`, `EarlyArrivalReason` | Asked-to-arrive time and why | ✓ | — | Instructions to the patient; detail. |
| `CanShowArrivalTime` | Whether the page shows it | — | — | UI flag. |
| `AdmissionDateRange.Start`, `.End`, `DischargeDate` | Inpatient stay | ✓ | ✓ | A hospital stay's dates are the visit for inpatient rows. |
| `RescheduledDatString` | Date the visit was moved from | ✓ | — | History of the appointment; detail. |
| `RescheduledDat` | Same, as an Epic day count | — | — | Internal. |
| `Date`, `Time`, `ShortDate`, `Month`, `DateOfMonth`, `Year`, `HighlightDate`, `IsAM` | Locale renderings of the same instant | — | — | Duplicate of `PrimaryDate` / `Instant`. |
| `Dat` | Epic 1840-epoch day count | — | — | Internal. |
| `IsClientTime`, `ClientTimeZoneMarker` | About the caller's zone | — | — | Session context. |
| **What** | | | | |
| `VisitTypeName` | Visit type | ✓ | ✓ | What kind of visit. |
| `IsUsingFallbackVisitTypeName` | The type is a generic fallback label | ✓ | — | Says how much to trust `VisitTypeName`; detail. |
| `EncounterType`, `EncounterIsSurgery`, `EncounterIsEDVisit`, `IsPreadmission`, `IsHovPreadmission`, `IsResidentialMed` | Encounter class | ✓ | — | Classification detail. |
| `ChiefComplaint` | Reason for visit | ✓ | ✓ | Why the patient went. |
| `Diagnoses[].Code`, `.Description` | Diagnoses; rendered "Description (Code)" | ✓ | ✓ | What was found. |
| `SurgicalProcedures[].Name` | Procedures | ✓ | ✓ | What was done. |
| `SurgicalProcedures[].Instructions`, `.Providers[].Name` | Procedure instructions and surgeons | ✓ | — | Detail. |
| `HasProcedures`, `NumberOfProcedures` | Count of the above | — | — | Duplicate. |
| `Cases[].CaseId`, `.Description` | Surgical cases | ✓ | — | Detail. |
| `ComponentVisits[].Csn`, `.VisitTypeName`, `.PrimaryDate`, `HasComponentVisits` | Sub-visits of a combined appointment | ✓ | — | Each carries its own CSN, so its notes are reachable; detail. |
| `PatientNextStepInstructions` | Instructions to the patient | ✓ | — | Detail. |
| `EpisodeDetails.GestationalAge` | Pregnancy episode | ✓ | — | Clinical fact; detail. |
| `SurgeryTimeOfDay` | Surgery slot code | ✓ | — | Detail. |
| **Who** | | | | |
| `PrimaryProviderName` | Attending, as a string | ✓ | ✓ | Who the patient saw. |
| `PrimaryProvider.Name`, `Providers[].Name`, `OtherProviders[].Name` | Providers (object forms) | ✓ | — | The full list, for multi-provider visits; concise shows the primary. |
| `Providers[].Department.Name`, `.Address[]`, `.PhoneNumber` | Each provider's clinic | ✓ | — | Detail. |
| `Providers[].EncryptedId`, `.Type`, `.PhotoUrl`, `.PhotoLink`, `.WebPageUrl`, `.HasPhotoOnBlob`, `.PhotoBlobToken`, `.IsPerson`, `.PhotoClass`; same on `PrimaryProvider`, `OtherProviders[]`, `SurgicalProcedures[].Providers[]` | Provider ids, photos, links | — | — | Asset / portal link / internal. |
| `Providers[].Department.*` other than the three above; same on `PrimaryProvider.Department` | Department rendering fields | — | — | Duplicate of `PrimaryDepartment` / UI flag. |
| `IsSingleProvider`, `NumberOfOthers` | Counts of the above | — | — | Duplicate. |
| `GuestPatientFirstName` | Guest on a video visit | ✓ | — | Detail. |
| **Where** | | | | |
| `PrimaryDepartment.Name` | Clinic | ✓ | ✓ | Where. |
| `PrimaryDepartment.Address[]`, `.PhoneNumber`, `.Specialty.Title`, `.Instructions[].Text`, `.ArrivalLocation`, `.TimeZone` | Clinic detail and arrival instructions | ✓ | — | Detail. |
| `PrimaryDepartment.Id`, `.HasAddress`, `.ShouldShowInstructions`, `.CanShowDrivingDirections`, `.IsPreadmissionLocation`, `.Specialty.Value`/`.TitleUtf8`/`.Abbreviation`, `.Instructions[].Type` | Department plumbing | — | — | Internal / UI flag. |
| `PreadmissionLocation.Name`, `.Address[]`, `.PhoneNumber`, `.Instructions[].Text`, `.ArrivalLocation` | Pre-admission site | ✓ | — | Detail. |
| `PreadmissionLocation.*` other fields | As for `PrimaryDepartment` | — | — | Internal / UI flag. |
| `organizationName` | `Organization.OrganizationName` lifted onto the row | ✓ | ✓ | Derived. Which health system; on a multi-organization account a visit without it is ambiguous, and it is emitted on every account (rule 6). |
| `Organization.*` | The organization object | — | — | Org blob. |
| `OrganizationLinks[]`, `PrimaryOrganizationLink`, `EncodedOrgID`, `IsLocal`, `IsNonEpic`, `OwnedBy` | Which organization owns the row and links to it | — | — | DXR plumbing. |
| **Status** | | | | |
| `IsCanceled`, `IsNoShow`, `LeftWithoutSeen`, `InProgress`, `IsArrived`, `IsConfirmed`, `IsCancelRequestSent` | The status booleans | ✓ | — | The raw inputs to `status`; standard keeps them so the derivation is checkable. |
| `status` | One word: `canceled` › `no_show` › `left_without_being_seen` › `in_progress` › `arrived` › `completed` (any `LoadPast` row) › `cancel_requested` › `confirmed` › `scheduled` | ✓ | ✓ | Derived from the seven booleans in PR #380's order. A canceled visit reported as "completed" is a lie about care the patient never received, so the order is most-specific first. |
| `ConfirmationStatus`, `ArrivalStatus` | Status codes | ✓ | — | Detail. |
| `IsPastVisit` | Rendering hint | — | — | Always wrong: false on rows `LoadPast` itself returned (#377, #380). The capability that was called already says which side of now the visit is on. |
| `PastVisitBucket` | Which list section the row renders in | — | — | UI flag. |
| **Mode** | | | | |
| `Telemedicine.IsTelemedicine`, `.TelemedicineMode`, `TelehealthMode`, `EVisit.IsEVisit`, `IsInHomeVisit` | Video / e-visit / home visit | ✓ | — | How the visit happened; detail. |
| `Telemedicine.TelemedicineUrl`, `EVisit.EVisitUrl`, `CanShowTelemedicine`, `IsUnverifiedOnDemandVideoVisit`, `EncryptedLvvId` | Join links and their state | — | — | Portal link / UI flag / internal. |
| **Money** | | | | |
| `Copay.Amount`, `Copay.IsPaid`, `HasPaymentInfo`, `IsFullyPaid` | Copay | ✓ | — | Money owed; detail. |
| `IsCopayEnabled`, `CanShowPayments`, `HasPaymentFeature` | Payment UI | — | — | UI flag. |
| **Records available** | | | | |
| `IsClinicalNoteAvailable` | Whether `get_visit_notes` has anything for this CSN | ✓ | ✓ | Tells a reader whether a follow-up call is worth making. |
| `IsNotesOnly`, `IsClinicalInformationAvailable` | Related availability flags | ✓ | — | Detail. |
| `IsVisitSummaryEnabled` | Whether `get_visit_avs` has anything | ✓ | ✓ | Same reasoning as the note flag. |
| `HasDownloadSummaryLink` | A summary download exists | ✓ | — | Detail. |
| `IsNotViewed` | Patient has not opened the visit record | ✓ | — | Read state is a weak but real fact. |
| `IsViewStatusVisible` | Whether the page shows that | — | — | UI flag. |
| `IsVisitAmbulatory` | Ambulatory vs inpatient | ✓ | — | Classification detail. |
| **Everything else** | | | | |
| `HasQuestionnaireFeature`, `HasNewPvdFeature`, `FeedbackQnrIDs[]`, `IsAmbPastVisitDetailsEnabled`, `IsAllIPSecurityPointsDisabled`, `IsIPPastVisitDetailsEnabled`, `IsPastVisitDetailsEnabled`, `ShowVisitDetails`, `UnverifiedProxyJumpUrl`, `HasTransmitSummaryLink`, `CanRedirectToApptDetails`, `IsApptDetailsEnabled`, `IsRequestCancelEnabled`, `IsDirectCancelEnabled`, `IsRescheduleEnabled`, `IsDownloadSummaryEnabled`, `IsTransmitCEEnabled`, `IsTransmitDirectEnabled`, `IsDischargeInstrEnabled`, `IsPatHandoutsEnabled`, `IsIPReviewEnabled`, `IsDischargeSummaryEnabled`, `IsProviderLinkEnabled`, `IsPreadmissionEnabled`, `IsEcheckInCompleted`, `CanRequestCancel`, `CanReschedule`, `IsDetailsEnabled`, `CanShowAddToCalendar`, `IsDrivingDirectionsEnabled`, `CanDirectlyCancel`, `HasSentUpgradeRequest`, `CanSendUpgradeRequest`, `ShowPFIOLink`, `IsCEOptedIn`, `UserMyChartStatus` | Which buttons the portal renders | — | — | UI flag. |
| `ECheckIn.*`, `CanShowECheckIn`, `ShouldDeprecateECheckInBrand`, `IsMultiPhaseOn`, `CanShowECheckInComplete`, `IsECheckInComplete`, `HasChildrenNeedingECheckIn`, `NextIncompleteVisitECheckInCsn`, `IsEcheckInEnabled`, `IsECheckInIncomplete`, `CanECheckIn`, `ShouldShowECheckInInGuideBanner`, `CompleteECheckInCount`, `TotalECheckInCount` | E-check-in workflow | — | — | UI flag. |
| `IsUserInitiatedArrivalAllowed`, `SelfArrivalMechanism`, `SelfArrivalBannerViewModel`, `GeolocationArrival`, `ArrivalAdditionalActions[]` | Self-arrival workflow | — | — | UI flag. |
| `IsProxyRequestMinorFormOn`, `ProxyRequestMinorForm` | Proxy consent form | — | — | UI flag. |

Past-visits container:

| Field | What it is | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | --- |
| `List[<orgId>].List[]` | The visits, per organization | flattened to one list | same | Derived flattening; the organization is on each row as `organizationName`, so the nesting carries nothing. |
| `hasOlderVisits` | Any organization's `HasMoreData` | ✓ | ✓ | Derived. Says whether MyChart holds visits older than the pages fetched, so "that's all of it" is never inferred from a list that stopped. |
| `count` | Number of visits | ✓ | ✓ | Derived. Cheap and useful. |
| `List[<orgId>].ListSize`, `.CanSearch`, `.SkippedSomeResults`, `.SerializedIndex`, `.ViewbagProperties`, `.Organization` | Paging and rendering | — | — | Internal / org blob. |
| `ViewBagProperties.LoadingOrgNames`, `.ErrorOrgNames`, `.ManualOrgNames` | Care Everywhere load state | — | — | DXR plumbing. |
| `SerializedIndex`, `CanSearch`, `CanAllSearch`, `CanSort`, `AutoRenderThisSet`, `SkippedSomeResults`, `Organizations{}` | Paging and rendering | — | — | Internal / org blob. |

Upcoming-visits container:

| Field | What it is | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | --- |
| `InProgressVisits[]`, `NextNDaysVisits[]`, `LaterVisitsList[]` | The three buckets | flattened, each visit gaining `bucket` | same | Derived flattening; one list sorted by time reads better than three, and the bucket survives as a field. |
| `bucket` | `in_progress` / `soon` / `later` | ✓ | ✓ | Derived. In-progress, next few days and later mean different things (#380). |
| `count` | Number of visits | ✓ | ✓ | Derived. |
| `HighlightDays[]`, `HasPVG` | Calendar rendering | — | — | UI flag. |

---

### `get_visit_notes`

`POST /api/visit-notes/GetVisitNotes` `{ CSN, FromPvdPage }`. An unknown CSN
answers a literal JSON `null`, passed through in every mode (rule 7).

| Field | What it is | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | --- |
| `csn` | Echo of the input | ✓ | ✓ | Derived. The result names the visit it belongs to. |
| `lrpID` | Report id shared by every note of the visit | ✓ | ✓ | Handle: `get_note_content` takes it. |
| `depPhoneNumber` | Department phone | ✓ | — | Real; detail. |
| `isAtLeastOneNoteSensitive` | Any note is marked sensitive | ✓ | — | Detail. |
| `noteList[].hnoID`, `.hnoDAT` | Note id and date key | ✓ | ✓ | Handle: `get_note_content` takes both. A listing whose only purpose is choosing a note to open must carry what opening it needs. |
| `noteList[].displayName` | Note type ("Progress Notes", "Discharge Summary") | ✓ | ✓ | What the note is. |
| `noteList[].iso` | Note timestamp | ✓ | ✓ | When. |
| `noteList[].provider.name` | Author | ✓ | ✓ | Who. |
| `noteList[].provider.magicID` | Author id | ✓ | — | Identifier; detail. |
| `noteList[].isAddendum`, `.isNoteSensitive` | Note flags | ✓ | — | Detail. |
| `noteList[].attachments[]` | Attachments | ✓ | — | Uncaptured; passed through. |
| `noteList[].provider.hasPhotoOnBlob` | Photo flag | — | — | Asset. |

Today's scraper renames `hnoID` → `hnoId`, `hnoDAT` → `hnoDat`, `lrpID` →
`lrpId`. Under rule 2 the standard object keeps MyChart's spelling; the
`get_note_content` parameter names are our API and can stay as they are.

---

### `get_note_content` and `get_visit_avs`

`POST /api/report-content/LoadReportContent` with `reportMnemonic: 'OPEN_NOTES'`
(note) or `'AMB_AVS'` (after-visit summary). `reportContent` is an HTML
fragment.

| Field | What it is | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | --- |
| `reportContent` | The note or summary, as HTML | — | — | Markup stays in `raw` (rule 9). |
| `reportContentText` | Plain text of the note | ✓ | ✓ | Derived from `reportContent`. A note has no shorter faithful form; a model can summarize it, a processor must not. |
| `reportCss`, `baseFontSize`, `stylesheets[]` | Styling | — | — | Asset. |

---

### `get_letters`

`POST /api/letters/GetLettersList`.

| Field | What it is | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | --- |
| `letters[].hnoId`, `.csn` | Letter and visit ids | ✓ | ✓ | Handle: `get_letter_details` takes both. |
| `letters[].dateISO` | Letter date; may be blank | ✓ | ✓ | When. |
| `letters[].reason` | Subject | ✓ | ✓ | What. |
| `letters[].viewed` | Read state | ✓ | ✓ | Unread letters are the ones a reader wants first. |
| `letters[].empId` | Author id, key into `users` | ✓ | — | Kept so the name resolution is checkable; detail. |
| `providerName` | `users[empId].name` resolved onto the letter | ✓ | ✓ | Derived. Who wrote it. |
| `users{}` | Author directory (`empId`, `name`, `photoUrl`) | — | — | Resolved into `providerName`; `photoUrl` is an asset. |
| `departments{}` | Department directory; empty on capture | ✓ | — | Uncaptured; passed through. |

The list is sorted newest first with unparseable dates last (today's scraper
behavior, now processor behavior).

---

### `get_letter_details`

`POST /api/letters/GetLetterDetails` `{ hnoId, csn }`. Literal `null` for an
unknown id, passed through.

| Field | What it is | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | --- |
| `bodyHTML` | The letter, as HTML | — | — | Markup stays in `raw` (rule 9). |
| `bodyHTMLText` | Plain text | ✓ | ✓ | Derived from `bodyHTML`. The letter, readable. |

---

### `get_documents`

`POST /api/documents/viewer/LoadOtherDocuments`. No captured skeleton; the six
fields the scraper reads exist only in the fixture.

| Field | What it is | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | --- |
| `documents[]` | One document per element, whole | ✓ | ✓ | Uncaptured; passed through whole. Once captured, concise narrows to title, type, date and provider. |

---

### `get_lab_results`

For each `groupType` in 0..3, `POST /api/test-results/GetList` (one combined
list for 0 and 1; a 500 for the rest, faithfully). Then per unique order key:
`POST /api/test-results/GetDetails`,
`POST /api/past-results/GetMultipleHistoricalResultComponents`, and, when
`reportDetails.reportID` is set, `POST /api/report-content/LoadReportContent`.
`raw` is the envelope. Joining the trend and report onto the order, and deleting
the abnormal flag, become processor work.

The `GetDetails` body, per order:

| Field | What it is | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | --- |
| `orderName` | Order (panel) name | ✓ | ✓ | What was ordered. |
| `key` | Order id | ✓ | — | Identifier; detail. |
| `results[].name` | Result name | ✓ | ✓ | What the result is; usually the panel name again. |
| `results[].key` | Result id | ✓ | — | Identifier. |
| `results[].isAbnormal` | Order-level abnormal flag | ✓ | — | A real MyChart field some instance may set, but `false` on all 39 captured results including out-of-range ones (#375). Standard keeps it as data; concise leaves it out so a reader does not take a never-set flag for a verdict. |
| `results[].hasComment`, `.warningType`, `.warningMessage` | Comment presence and warnings | ✓ | — | A warning is information; detail. |
| `results[].orderMetadata.prioritizedInstantISO` | Result timestamp | ✓ | ✓ | When. |
| `results[].orderMetadata.prioritizedInstantDisplay`, `.resultTimestampDisplay`, `.latestUpdateInstantISO` | Other renderings and the last-update time | ✓ | — | Kept for consumers that want MyChart's display form; concise shows one date. |
| `results[].orderMetadata.collectionTimestampsDisplay`, `.specimensDisplay` | Collection time and specimen | ✓ | — | Detail. |
| `results[].orderMetadata.resultStatus` | "Final", "Preliminary", … | ✓ | ✓ | A preliminary result may change; a reader must know. |
| `results[].orderMetadata.orderProviderName` | Ordering provider | ✓ | ✓ | Who. |
| `results[].orderMetadata.authorizingProviderName`, `.readingProviderName` | Other providers | ✓ | — | Detail. |
| `results[].orderMetadata.resultType` | "LAB" / "IMAGING" | ✓ | — | Classification; detail. |
| `results[].orderMetadata.associatedDiagnoses[]` | Diagnoses on the order | ✓ | — | Why it was ordered; detail. |
| `results[].orderMetadata.resultingLab.name`, `.address[]`, `.phoneNumber`, `.labDirector`, `.cliaNumber`, `.accreditationType` | Performing lab | ✓ | — | Provenance; detail. |
| `results[].orderMetadata.read`, `.unreadCommentingProviderName` | Read state | — | — | UI flag. |
| `results[].resultComponents[].componentInfo.componentID` | Component id; key into the trend map | ✓ | — | Internal handle; standard keeps it so the trend join is checkable. |
| `…componentInfo.name`, `.commonName`, `.units` | Component name and units | ✓ | ✓ | The analyte and its units. |
| `…componentResultInfo.value` | The value as MyChart prints it; RTF when `isValueRtf` | — | — | Markup stays in `raw` (rule 9). |
| `valueText` | `value` with any RTF stripped | ✓ | ✓ | Derived from `value` and `isValueRtf`. The result. |
| `…componentResultInfo.numericValue` | The value as a number | ✓ | — | For consumers that compute; concise shows the printed form. |
| `…componentResultInfo.isValueRtf` | `value` carried RTF | ✓ | — | Says whether `valueText` was converted. |
| `…componentResultInfo.referenceRange.formattedReferenceRange` | Range as printed | ✓ | ✓ | The only abnormality signal MyChart gives (#375); a value without its range is uninterpretable. |
| `…referenceRange.low`, `.high`, `.displayLow`, `.displayHigh`, `.lowerBoundExclusive`, `.upperBoundExclusive` | Range parts | ✓ | — | For consumers that compare; concise shows the printed form. |
| `…componentResultInfo.abnormalFlagCategoryValue` | Per-component abnormal flag | — | — | Always empty: the literal `"Unknown"` on 175 of 175 captured components across both releases, out-of-range ones included (#375). A flag-shaped field with no verdict in it is worse than none. |
| `…componentComments.contentAsString` | Comment text | ✓ | ✓ | Lab comments qualify the value ("hemolyzed"); they belong beside it. |
| `…componentComments.contentAsHtml`, `.isRTF`, `.hasContent` | Comment as HTML and its flags | — | — | Duplicate. |
| `results[].studyResult.narrative.contentAsString`, `.signingInstantTimestamp` | Findings (imaging, pathology) | ✓ | ✓ (text) | The report. |
| `results[].studyResult.impression.contentAsString`, `.signingInstantTimestamp` | Impression | ✓ | ✓ (text) | The conclusion of the report. |
| `results[].studyResult.addenda[].contentAsString`, `.signingInstantTimestamp` | Addenda | ✓ | ✓ (text) | An addendum can reverse a finding. |
| `results[].studyResult.transcriptions[]`, `.ecgDiagnosis[]`, `.hasStudyContent`, `.isFullResultText`, `.isCupidAddendum` | Other study content | ✓ | — | Uncaptured; passed through. |
| `results[].studyResult.combinedRTFNarrativeImpression.*` | Narrative + impression concatenated | — | — | Duplicate. |
| `*.contentAsHtml`, `*.isRTF`, `*.hasContent` on narrative, impression, addenda, resultNote, resultLetter | HTML copies and flags | — | — | Duplicate; `hasContent` is not trusted (#380 reads the string). |
| `results[].resultNote.contentAsString`, `.signingInstantTimestamp` | Provider's note to the patient | ✓ | ✓ (text) | The clinician's interpretation, written for the patient. |
| `results[].resultLetter.contentAsString`, `.signingInstantTimestamp` | Result letter | ✓ | ✓ (text) | Same standing as the note. |
| `results[].providerComments[].commentText`, `.providerName`, `.commentDate` | Threaded comments | ✓ | — | Detail. |
| `results[].reportDetails.reportID`, `.isDownloadablePDFReport` | Report id and PDF availability | ✓ | — | Detail. |
| `results[].reportDetails.reportVars.ordId`, `.ordDat`, `.reportContext`, `.openRemotely` | Fetch variables | — | — | Internal. |
| `reportContent` (joined `LoadReportContent.reportContent`) | Rendered report HTML | — | — | Markup stays in `raw` (rule 9). |
| `reportContentText` | Plain text of the report | ✓ | ✓ | Derived. The rendered report often carries what the structured fields do not (pathology, microbiology). |
| `LoadReportContent.reportCss`, `.baseFontSize`, `.stylesheets[]` | Styling | — | — | Asset. |
| `results[].imageStudies[]`, `.scans[]`, `.fdiLink.redirectUrl` | Imaging links | ✓ | — | Passed through for `get_imaging_results`; detail here. |
| `results[].indicators[]`, `.variants[]`, `.tooManyVariants`, `.geneticProfileLink` | Genetic-result fields | — | — | Uncaptured and empty on every capture; revisit when a genetic result is captured. |
| `results[].showName`, `.showDetails`, `.shouldHideHistoricalData`, `.shareEverywhereLogin`, `.showProviderNotReviewed`, `.hasAllDetails` | Rendering | — | — | UI flag. |
| `results[].baseSingleMessageUrl`, `.fullMultipleMessagesUrl`, `.relatedConversationIds[]`, `.hiddenProxies` | Messaging links | — | — | Portal link / internal. |
| `results[].canGenerateLLMSummary`, `.feedbackSubmitted`, `.isBedsideTablet` | November 2025 only | — | — | Release-only. |
| `orderLimitReached`, `ordersDeduplicated`, `isEnhancedAskAQuestionActive`, `hideEncInfo` | Page config | — | — | UI flag. |

The trend body, joined onto the order as `historicalResults`:

| Field | What it is | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | --- |
| `historicalResults[<componentID>].name`, `.commonName`, `.units` | Component | ✓ | — | Duplicate of the component's, kept because the map can hold components the current order lacks. |
| `historicalResults[<componentID>].oldestResultISO` | Start of the trend | ✓ | — | Says how far back the history goes; detail. |
| `historicalResults[<componentID>].historicalResultData[].dateISO`, `.value` | Trend points | ✓ | ✓ (8 most recent) | The trend is why a reader looks at a lab. Sorted before capping so the cap keeps the newest whatever order the instance sent (#380). |
| `…historicalResultData[].numericValue` | Trend value as a number | ✓ | — | For consumers that compute. |
| `…historicalResultData[].referenceRange.*`, `.isValueRtf` | Range at the time | ✓ (`formattedReferenceRange` and parts) | — | Ranges change over years; detail. |
| `…historicalResultData[].abnormalFlagCategoryValue` | Same `"Unknown"` | — | — | Always empty (#375). |
| `historicalResults[<componentID>].hideGraph`, `.showAbnormalFlag` | Per-graph display bits | — | — | UI flag. `showAbnormalFlag` is a display bit, not a per-value verdict (#375). |
| `orderedComponentIDs[]`, `reportID`, `shouldShowBedsideActiveView` | Ordering and plumbing | — | — | Internal / UI flag. |

The `GetList` body:

| Field | What it is | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | --- |
| `newResultGroups[].isInpatient`, `.isEDVisit`, `.formattedAdmitDate`, `.formattedDischargeDate` | Encounter context of the order; lifted onto the order | ✓ | — | Where the sample was drawn; detail. |
| `newResultGroups[].key`, `.contactType`, `.resultList[]`, `.isCurrentAdmission`, `.visitProviderID`, `.organizationID`, `.sortDate`, `.admitInstant`, `.dischargeInstant`, `.formattedDate`, `.isLargeGroup` | Grouping for the list page | — | — | Internal / duplicate of `GetDetails`. |
| `newResults{}`, `newProviderPhotoInfo{}`, `newComments{}`, `organizationLoadMoreInfo{}`, `areResultsFullyLoaded`, `isGroupingFullyLoaded`, `groupBy` | List-page copies of the detail data | — | — | Duplicate / asset / internal. |

**On abnormality.** Neither mode derives an abnormal verdict from the reference
range. `value`, `numericValue` and the range pass through, and that judgement is
the client's (the Expo alert code makes it, on its own).

---

### `get_imaging_results`

The same requests as labs, filtered to imaging orders, plus per imaging result
with an FDI context a `POST` to the FdiData endpoint for the SAML URL. The
filter, the narrative lifting and the `image_id` encoding are processor work.
The table lists only what imaging adds to the lab table.

| Field | What it is | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | --- |
| `image_id` | Base64url of `{ fdi, ord }` | ✓ | ✓ | Derived handle: what `download_imaging_study` takes. From the report HTML's `data-fdi-context` or from `fdiLink.redirectUrl`. |
| `index` | Position in the list | ✓ | ✓ | Derived handle: the fallback when a model garbles the opaque token. |
| `hasViewableImages` | `image_id` could be extracted | ✓ | ✓ | Derived. The difference between a report you can read and pictures you can look at, said explicitly. |
| `isImagingByName`, `isImagingByContent` | Why the order was classified as imaging | ✓ | — | Derived. The classifier is a keyword heuristic; this is its audit trail. |
| `results[].imageStudies[].studyDescription`, `.modality`, `.studyDate`, `.numberOfImages` | Series | ✓ | ✓ | What the study contains. |
| `results[].imageStudies[].studyId`, `.viewerUrl`; `results[].scans[].scanId`, `.viewerUrl` | Viewer plumbing | — | — | Portal link / internal. |
| `results[].scans[].scanType`, `.scanDate` | Scan metadata | ✓ | — | Detail. |
| FdiData response (`samlUrl`), `viewerUrl` | Single-use viewer entry, expires in a minute or two | — | — | Acts like a credential and is dead by the time anyone reads it. Raw only. |
| `data-fdi-context`, `data-copy-context` attributes in the report HTML | The fdi/ord pair and Epic's internal order ids | — | — | Encoded into `image_id`; the rest is internal. |

Today's scraper adds `reportText`, `narrative`, `impression`, `resultDate`,
`orderProvider` as top-level copies; those are duplicates of the lab fields and
are not carried over.

---

### `download_imaging_study`

Media, not JSON: the four modes do not apply. Unchanged.

---

### `get_messages`

`POST /api/conversations/GetConversationList`. The scraper returns the body
untouched today.

| Field | What it is | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | --- |
| `legacyXUnreadCount` | Inbox unread count | ✓ | ✓ | The first thing a reader wants from an inbox. |
| `conversations[].hthId` | Conversation id | ✓ | ✓ | Handle: `get_message_thread`, `send_reply` and `delete_message` take it. |
| `conversations[].subject` | Subject | ✓ | ✓ | What. |
| `conversations[].audience[].name` | Who the thread is with | ✓ | ✓ | Who. |
| `conversations[].tags.Unread` | Unread | ✓ | ✓ | Unread threads come first. |
| `conversations[].hasUrgentMsgs` | Urgent | ✓ | ✓ | Urgency changes what a reader does next. |
| `conversations[].hasMoreMessages` | More messages than were inlined | ✓ | ✓ | Says whether `get_message_thread` is worth calling. |
| `conversations[].previewText` | Truncated latest body | ✓ | ✓ | The one-line gist; emitted even when full bodies are inlined (rule 6). |
| `conversations[].hasAttachments`, `.hasTasks`, `.messageType` | Thread flags | ✓ | — | Detail. |
| `conversations[].messages[].wmgId` | Message id | ✓ | — | Identifier; no capability takes it. |
| `conversations[].messages[].deliveryInstantISO` | Sent time | ✓ | ✓ | When. |
| `conversations[].messages[].isUnread` | Unread | ✓ | — | Per-message read state; the thread-level tag is enough for concise. |
| `conversations[].messages[].body` | Body | — | — | Markup stays in `raw` (rule 9); real bodies are plain text, and the derived field is what the other modes read either way. |
| `bodyText` | `body` with any markup stripped | ✓ | ✓ | Derived from `body`. The message, readable. |
| `senderName` | `wprKey` → `viewers[].name`; `empKey` → `userOverrideNames[empKey]` else `users[empKey].name`; `displayName` last | ✓ | ✓ | Derived, in the order the portal's own `getAuthorInfo` uses. Without it every message is anonymous. |
| `isFromPatient` | `wprKey` set and `empKey` absent | ✓ | ✓ | Derived. Which side of the conversation each message is on. |
| `conversations[].messages[].author.empKey`, `.wprKey` | Author keys | ✓ | — | The inputs to `senderName`; kept so the resolution is checkable. |
| `conversations[].messages[].author.displayName` | Author display name | — | — | Always empty: `""` on every message of every captured instance; names live in `users` / `viewers`. |
| `conversations[].messages[].attachments[].name`, `.fileExtension` | Attachments | ✓ | — | What was attached; detail. |
| `conversations[].messages[].attachments[].type`, `.dcsId`, `.etxId`, `.legacyUrlForCommunityJump`, `.organizationId` | Attachment plumbing | — | — | Internal / portal link. |
| `conversations[].messages[].tasks[]`, `.suggestedActions[]` | Tasks and actions | ✓ | — | Uncaptured; passed through. |
| `conversations[].userOverrideNames{}` | Per-thread display-name overrides | — | — | Resolved into `senderName`. |
| `conversations[].contexts[]`, `.tags.Messages`, `.legacyMessageDetailsUrl`, `.hasLoadAllUsers`, `.allowBulkActions`, `.userKeys[]`, `.viewerKeys[]`, `.maskedUserNames[]`, `.showOtherViewersOption` | Thread rendering | — | — | UI flag / portal link / internal. |
| `conversations[].organizationId` | Organization | — | — | Always empty: `""` on all four captured instances. |
| `users{}` (`empId`, `name`, `outOfContactEndDate`, `outOfContactContext`, `outOfContactContextString`, `photoUrl`, `providerId`, `organizationId`) | Staff directory | — | — | Resolved into `senderName`; the rest is asset / internal. |
| `viewers{}` (`wprId`, `name`, `isSelf`, `isShown`, `isSelected`, `organizationId`) | Patient-side directory | — | — | Resolved into `senderName` / `isFromPatient`. |
| `localSummary.hasMoreConversations`, `.oldestLoadedInstantISO` | Older threads exist beyond this page | ✓ | — | Says whether the inbox is complete; detail. |
| `localSummary.newestLoadedInstantISO`, `.numberLoaded`, `.oldestSearchedInstantISO`, `.pagingInfo`, `externalSummaries{}` | Paging | — | — | Internal. |

---

### `get_message_thread`

`POST /api/conversations/GetConversationDetails` `{ id }`, then while
`hasMoreMessages`, `POST /api/conversations/GetConversationMessages`
`{ id, startInstantISO }` paging backwards. `raw` is the envelope. Merging the
pages into one ascending list and resolving names become processor work.
Message fields are as in `get_messages`; the table lists what details adds.

| Field | What it is | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | --- |
| `hthId`, `subject`, `audience[].name` | Thread identity | ✓ | ✓ | Handle and the who / what. |
| `totalMessages`, `numUnread` | Counts | ✓ | ✓ | Cheap and useful. |
| `messages[]` (merged, ascending) with `senderName`, `isFromPatient`, `bodyText` | The thread | ✓ | ✓ | A thread has no shorter faithful form; concise is every message. |
| `truncated` | Paging stopped at the cap with `hasMoreMessages` still true | ✓ | ✓ | Derived. A partial thread must never be presented as the whole exchange. |
| `replyFlags.canReply`, `.cannotReplyReason` | Whether `send_reply` will work | ✓ | — | Tells a consumer whether a follow-up write is possible; detail. |
| `hasPreviouslyViewed`, `hasAttachments`, `hasUrgentMsgs`, `hasTasks`, `messageType`, `previewText` | Thread flags | ✓ | — | Detail. |
| `lastViewedByStaffMsgId` / `firstUnreadMsgId`, `lastViewedByStaffInstantISO` | Which message staff last saw | — | — | Not a shape all instances share: three captured instances send the first pair, one sends the other. |
| `replyUrl` | Portal reply link | — | — | Portal link. |
| `users{}`, `viewers{}`, `userOverrideNames{}` | Name directories | — | — | Resolved into `senderName`. |
| `contexts[]`, `tags`, `legacyMessageDetailsUrl`, `hasLoadAllUsers`, `allowBulkActions`, `userKeys[]`, `viewerKeys[]`, `maskedUserNames[]`, `showOtherViewersOption`, `organizationId` | As in `get_messages` | — | — | UI flag / internal / always empty. |

Today's `ThreadMessage` renames `wmgId` → `messageId`, `deliveryInstantISO` →
`sentDate`, `body` → `messageBody`; rule 2 keeps MyChart's names.

---

### `get_message_recipients`

`POST /api/medicaladvicerequests/GetMedicalAdviceRequestRecipients`, a bare
array on captured instances (the scraper also tolerates six wrapper keys).

| Field | What it is | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | --- |
| `displayName` | Name | ✓ | ✓ | What `send_message` resolves by. |
| `specialty` | Specialty | ✓ | ✓ | Tells a reader which recipient is the right one. |
| `pcpTypeDisplayName` | "Primary Care Provider" etc. | ✓ | ✓ | Same. |
| `recipientType` | Provider vs department pool | ✓ | — | Detail. |
| `oocContext` | Out-of-contact; messages will not be read promptly | ✓ | — | Worth knowing before sending; detail. |
| `userId`, `departmentId`, `poolId`, `providerId` | Ids `send_message` posts | ✓ | — | Plumbing the capability resolves by name (#380); standard keeps them for library callers that post directly. |
| `photoUrl` | Photo | — | — | Asset. |
| `organizationId` | Organization | — | — | Always empty on capture. |

---

### `get_message_topics`

`POST /api/medicaladvicerequests/GetSubtopics`.

| Field | What it is | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | --- |
| `topicList[].displayName`, `.value` | Topic label and code | ✓ | ✓ | The whole payload; `value` is what `send_message` posts. |
| `organizationId` | Organization | — | — | Always empty on capture. |

---

### `get_billing`

`GET /Billing/Summary` (HTML; one `.ba_card` per guarantor account), then per
account `GET /Billing/Details/GetVisits`, `GET /Billing/Details/GetStatementList`,
`GET /Billing/Details/LoadPaymentList` and `GET /Billing/Details` (HTML, for the
`EncID` PDF token). `raw` is the envelope. Card parsing and the per-account join
become processor work.

Account (from the summary HTML and the join):

| Field | What it is | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | --- |
| `guarantorNumber`, `patientName` | From the card header | ✓ | ✓ | Derived from the summary HTML. Which account and whose. |
| `amountDueNumber` | Card balance, parsed | ✓ | ✓ | Derived. What is owed. |
| `id`, `context`, `encBillingId` | Account keys the detail calls take | — | — | Internal; visible in `raw` as request bodies. |
| `totalDue` | Sum across accounts | ✓ | ✓ | Derived. The one number most readers want. |

`GetVisits` (`Data.*`):

| Field | What it is | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | --- |
| `UnifiedVisitList[]`, `VisitList[]`, `InformationalVisitList[]`, `NoBalanceVisitList[]`, `BadDebtVisitList[]`, `PaymentPlanVisitList[]`, `AdvanceBillVisitList[]`, `ContestedVisitList[]`, `AdjustmentVisitList[]` | The charge lists; overlapping across releases | merged into one `visits[]`, de-duplicated on (`HospitalAccountId`, `StartDate`, `Description`, `SelfAmountDueRaw`) | same | Derived merge (#380). Reading one list loses charges on whichever release does not populate it; reading all double-counts. |
| `category` | Which list the row came from | ✓ | ✓ | Derived. "Bad debt" and "payment plan" change what a charge means. |
| `NotPaymentPlanVisitList[]`, `VisitAutoPayVisitList[]` | Filtered views of rows already in the others | — | — | Duplicate. |
| `*VisitListAmount`, `PaymentPlanVisitListAutoPayAmount`, `PaymentPlanVisitListScheduledDate`, `EstimatedPaymentPlanBalance`, `PaymentPlanVisitListPostResolutionAmount` | Per-list totals | ✓ | — | Totals as MyChart computed them; detail. |
| `CanMakePayment`, `HasUnconvertedPBVisits`, `HasVisits` | Account state | ✓ | — | Whether online payment is possible; detail. |
| `PartialPaymentPlanAlert.Code`, `.Banner.HeaderText`, `.Banner.DetailText` | Payment-plan warning | ✓ | — | A warning is information; detail. |
| `PartialPaymentPlanAlert.Banner.*` other fields | Button and icon config | — | — | UI flag. |
| `UndistributedPayments[]` | Payments not yet applied | ✓ | — | Uncaptured; passed through. |
| `SharedAgencyInformation.Name`, `.PhoneNumber` | Collections agency | ✓ | — | A patient in collections wants to know; detail. |
| `Success`, `ShowingAll`, `CanEditPaymentPlan`, `URLMakePayment`, `URLEditPaymentPlan`, `Filters`, `BillingSystem`, `billType`, `IsStatement`, `StatementDisplayDate`, `ShouldShowADACopyright` | Page config | — | — | UI flag / portal link / internal. |

Per charge (each visit row):

| Field | What it is | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | --- |
| `StartDateDisplay`, `DateRangeDisplay` | Service date(s) | ✓ | ✓ | When. |
| `Description` | What was billed | ✓ | ✓ | What. |
| `Patient`, `Provider` | Who | ✓ | ✓ | Who, on both sides. |
| `HospitalAccountDisplay`, `HospitalAccountId` | Account | ✓ | — | Identifier; detail. |
| `PrimaryPayer` | Insurance | ✓ | ✓ | Who was billed first. |
| `ChargeAmount` | Total charges | ✓ | ✓ | The bill. |
| `InsurancePaymentAmount`, `InsuranceAmountDue` | Insurance side | ✓ | ✓ | What insurance paid and still owes. |
| `InsuranceEstimatedPaymentAmount`, `InsuranceAmountDueRaw` | Estimate and numeric form | ✓ | — | Detail. |
| `SelfPaymentAmount`, `SelfAmountDue` | Patient side | ✓ | ✓ | What the patient paid and owes. |
| `SelfAmountDueRaw` | Numeric form | ✓ | — | For consumers that sum. |
| `SelfAdjustmentAmount`, `SelfDiscountAmount`, `SelfBadDebtAmount`, `SelfBadDebtAmountRaw`, `SelfPaymentPlanAmountDue`, `SelfPaymentPlanAmountDueRaw`, `NotOnPlanAmount`, `NotOnPlanAmountRaw`, `ContestedChargeAmount`, `ContestedPaymentAmount`, `SurchargeAmount`, `TaxOrSurcharge` | Adjustments and plan amounts | ✓ | — | Detail. |
| `IsPatientNotResponsible`, `PatientNotResponsibleYet`, `IsOnPaymentPlan`, `IsNotOnPaymentPlan`, `IsBadDebtHAR` / `IsBadDebtVisit`, `IsContestedHAR`, `IsClosedHospitalAccount`, `AdjustmentsOnly` | Charge state | ✓ | — | Detail. |
| `PatFriendlyAccountStatusAccessibleText` | Status as text | ✓ | — | The readable form of the status; detail. |
| `PatFriendlyAccountStatus`, `VisitBadDebtScenario`, `VisitStatusesEqualToClosed[]`, `IsUnpayableHAR` | Status codes | — | — | Duplicate of the text / internal. |
| `EstimateInfo.EstimateAmount`, `.EstimateStatus` | Cost estimate | ✓ | — | Detail. |
| `EstimateInfo.EstimateID`, `IsPaymentPlanEstimate`, `IsResolvedEstimatedPPAccount`, `EmptyVisitEstimateID` | Estimate plumbing | — | — | Internal. |
| `AgencyInformation.Name`, `.PhoneNumber`, `AgencyInformationDescription` | Collections agency | ✓ | — | Detail. |
| `ProcedureList[].Description`, `.Amount`, `.SelfAmountDue`, `.InsuranceAmountDue`, `.IsContested`, `.HasAmountDue` | Line items | ✓ | — | The itemization; detail. |
| `ProcedureList[].PaymentList[]`, `.SelfBadDebtAmount`, `.HasBadDebtAmount`, `.AdjustmentsOnly`, `.BillingSystem` | Line-item detail | ✓ | — | Detail. |
| `ProcedureGroupList[].Description`, `.Amount`, `.ProcedureList[]`, `.PaymentList[]`, `.EstPlanPaymentList[]` | Grouped line items and their payments | ✓ | — | Detail. |
| `ProcedureGroupList[].VisitIndex`, `.VisitGroupType`, `.HasEstPlanList`, `.IsPaymentsOnly`, `.HasPaymentsTowardsEstimates`, `.HasContestedProcedures`, `.IsExpanded`, `.AlwaysShowDetails` | Grouping plumbing | — | — | Internal / UI flag. |
| `CoverageInfoList[].CoverageName`, `.Billed`, `.Covered`, `.PendingInsurance`, `.RemainingResponsibility`, `.Copay`, `.Deductible`, `.Coinsurance`, `.NotCovered`, `.Benefits[].Name`, `.Amount` | Explanation of benefits | ✓ | — | Detail. |
| `CoverageInfoList[].ShowInsuranceCoveredHelp`, `.ShowInsurancePendingHelp`, `ShowCoverageHelp`, `ShowInsurancePendingHelp`, `ShowInsuranceCoveredHelp` | Help-icon flags | — | — | UI flag. |
| `VisitAutoPay`, `ShowVisitAutoPay`, `CanAddToPaymentPlan` | Auto-pay enrollment UI | — | — | UI flag. |
| `GroupType`, `Index`, `BillingSystem`, `BillingSystemDisplay`, `IsSBO`, `ProviderId`, `IsLTCSeries`, `LevelOfDetailLoaded`, `IsExpanded`, `BlockExpanding`, `AlwaysShowDetails`, `SuppressDayFromDate`, `SuppressProcedureAmount`, `AdjustmentSuppressionSetting`, `StartDateAccessibleText` | Rendering and ids | — | — | UI flag / internal. |
| `StartDate`, `StartDayOfMonth`, `StartMonth`, `StartYear` | Epic day count and split renderings of `StartDateDisplay` | — | — | Internal / duplicate. |

Statements (`DataStatement.StatementList[]` and `DataDetailBill.StatementList[]`,
merged with `IsDetailBill` telling them apart):

| Field | What it is | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | --- |
| `FormattedDateDisplay` | Statement date | ✓ | ✓ | When. |
| `DateDisplay` | Same, shorter | ✓ | — | Duplicate rendering; kept in standard because the PDF filename uses it. |
| `Description` | What it is | ✓ | ✓ | What. |
| `SubText` | Extra line | ✓ | — | Detail. |
| `StatementAmountDisplay` | Amount | ✓ | ✓ | How much. |
| `IsRead` | Read state | ✓ | ✓ | Unread statements first. |
| `IsDetailBill`, `IsPaperless`, `ServiceDateStart`, `ServiceDateEnd` | Statement detail | ✓ | — | Detail. |
| `RecordID` | Statement id; the PDF download key | ✓ | — | Handle for a future statement-PDF capability. |
| `ImagePath`, `Token`, `EncBillingSystem`, `PrintID`, `BillingSystem`, `Format`, `IsEB`, `URLStatement` | PDF-download plumbing | — | — | Internal; the other keys the download needs, available in `raw`. |
| `Show`, `Date`, `DayOfMonth`, `Month`, `Year`, `LinkText`, `LinkDescription` | Rendering and split dates | — | — | UI flag / duplicate. |
| list-level `HasUnread`, `HasRead`, `ShowAll`, `PaperlessStatus`, `ShowPaperlessSignup`, `ShowPaperlessCancel`, `URLPaperlessBilling`, `IsPaperlessAllowedForSA`, `IsDetailBillModel`, `noStatementsString`, `allReadString`, `loadMoreString` | Page config | — | — | UI flag / portal link. |

Payments (`LoadPaymentList` `Data.PaymentList[]`):

| Field | What it is | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | --- |
| `FormattedDateDisplay` | Payment date | ✓ | ✓ | When. |
| `Description` | What was paid and how | ✓ | ✓ | What. |
| `SubText` | Extra line (card, confirmation) | ✓ | — | Detail. |
| `PaymentAmountDisplay` | Amount | ✓ | ✓ | How much. |
| `UndistributedAmountDisplay` | Unapplied remainder | ✓ | — | Detail. |
| `Receipt.DisplayNumber`, `.SerialNumber` | Receipt number | ✓ | — | Detail. |
| `Receipt.FileName`, `.BlobToken`, `.IsValidReceipt`, `.PrintStatus`, `.ReceiptStatus`, `.ViewReceiptOptions.*`, `.MobileDocViewerSupported`, `.Url` | Receipt download plumbing | — | — | Internal / UI flag. |
| `CoverageInfo` | Coverage | — | — | Always empty: null on capture. |
| `ID`, `ElementID`, `Index`, `DayOfMonth`, `Month`, `Year`, `HtmlSubText`, `IsBadDebtAdj`, `IsWriteOffAdj`, `IsSurchargeAdj`, `CanEdit`, `EditPaymentOptions`, `CanCancel`, `CancelCommandOptions`, `ConsentDocument`, `ViewConsentOptions`, `IsCardExpiringSoon`, `HasCardExpired` | Ids, split dates, edit/cancel UI | — | — | Internal / duplicate / UI flag. |

---

### `get_insurance`

`GET /Insurance`, HTML. Parsing moves out of the scraper.

| Field | What it is | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | --- |
| `planName` | Plan | ✓ | ✓ | Derived from the page. The coverage. |
| `subscriberName` | Subscriber | ✓ | — | Derived. Detail. |
| `memberId`, `groupNumber` | Member and group | ✓ | ✓ | Derived. What a clinic asks for. |
| `details[]` | Other lines on the card | ✓ | — | Derived. Whatever else the page printed. |
| `hasCoverages` | Page did not say "no coverages" | ✓ | ✓ | Derived. "No coverage on file" is an answer. |
| `pageText` | Block-separated text of the page | ✓ | — | Derived. The parser's selectors are unverified against a real instance (see below); this is the audit trail. |

The selectors the scraper uses (`.coverage-card`, `.plan-name`, `.member-id`)
match the fake's page and nothing captured from a real instance; the captured
account had no coverage on file and every `/api/insurance-hub/*` endpoint
answered 500 (`api-surface-gaps.md` §2d). `pageText` is what keeps the
placeholder honest until a coverage page is captured.

---

### `get_care_team`

`POST /Clinical/CareTeam/Load` and `POST /Clinical/CareTeam/LoadExternal`
(PascalCase legacy envelope, 23 provider fields, byte-identical on four live
instances across both releases).

| Field | What it is | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | --- |
| `ProvidersList[].Name` | Name | ✓ | ✓ | Who. |
| `ProvidersList[].Relation` | Role on the team; `null` or `""` for no stated role | ✓ | ✓ | The PCP designation lives here, and an entry can be the insurance payer rather than a clinician; a reader needs it to interpret the row. |
| `ProvidersList[].Specialty` | Specialty | ✓ | ✓ | What kind of provider. |
| `ProvidersList[].IsExternal` | Outside provider | ✓ | ✓ | An outside provider is reached differently. |
| `fromExternalList` | Came from `LoadExternal` | ✓ | ✓ | Derived. Distinct from `IsExternal`, which the internal list can also set. |
| `externalProvidersUnavailable` | `LoadExternal` failed | ✓ | ✓ | Derived. A partial care team presented as the whole one is the failure the scraper exists to prevent. |
| `ProvidersList[].ID` | Opaque provider id | ✓ | — | Identifier; detail. |
| `ProvidersList[].NationalProviderID` | NPI | ✓ | — | Real-world identifier; detail. |
| `ProvidersList[].DepartmentID` | Department id | ✓ | — | Identifier; detail. |
| `ProvidersList[].CanMessage` | Reachable through `send_message` | ✓ | — | Tells a consumer whether a follow-up write is possible; detail. |
| `DescriptiveTitle` | Page title ("Your Care Team") | ✓ | — | Harmless; detail. |
| `ProvidersList[].AboutMeBlurb` | Provider bio | — | — | Always empty: `[]` on every provider of four instances. |
| `ProvidersList[].Organizations`, `.SchedulableVisitTypes` | Organizations and visit types | — | — | Always empty: `null` on all four. |
| `ProvidersList[].CareTeamStatus` | Status code | — | — | Always empty: `0` on all four. |
| `ProvidersList[].Photo`, `.WebPageUrl`, `.InfoBlurbUrl`, `.CommCenterMessageUrl` | Photo and links | — | — | Asset / portal link. |
| `ProvidersList[].CanViewProviderDetails`, `.CanDirectSchedule`, `.CanRequestAppointment`, `.CanRequestCustomAppt`, `.HasNoProviderRecord`, `.IsNewSchedulingEnabled`, `.CanHideProvider` | Scheduling UI | — | — | UI flag. |
| `TabColorClass`, `IsCustomApptReqEnabled`, `CustomRequestAppointmentLink` | Page config | — | — | Asset / UI flag / portal link. |

---

### `get_referrals`

`POST /api/referrals/listReferrals`.

| Field | What it is | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | --- |
| `referralList[].statusString` | Status as text | ✓ | ✓ | Whether the referral is approved, pending, expired. |
| `referralList[].status` | Status code | ✓ | — | Duplicate in code form; kept for consumers that switch on it. |
| `referralList[].referredToProviderName`, `.referredToFacility` | Where to | ✓ | ✓ | Who the patient is being sent to. |
| `referralList[].referredByProviderName` | Who referred | ✓ | ✓ | Who sent them. |
| `referralList[].start`, `.end` | Validity window | ✓ | ✓ | An expired referral is useless; the window matters. |
| `referralList[].creationDate` | Created | ✓ | — | Detail. |
| `referralList[].internalId`, `.externalId` | Ids | ✓ | — | Identifiers; detail. |
| `referralList[].dte` | Epic day count of `creationDate` | — | — | Internal. |
| `canSeeAuthorizations` | Instance shows authorization detail | ✓ | — | Explains why authorization fields may be missing; detail. |
| `canSendMessage`, `shouldRedirect` | Page config | — | — | UI flag. |

---

### `get_upcoming_orders`

`POST /api/upcoming-orders/GetUpcomingOrders`: three maps keyed by id.

| Field | What it is | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | --- |
| `orderList{}` values | One order each, whole | ✓ | ✓ | Uncaptured (maps empty on every capture); passed through. Concise narrows to name, type, status, date and provider once captured. |
| `providerName` | Resolved from `providerList` when the order carries a provider key | ✓ | ✓ | Derived. Who ordered it. |
| `orderGroupList{}` | Grouping | ✓ | — | Uncaptured; passed through. |
| `providerList{}` | Provider directory | — | — | Resolved into `providerName`. |
| `upcomingOrdersSettings.canHideOrUnhideReminders` | Page config | — | — | UI flag. |

---

### `get_questionnaires` and `get_care_journeys`

`POST /Questionnaire/GetQuestionnaireList` and
`POST /api/care-journeys/GetCareJourneys`. Neither has a captured skeleton; the
field names the scrapers read are fixture-only.

| Field | What it is | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | --- |
| `questionnaires[]` | One questionnaire each, whole | ✓ | ✓ | Uncaptured; passed through. Narrows to name, status and due date once captured. |
| `careJourneys[]` | One journey each, whole | ✓ | ✓ | Uncaptured; passed through. Narrows to name, status and provider once captured. |

`api-surface-gaps.md` lists a React-era `/api/questionnaire/GetQuestionnaireList`
that returns real data on the probed account, so the endpoint itself may change.

---

### `get_activity_feed`

`POST /api/item-feed/FetchItemFeed` `{ maxItems: 50, offset: 0 }`. Items sit
under `singleItemFeedViewModels[].feedItems` (some releases also `todayItems` /
`forYouItems`), one view model per patient record the account can see.

| Field | What it is | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | --- |
| `singleItemFeedViewModels[].displayName` | Which patient the items are about | ✓ | ✓ | On a proxy account the feed mixes patients; each item must say whose it is. |
| `singleItemFeedViewModels[].eptId` | Patient record id | ✓ | — | Identifier; detail. |
| `…feedItems[].identifier` | Item id | ✓ | — | Identifier; detail. |
| `…feedItems[].displayText` | The item's text | ✓ | ✓ | The item. |
| `…feedItems[].titleDisplayText`, `.announcementBody` | Title and body for announcement items | ✓ | — | Present on some item types; detail. |
| `…feedItems[].type`, `.defaultType`, `.topicId` | Item kind | ✓ | — | Classification; detail. |
| `…feedItems[].priority`, `.priorityInstant`, `.groupCount` | Ordering; `priorityInstant` is epoch millis | ✓ | — | The raw ordering inputs. |
| `priorityInstantISO` | `priorityInstant` as ISO-8601 | ✓ | ✓ | Derived. When. |
| `…feedItems[].primaryAction.uriDisplayText` | Label of the item's action ("View results") | ✓ | — | Says what kind of thing the item points at without the link; detail. |
| `…feedItems[].phone`, `.email`, `.smsActive`, `.allTextEnabled`, `.allEmailEnabled`, `.canEditInfo` | A contact-info nag item's own fields | — | — | UI flag. |
| `…feedItems[].primaryAction.uri`, `.uriId`, `.uriType`, `.uriIconKey`, `.uriAccessibleText`, `.isHidden`; same on `secondaryAction`, `tertiaryAction`, `defaultAction` | Portal links | — | — | Portal link. |
| `…feedItems[].iconKey`, `.subiconKey`, `.shouldShowWatermark`, `.isH2GEnabled` | Icons | — | — | Asset / DXR plumbing. |
| `singleItemFeedViewModels[].photoUrl`, `.tabColor`, `.zeroStateIconKey`, `.isSelected` | Tab rendering | — | — | Asset / UI flag. |
| `linkedAccountsViewModel.*` | Linked-organization widget | — | — | Duplicate of `get_linked_accounts`. |

---

### `get_education_materials`

`POST /api/education/GetPatEducationTitles`, a bare array.

| Field | What it is | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | --- |
| `displayName` | Title | ✓ | ✓ | What was assigned. |
| `assignedDate` | When assigned | ✓ | ✓ | When. |
| `elementId`, `eduKey` | Ids | ✓ | — | Identifiers; detail. |
| `numTopics` | Topics in the material | ✓ | — | Detail. |
| `wasAssignedThisVisit` | Assigned at the current visit | ✓ | — | Detail. |
| `numPagesReviewed`, `numPagesUnderstood`, `numPagesQuestions` | Patient's progress | ✓ | — | Real, if minor; detail. |
| `numPoints`, `isAdmitted`, `encounterContext`, `canUserTrackUnderstanding`, `thumbnailImage`, `thumbnailImageBlobToken`, `thumbnailIcon`, `tvSupported`, `removeThumbnails` | Gamification, thumbnails, bedside-TV | — | — | Asset / UI flag / session context. |

---

### `get_ehi_export`

`POST /api/release-of-information/GetEHIETemplates`.

| Field | What it is | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | --- |
| `ehieTemplates[].name`, `.description` | Export template | ✓ | ✓ | What can be exported. |
| `ehieTemplates[].id` | Template id | ✓ | — | Identifier a future export capability would take. |
| `existingEHIE`, `isNoBuildEhie` | Whether an export exists / is offered | ✓ | — | Detail. |
| `ehieTemplates[].hideAdditionalComments` | Form config | — | — | UI flag. |
| `__Status`, `__UpdateableSettings.*` | Throttle and queue settings of the server itself | — | — | Internal. |

---

### `get_linked_accounts`

`POST /Community/Shared/LoadCommunityLinks`. `OrgList` is a map of ~50-field
organization records.

| Field | What it is | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | --- |
| `OrgList[*].OrganizationName` | Linked organization | ✓ | ✓ | Which other health systems the record reaches. |
| `OrgList[*].LastEncounterDetail.Patient`, `.Physician`, `.Department`, `.Date`, `.Time` | Last visit there | ✓ | ✓ | The one clinical fact in the payload. |
| `OrgList[*].OrganizationId` | Id | ✓ | — | Identifier; detail. |
| `OrgList[*].LinkType`, `.UserActionStatus`, `.UserMyChartStatus` | Link state | ✓ | — | Detail. |
| `OrgList[*].DisplayAddress[]` | Address | ✓ | — | Detail. |
| `OrgList[*].LastAccessTokenDateTime` | When the link last refreshed | ✓ | — | Says how stale the linked data is; detail. |
| `OrgList[*].IsDisabled`, `.IsInvalidCeLink`, `.InvalidLinkReason`, `.InvalidLinkRetryDate`, `.ErrorMessage`, `.NeedCeAuth`, `.LinkErrorCode` | Link problems | ✓ | — | A broken link explains missing data; detail. |
| `OrgList[*].LogoUrl`, `.TermsAndConditionsUrl`, `.ProxyTermsAndConditionsUrl` | Assets and links | — | — | Asset / portal link. |
| `OrgList[*].ShowSignup`, `.ShowSignUpUnavailableMessage`, `.Accept`, `.CanScheduleCrossOrgVideoVisit`, `.DisplayAutoRefresh`, `.ShowUnavailableMsg`, `.CanJump`, `.HiddenFromMyChart`, `.CanCreateCELink`, `.InProgressOrgNotSeen`, `.ShouldDisableLink`, `.DisclaimerOverride`, `.IsPPOC`, `.IdentityRelationship`, `.H2GRemoteAuthLinkWorkflow` | Link UI | — | — | UI flag. |
| `OrgList[*].CELocationId`, `.RelatedOrganizations`, `.HasChildOrgs`, `.IsSSO`, `.IncompleteH2GSetup`, `.CurrentlyLoadingDxrData`, `.ErrorLoadingDxrData`, `.HasValidRefreshToken`, `.IsWithinThrottlingTime`, `.ShouldRemindForUpdate`, `.ShowInRefreshBanner`, `.IsMyChartCentral`, `.PayerOrgDetails`, `.NewSubjectList` | DXR plumbing | — | — | DXR plumbing. |
| `HomeOrgName`, `CEOptOut`, `ForwardedLinks[]` | Account-level link state | ✓ | — | Detail. |
| `Spotlight[]`, `AutoQueryList{}`, `InProgressList{}`, `IsConsentNeeded`, `HideAskLater`, `HasSearchableOrgs`, `H2GHasBeenViewed`, `IsNPP`, `FhirUpdateFrequency`, `FhirSessionThrottlingTime`, `IsSelfVerified` | Suggestions and page config | — | — | UI flag / DXR plumbing. |

---

### `get_emergency_contacts`

`POST /api/personalInformation/GetRelationships`.

| Field | What it is | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | --- |
| `contacts[].id` | Contact id | ✓ | ✓ | Handle: `update_emergency_contact` and `remove_emergency_contact` take it. |
| `contacts[].formattedName` | Name | ✓ | ✓ | Who. |
| `contacts[].relationToPatient.name` | Relationship | ✓ | ✓ | How they are related. |
| `contacts[].contactInformation.phoneNumbers[].phoneNumber`, `.type` | Phones | ✓ | ✓ (first) | How to reach them; concise keeps one number. |
| `contacts[].contactInformation.emailAddress` | Email | ✓ | — | Detail. |
| `contacts[].contactInformation.address.formattedValues[]` | Address lines | ✓ | — | Detail. |
| `contacts[].isPrimaryContact` | Primary | ✓ | — | Detail. |
| `contacts[].isEmergencyContact` | Present on one captured instance only; absent means true | ✓ | — | Real where it exists; detail. |
| `hideEmergencyContacts` | Instance hides the section | ✓ | — | Explains an empty list; detail. |
| `contacts[].relationToPatient.labelText`, `.isInactive` | Code-table detail | — | — | Duplicate / internal. |
| `contacts[].contactInformation.address.*` other than `formattedValues` | Discrete address parts and code tables | — | — | Duplicate. |
| `contacts[].isLinkedToOtherPatient`, `.isHCA`, `.isAddressLinkedToPatient`, `.savedSuccessfully`, `.isPending`, `.isVRK` | Edit-form state | — | — | UI flag. |
| `relationToPatientChoices[]`, `requiredFields[]`, `vrkFields[]`, `hasEndOfLifePageMnemonic`, `isViewOnly` | Form config | — | — | UI flag. |

---

### `list_proxy_targets`

`GET /Home` (proxy selector markup or script block) and, where the instance
serves it, `GET /ProxySwitch` (`ProxySubjectList[]`). This capability already
returns a designed shape; the change is that `raw` becomes available.

| Field | What it is | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | --- |
| `ProxySubjectList[].Id` | Record id | ✓ | ✓ | Handle: `switch_proxy_target` takes it. |
| `ProxySubjectList[].DisplayName` | Patient | ✓ | ✓ | Who. |
| `ProxySubjectList[].IsSelf`, `.IsSelected` | The account holder; the active record | ✓ | ✓ | Which record every data tool is currently reading. |
| `selectionKnown` | Whether `IsSelected` came from the portal or is a default | ✓ | ✓ | Derived. `IsSelected: false` means nothing unless this is true. |
| `active_patient`, `profile_name`, `count` | As the capability returns today | ✓ | ✓ | Derived. Independent evidence of which record is active. |
| `ProxySubjectList[].Ids[]`, `.DisplayText`, `.ServiceAreaAbbreviationList` | Aliases | ✓ | — | Detail. |
| `ProxySubjectList[].PhotoUrl`, `.PhotoMagicId`, `.BlobToken`, `.TabColor`, `.LinkUrl`, `.Loading`, `.Disabled` | Selector rendering | — | — | Asset / portal link / UI flag. |
| `ShowFriendsAndFamily`, `ShouldTryAgain`, `ShowPersonalInformation`, `ShowAccountSettings`, `AvailableLanguageList[]`, `CurrentlySelectedTabColor` | Page config | — | — | UI flag. |

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
  visits `concise` column above. `full_detail: true` becomes `mode: 'raw'`.
- **#380** adds `condense.ts` in the MCPB with seven hand-written condensers
  and a generic prune, plus a `get_raw_data` tool. The seven condensers are the
  `concise` columns for visits, labs, imaging, billing, messages and
  recipients. Their `text()`/`rec()` readers carry over; `row()` and the
  generic `prune` do not, because both decide by value (a key is dropped when
  empty), which rule 6 forbids. `get_raw_data` is `mode: 'raw'` on the
  ordinary tool.

None of the three should merge as written; each should be re-cut against the
processor layer once it exists.

## 6. Decisions

Settled in review; recorded here so the processors do not reopen them.

1. **One parameter, four values.** `mode: raw | standard | concise | json`.
   `standard` and `concise` are markdown, `json` is JSON, `raw` is whatever
   MyChart sent. There is no concise-as-JSON; a consumer that needs the concise
   projection as data reads `json` and takes the concise columns.
2. **One generic markdown renderer** for both markdown modes. Objects render
   as a heading and a definition list, flat arrays of objects as tables, nested
   ones as sub-sections. No per-capability templates.
3. **`medicationKey` stays open.** The medications processor surfaces `id` and
   nothing else as a handle until a capture of the real refill request shows
   what `request_refill` should post.
4. **Never invent a shape** (rule 10). What that means for the capabilities
   whose element shape has not been captured is in §7.
5. **Message bodies are plain text.** `bodyText` is the field the non-raw
   modes carry; `body` is in `raw` only, like every other markup-bearing field
   (rule 9).

## 7. Capabilities whose shape is unverified

Rule 10 says a processor projects only captured field names. These are the
capabilities where the scraper today projects names that no capture has shown.
None of them is known to be broken against a real instance; what is known is
that nobody has seen them return data on one. The recommendation is the same for
all: **keep the scraper and the endpoint call, have the processor pass the
element through whole, and label the capability "shape unverified" until a
capture exists.** Removing a scraper would remove functionality that may well
work; removing the fixture's invented element fields would leave the fake
serving empty lists and take away the only test coverage those scrapers have,
so that should wait for a capture to replace them with.

| Capability | What the captures show | What the scraper projects today | Status |
| --- | --- | --- | --- |
| `get_goals` (patient goals) | `loadPatientGoals` skeleton has elements with `goalId`, `goalType`, `readings[]`, `complianceType`, `lastUpdatedDate`, `creationDate` | `name`, `description`, `status`, `startDate`, `targetDate` | **Projection is wrong against real data.** The captured element has none of the five names; against a real instance with patient goals the scraper returns five empty strings per goal. The only case in this table with evidence of breakage. |
| `get_goals` (care-team goals) | `careTeamGoals: []` on every capture | Same five names | Unverified. |
| `get_upcoming_orders` | `orderList`, `orderGroupList`, `providerList` all `{}` on every capture (scraper comment) | `orderName`, `orderType`, `status`, `orderedDate`, `orderedByProvider`, `facilityName` | Unverified. The envelope is captured; the element is not. |
| `get_allergies` | `dataList: []` on the captured account | `name`, `id`, `formattedDateNoted`, `type`, `reaction`, `severity`, with two nesting guesses | Unverified. |
| `get_documents` | No skeleton; endpoint never captured | `id`, `title`, `documentType`, `date`, `providerName`, `organizationName` | Unverified, envelope included. |
| `get_questionnaires` | No skeleton. `api-surface-gaps.md` saw the React-era `/api/questionnaire/GetQuestionnaireList` return data; the scraper calls the legacy `/Questionnaire/GetQuestionnaireList` | `id`, `name`, `status`, `dueDate`, `completedDate` | Unverified, and the endpoint may be the wrong one. |
| `get_care_journeys` | No skeleton | `id`, `name`, `description`, `status`, `providerName` | Unverified, envelope included. |
| `get_insurance` | HTML page; the captured account had no coverage on file and every `/api/insurance-hub/*` endpoint answered 500 | `.coverage-card` / `.plan-name` / `.member-id` selectors matching the fake's page | Unverified. `pageText` in the standard object is the audit trail. |
| `get_health_summary` (`conditionList`, `journeyList`, `actionPlans`) | `[]` on every capture | Not projected today | Passed through whole. |

By contrast, `get_activity_feed`, `get_education_materials`, `get_ehi_export`
and `get_emergency_contacts` were in this state once, were captured, and were
fixed (the scraper comments record the invented key each one used to read).
`realBehavior.integration.test.ts` now pins their real envelopes. The path for
the rows above is the same: capture, replace the fixture's guesses with the
real element, narrow the processor.
