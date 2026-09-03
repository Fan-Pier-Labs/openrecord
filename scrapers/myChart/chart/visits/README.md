# `visits` — what each mode carries

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

## `get_upcoming_visits` and `get_past_visits`

`POST /Visits/VisitsList/LoadUpcoming` (three buckets: `InProgressVisits`,
`NextNDaysVisits`, `LaterVisitsList`) and `POST /Visits/VisitsList/LoadPast`,
paged with `SerializedIndex` (10 visits per organization per page). `raw` for
past visits is the envelope of every page fetched; the per-organization merge
becomes processor work.

One table for the visit object, shared by both capabilities, then one for each
container.

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| **Handles** | | | |  | |
| `Csn` | Encounter id | — | ✓ | ✓ | Handle: what `get_visit_notes` and `get_visit_avs` take. |
| `CsnForECheckIn` | Same id as used by e-check-in | — | ✓ | — | The fallback when `Csn` is blank on some rows (#377); standard keeps it so the fallback is visible. |
| `Id`, `ReferenceID` | Appointment ids | — | ✓ | — | Identifiers; no capability takes them. |
| **When** | | | |  | |
| `Instant` | `/Date(ms)/`, absolute | — | ✓ | — | The machine-readable time, in Epic's own encoding. |
| `instantISO` | `Instant` as ISO-8601 UTC | ✓ | ✓ | — | Derived from `Instant`. For consumers that sort or compute; concise shows the clinic's rendering instead (rule 8). |
| `PrimaryDate` | `MM/DD/YYYY hh:mm:ss AM`, clinic-local, no zone | — | ✓ | ✓ | The clinic's own rendering of when the visit is; the safest date to show a reader. |
| `TimeZone` | The department's zone name | — | ✓ | — | What makes `PrimaryDate` interpretable; detail. |
| `IsTimeToBeDetermined`, `IsHideVisitTime` | Whether the clock time is meaningful | — | ✓ | ✓ | The renderer prints "time TBD" when either is true; both fields are emitted regardless (rule 6). |
| `DurationInMinutes`, `HasDuration` | Scheduled length | — | ✓ | — | Detail. |
| `ArrivalTime`, `EarlyArrivalReason` | Asked-to-arrive time and why | — | ✓ | — | Instructions to the patient; detail. |
| `CanShowArrivalTime` | Whether the page shows it | — | — | — | UI flag. |
| `AdmissionDateRange.Start`, `.End`, `DischargeDate` | Inpatient stay | — | ✓ | ✓ | A hospital stay's dates are the visit for inpatient rows. |
| `RescheduledDatString` | Date the visit was moved from | — | ✓ | — | History of the appointment; detail. |
| `RescheduledDat` | Same, as an Epic day count | — | — | — | Internal. |
| `Date`, `Time`, `ShortDate`, `Month`, `DateOfMonth`, `Year`, `HighlightDate`, `IsAM` | Locale renderings of the same instant | — | — | — | Duplicate of `PrimaryDate` / `Instant`. |
| `Dat` | Epic 1840-epoch day count | — | — | — | Internal. |
| `IsClientTime`, `ClientTimeZoneMarker` | About the caller's zone | — | — | — | Session context. |
| **What** | | | |  | |
| `VisitTypeName` | Visit type | — | ✓ | ✓ | What kind of visit. |
| `IsUsingFallbackVisitTypeName` | The type is a generic fallback label | — | ✓ | — | Says how much to trust `VisitTypeName`; detail. |
| `EncounterType`, `EncounterIsSurgery`, `EncounterIsEDVisit`, `IsPreadmission`, `IsHovPreadmission`, `IsResidentialMed` | Encounter class | — | ✓ | — | Classification detail. |
| `ChiefComplaint` | Reason for visit | — | ✓ | ✓ | Why the patient went. |
| `Diagnoses[].Code`, `.Description` | Diagnoses; rendered "Description (Code)" | — | ✓ | ✓ | What was found. |
| `SurgicalProcedures[].Name` | Procedures | — | ✓ | ✓ | What was done. |
| `SurgicalProcedures[].Instructions`, `.Providers[].Name` | Procedure instructions and surgeons | — | ✓ | — | Detail. |
| `HasProcedures`, `NumberOfProcedures` | Count of the above | — | — | — | Duplicate. |
| `Cases[].CaseId`, `.Description` | Surgical cases | — | ✓ | — | Detail. |
| `ComponentVisits[].Csn`, `.VisitTypeName`, `.PrimaryDate`, `HasComponentVisits` | Sub-visits of a combined appointment | — | ✓ | — | Each carries its own CSN, so its notes are reachable; detail. |
| `PatientNextStepInstructions` | Instructions to the patient | — | ✓ | — | Detail. |
| `EpisodeDetails.GestationalAge` | Pregnancy episode | — | ✓ | — | Clinical fact; detail. |
| `SurgeryTimeOfDay` | Surgery slot code | — | ✓ | — | Detail. |
| **Who** | | | |  | |
| `PrimaryProviderName` | Attending, as a string | — | ✓ | ✓ | Who the patient saw. |
| `PrimaryProvider.Name`, `Providers[].Name`, `OtherProviders[].Name` | Providers (object forms) | — | ✓ | — | The full list, for multi-provider visits; concise shows the primary. |
| `Providers[].Department.Name`, `.Address[]`, `.PhoneNumber` | Each provider's clinic | — | ✓ | — | Detail. |
| `Providers[].EncryptedId`, `.Type`, `.PhotoUrl`, `.PhotoLink`, `.WebPageUrl`, `.HasPhotoOnBlob`, `.PhotoBlobToken`, `.IsPerson`, `.PhotoClass`; same on `PrimaryProvider`, `OtherProviders[]`, `SurgicalProcedures[].Providers[]` | Provider ids, photos, links | — | — | — | Asset / portal link / internal. |
| `Providers[].Department.*` other than the three above; same on `PrimaryProvider.Department` | Department rendering fields | — | — | — | Duplicate of `PrimaryDepartment` / UI flag. |
| `IsSingleProvider`, `NumberOfOthers` | Counts of the above | — | — | — | Duplicate. |
| `GuestPatientFirstName` | Guest on a video visit | — | ✓ | — | Detail. |
| **Where** | | | |  | |
| `PrimaryDepartment.Name` | Clinic | — | ✓ | ✓ | Where. |
| `PrimaryDepartment.Address[]`, `.PhoneNumber`, `.Specialty.Title`, `.Instructions[].Text`, `.ArrivalLocation`, `.TimeZone` | Clinic detail and arrival instructions | — | ✓ | — | Detail. |
| `PrimaryDepartment.Id`, `.HasAddress`, `.ShouldShowInstructions`, `.CanShowDrivingDirections`, `.IsPreadmissionLocation`, `.Specialty.Value`/`.TitleUtf8`/`.Abbreviation`, `.Instructions[].Type` | Department plumbing | — | — | — | Internal / UI flag. |
| `PreadmissionLocation.Name`, `.Address[]`, `.PhoneNumber`, `.Instructions[].Text`, `.ArrivalLocation` | Pre-admission site | — | ✓ | — | Detail. |
| `PreadmissionLocation.*` other fields | As for `PrimaryDepartment` | — | — | — | Internal / UI flag. |
| `organizationName` | `Organization.OrganizationName` lifted onto the row | ✓ | ✓ | ✓ | Derived. Which health system; on a multi-organization account a visit without it is ambiguous, and it is emitted on every account (rule 6). |
| `Organization.*` | The organization object | — | — | — | Org blob. |
| `OrganizationLinks[]`, `PrimaryOrganizationLink`, `EncodedOrgID`, `IsLocal`, `IsNonEpic`, `OwnedBy` | Which organization owns the row and links to it | — | — | — | DXR plumbing. |
| **Status** | | | |  | |
| `IsCanceled`, `IsNoShow`, `LeftWithoutSeen`, `InProgress`, `IsArrived`, `IsConfirmed`, `IsCancelRequestSent` | The status booleans | — | ✓ | — | The raw inputs to `status`; standard keeps them so the derivation is checkable. |
| `status` | One word: `canceled` › `no_show` › `left_without_being_seen` › `in_progress` › `arrived` › `completed` (any `LoadPast` row) › `cancel_requested` › `confirmed` › `scheduled` | ✓ | ✓ | ✓ | Derived from the seven booleans in PR #380's order. A canceled visit reported as "completed" is a lie about care the patient never received, so the order is most-specific first. |
| `ConfirmationStatus`, `ArrivalStatus` | Status codes | — | ✓ | — | Detail. |
| `IsPastVisit` | Rendering hint | — | — | — | Always wrong: false on rows `LoadPast` itself returned (#377, #380). The capability that was called already says which side of now the visit is on. |
| `PastVisitBucket` | Which list section the row renders in | — | — | — | UI flag. |
| **Mode** | | | |  | |
| `Telemedicine.IsTelemedicine`, `.TelemedicineMode`, `TelehealthMode`, `EVisit.IsEVisit`, `IsInHomeVisit` | Video / e-visit / home visit | — | ✓ | — | How the visit happened; detail. |
| `Telemedicine.TelemedicineUrl`, `EVisit.EVisitUrl`, `CanShowTelemedicine`, `IsUnverifiedOnDemandVideoVisit`, `EncryptedLvvId` | Join links and their state | — | — | — | Portal link / UI flag / internal. |
| **Money** | | | |  | |
| `Copay.Amount`, `Copay.IsPaid`, `HasPaymentInfo`, `IsFullyPaid` | Copay | — | ✓ | — | Money owed; detail. |
| `IsCopayEnabled`, `CanShowPayments`, `HasPaymentFeature` | Payment UI | — | — | — | UI flag. |
| **Records available** | | | |  | |
| `IsClinicalNoteAvailable` | Whether `get_visit_notes` has anything for this CSN | — | ✓ | ✓ | Tells a reader whether a follow-up call is worth making. |
| `IsNotesOnly`, `IsClinicalInformationAvailable` | Related availability flags | — | ✓ | — | Detail. |
| `IsVisitSummaryEnabled` | Whether `get_visit_avs` has anything | — | ✓ | ✓ | Same reasoning as the note flag. |
| `HasDownloadSummaryLink` | A summary download exists | — | ✓ | — | Detail. |
| `IsNotViewed` | Patient has not opened the visit record | — | ✓ | — | Read state is a weak but real fact. |
| `IsViewStatusVisible` | Whether the page shows that | — | — | — | UI flag. |
| `IsVisitAmbulatory` | Ambulatory vs inpatient | — | ✓ | — | Classification detail. |
| **Everything else** | | | |  | |
| `HasQuestionnaireFeature`, `HasNewPvdFeature`, `FeedbackQnrIDs[]`, `IsAmbPastVisitDetailsEnabled`, `IsAllIPSecurityPointsDisabled`, `IsIPPastVisitDetailsEnabled`, `IsPastVisitDetailsEnabled`, `ShowVisitDetails`, `UnverifiedProxyJumpUrl`, `HasTransmitSummaryLink`, `CanRedirectToApptDetails`, `IsApptDetailsEnabled`, `IsRequestCancelEnabled`, `IsDirectCancelEnabled`, `IsRescheduleEnabled`, `IsDownloadSummaryEnabled`, `IsTransmitCEEnabled`, `IsTransmitDirectEnabled`, `IsDischargeInstrEnabled`, `IsPatHandoutsEnabled`, `IsIPReviewEnabled`, `IsDischargeSummaryEnabled`, `IsProviderLinkEnabled`, `IsPreadmissionEnabled`, `IsEcheckInCompleted`, `CanRequestCancel`, `CanReschedule`, `IsDetailsEnabled`, `CanShowAddToCalendar`, `IsDrivingDirectionsEnabled`, `CanDirectlyCancel`, `HasSentUpgradeRequest`, `CanSendUpgradeRequest`, `ShowPFIOLink`, `IsCEOptedIn`, `UserMyChartStatus` | Which buttons the portal renders | — | — | — | UI flag. |
| `ECheckIn.*`, `CanShowECheckIn`, `ShouldDeprecateECheckInBrand`, `IsMultiPhaseOn`, `CanShowECheckInComplete`, `IsECheckInComplete`, `HasChildrenNeedingECheckIn`, `NextIncompleteVisitECheckInCsn`, `IsEcheckInEnabled`, `IsECheckInIncomplete`, `CanECheckIn`, `ShouldShowECheckInInGuideBanner`, `CompleteECheckInCount`, `TotalECheckInCount` | E-check-in workflow | — | — | — | UI flag. |
| `IsUserInitiatedArrivalAllowed`, `SelfArrivalMechanism`, `SelfArrivalBannerViewModel`, `GeolocationArrival`, `ArrivalAdditionalActions[]` | Self-arrival workflow | — | — | — | UI flag. |
| `IsProxyRequestMinorFormOn`, `ProxyRequestMinorForm` | Proxy consent form | — | — | — | UI flag. |

Past-visits container:

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `List[<orgId>].List[]` | The visits, per organization | ✓ | flattened to one list | same | Derived flattening; the organization is on each row as `organizationName`, so the nesting carries nothing. |
| `hasOlderVisits` | Any organization's `HasMoreData` | ✓ | ✓ | ✓ | Derived. Says whether MyChart holds visits older than the pages fetched, so "that's all of it" is never inferred from a list that stopped. |
| `count` | Number of visits | ✓ | ✓ | ✓ | Derived. Cheap and useful. |
| `List[<orgId>].ListSize`, `.CanSearch`, `.SkippedSomeResults`, `.SerializedIndex`, `.ViewbagProperties`, `.Organization` | Paging and rendering | — | — | — | Internal / org blob. |
| `ViewBagProperties.LoadingOrgNames`, `.ErrorOrgNames`, `.ManualOrgNames` | Care Everywhere load state | — | — | — | DXR plumbing. |
| `SerializedIndex`, `CanSearch`, `CanAllSearch`, `CanSort`, `AutoRenderThisSet`, `SkippedSomeResults`, `Organizations{}` | Paging and rendering | — | — | — | Internal / org blob. |

Upcoming-visits container:

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `InProgressVisits[]`, `NextNDaysVisits[]`, `LaterVisitsList[]` | The three buckets | ✓ | flattened, each visit gaining `bucket` | same | Derived flattening; one list sorted by time reads better than three, and the bucket survives as a field. |
| `bucket` | `in_progress` / `soon` / `later` | ✓ | ✓ | ✓ | Derived. In-progress, next few days and later mean different things (#380). |
| `count` | Number of visits | ✓ | ✓ | ✓ | Derived. |
| `HighlightDays[]`, `HasPVG` | Calendar rendering | — | — | — | UI flag. |
