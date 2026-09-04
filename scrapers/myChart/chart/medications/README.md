# `medications`

The medication list — current prescriptions with directions, prescriber, refill state and
pharmacy — plus a refill request that ships but has never been verified against a real
MyChart. See the warning below before using it.

| | |
| --- | --- |
| **Capabilities** | `get_medications` (read) · `request_refill` (write — see the warning below) |
| **Source** | [`medications.ts`](medications.ts) · [`medications.processor.ts`](medications.processor.ts) · [`medicationRefill.ts`](medicationRefill.ts) |
| **Activity** | Legacy jQuery `/Clinical/Medications` |

## Endpoints

| Request | Body | Purpose |
| --- | --- | --- |
| `GET /Clinical/Medications` | — | antiforgery token |
| `POST /api/medications/LoadMedicationsPage` | `{}` | every prescription |
| `POST /api/medications/RequestRefill` | `{ medicationKey }` | request a refill — **see below** |

## Notes and research

- **The response is enormous and mostly UI.** Roughly 150 fields per prescription live
  under `communityMembers[].prescriptionList.prescriptions[]`, of which about a dozen are
  the medication. The mode table below is the map of which is which; most of the rest is
  card-rendering state (`showRefillButton`, `showPayButton`, `highlightMedIsHidden`, …).
- **Prescriptions are grouped by organization** on a Happy Together account. The processor
  flattens them into one list with `organizationName` lifted onto each row, and keeps the
  per-organization list-level fields in a `prescriptionLists[]` of their own so nothing is
  lost in the flattening.
- `dateToDisplay` is meaningless without `dateDisplayKey`: MyChart chooses which date to
  show ("Started", "Last filled") per prescription, and the key is what it means.
- `isPatientReported` is emitted even when false. A patient-reported medication was never
  prescribed here, and a reader has to be able to tell.
- One captured field is an **Epic serializer leak**:
  `varianceReason.epic.Core.Data.ICommentable.CommentClientEditable`, alongside a duplicate
  of `varianceComment`. Both are dropped.

### `request_refill` — do not trust this

**`medicationKey` is not a MyChart field.** The captured `LoadMedicationsPage` response
names the prescription `id`; `medicationKey` exists only in fake-mychart's fixture, and the
name appears to have been invented alongside that fixture and then read back out of it. No
capture, bundle read or live request has ever shown MyChart accepting it.

The fake answers `{success: true}` to *any* body, so the scraper passes its unit and
integration tests while quite possibly sending something real MyChart ignores. **A refill
that silently never reaches the pharmacy is a patient who stops taking a medication
believing it is on the way.**

[#410](https://github.com/Fan-Pier-Labs/openrecord/pull/410) proposes withdrawing the
scraper and declaring the capability `notImplemented` until a real refill has been watched
landing on an account whose prescriptions are safe to touch. It is **open, not merged**, so
the endpoint above is still what ships. Verifying it properly means establishing four
things: the path from the shipped bundle, the field names, what a refusal looks like, and
one observed refill.

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

## `get_medications`

`POST /api/medications/LoadMedicationsPage`. ~150 fields per prescription
under `communityMembers[].prescriptionList.prescriptions[]`; the scraper keeps 12.

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `id` | MyChart's prescription id | — | ✓ | ✓ | Handle: the id a refill request will need. See the `medicationKey` note. |
| `name` | Order name (drug, strength, form) | — | ✓ | ✓ | The medication. |
| `patientFriendlyName.text`, `.caption`, `.captionType` | Plain-language name | — | ✓ | ✓ (`text`) | The name a patient recognizes; the caption explains the friendly name and is detail. |
| `sig` | Directions | — | ✓ | ✓ | How to take it. |
| `sigTranslationFromOrder` | Plain-language directions | — | ✓ | — | Same instruction in friendlier words; standard keeps both, concise keeps the canonical one. |
| `dateToDisplay`, `dateDisplayKey` | A date and what it means ("Started", "Last filled") | — | ✓ | ✓ | The date MyChart chose to show, with its meaning; without the key the date is ambiguous. |
| `formattedDateNoted`, `startDate`, `lastUpdateInstant`, `hasFutureStartDate` | Other dates on the order | — | ✓ | — | Chronology detail. |
| `prescriptionNumber` | Rx number | — | ✓ | — | What a pharmacy asks for; not part of a summary. |
| `authorizingProvider.name`, `orderingProvider.name` | Prescribers | — | ✓ | ✓ (authorizing) | Who prescribed. The two usually agree; concise keeps the authorizing one. |
| `authorizingProvider.id`, `.type`, `.hasPhotoOnBlob`; same on `orderingProvider` | Provider ids and photo flag | — | — | — | Internal / asset. |
| `isPatientReported`, `isClinicReported` | Who reported the medication | — | ✓ | ✓ (`isPatientReported`) | A patient-reported entry was never prescribed here; a reader must know. Emitted when false too (rule 6). |
| `isPendingUpdate`, `pendingUpdateType` | Patient-submitted change awaiting review | — | ✓ | — | The list may be about to change; detail. |
| `isAnticoagulationMed`, `isFrequencyPRN`, `criticalMedMessage` | Clinical flags | — | ✓ | — | Clinically meaningful flags; standard-level detail. |
| `classList[]` | Drug class | — | ✓ | — | Real pharmacology; detail. |
| `varianceComment`, `previousTakingDiffSig`, `previousTakingDiffSigInstant`, `previousTakingDiffSigCSN` | How the patient reported taking it differently | — | ✓ | — | Adherence information; detail. |
| `varianceReason.comment`, `.epic.Core.Data.ICommentable.CommentClientEditable` | Same comment plus a serializer artifact | — | — | — | Duplicate of `varianceComment`; the second key is an Epic serializer leak. |
| `refillDetails.isRefillable`, `.refillsRemaining`, `.hasRefillsRemaining` | Refill state | — | ✓ | ✓ | Whether a refill can be requested is the most common question about a medication. |
| `refillDetails.refillStatus`, `.refillExpirationDate`, `.refillWarningCode`, `.scheduledFillDate`, `.externalFillRequestDate`, `.nextDispenseDate` | Refill detail | — | ✓ | — | Detail behind the refill state. |
| `refillDetails.writtenDispenseQuantity`, `.writtenDispenseUnit`, `.writtenDispenseAmount`, `.daySupply` | Quantity per fill | — | ✓ | — | Detail. |
| `refillDetails.lastDispense.dispenseQuantity`, `.dispenseUnit`, `.dispenseAmount`, `.dispenseDate`, `.isRxReady`, `.dispenseType` | Last fill | — | ✓ | — | Detail. |
| `refillDetails.lastDispense.costDetails.formattedCopay`, `.copay`, `.isCopayPending`; `refillDetails.costDetails.*` (same) | Copay | — | ✓ | — | Money the patient owes; detail. |
| `*.costDetails.paymentCards[]`, `.hasPaymentCard`, `.isBilledToAccount` | Payment-method state | — | — | — | UI flag. |
| `refillDetails.lastDispense.amountDue`, `.workRequestFee`, `.workRequestFeeDue`, `.isPaymentValidForDeliveryMethod` | Delivery payment state | — | — | — | UI flag for the pay button. |
| `refillDetails.lastDispense.delivery.formattedShipDate`, `.formattedAddress[]`, `.shipmentTrackingInfo[]` | Mail-order delivery | — | ✓ | — | Where and when a shipment went; detail. |
| `refillDetails.owningPharmacy.name`, `.phoneNumber`, `.formattedAddress[]`, `.hours[]`, `.isPreferred` | Pharmacy | — | ✓ | ✓ (`name`) | Where to pick it up; the name alone answers the summary question. |
| `refillDetails.owningPharmacy.id`, `.departmentID`, `.isIntegrated`, `.hasCreditCardPayments`, `.showDrivingDirections`, `.isPatientMessagingEnabled`, `.supportedDeliveryMethods[]` | Pharmacy plumbing and delivery options | — | — | — | Internal / UI flag. |
| `refillDetails.refillButtonHoverCode`, `.refillButtonStatus`, `.refillsRemainingKey`, `.arePharmaciesAvailableForRefill`, `.showLastDispenseQuantity`, `.rxFlags[]`, `.currentFillDat`, `.doesWorkRequestContainHiddenMed` | Refill-button state | — | — | — | UI flag / internal. |
| `organizationName` | `organization.organizationName` lifted onto the row | ✓ | ✓ | — | Derived. Which health system holds the prescription; matters on multi-organization accounts and is emitted on all (rule 6). |
| `organization.*` (on the prescription, the list and the community member) | The organization object, three times | — | — | — | Org blob. |
| `target`, `isSigRTL`, `isTranslationFromOrderRTL`, `providerDisplayKey`, `showProviderInMedsCard`, `drawProviderDetailsLink`, `isSelected`, `showPrescriptionCardBottomDetails`, `showPrescriptionCardBottom`, `showDeleteButton`, `showRefillButton`, `showRefillStatus`, `showWaitingForInsuranceAuth`, `showOrderLevelStatus`, `showBannerMessage`, `showDuplicateWarning`, `showHomeHealthPendingUpdateWarning`, `showSig`, `showPendingUndoDeleteButton`, `showPendingUndoAddButton`, `disableValidation`, `prescriptionListType`, `hasPrescriptionColDetail`, `hasRefillColDetail`, `hasPharmacyColDetail`, `showDrivingDirections`, `showMessagePharmacyAction`, `showCostDetails`, `showPayButton`, `highlightMedIsHidden`, `proxiesWhoCantAccessConfMeds[]`, `showProxiesWhoCantAccessList`, `showOutpatientPauseWarning`, `outpatientPauseSummary`, `outpatientPauseExtraText`, `outpatientPauseDupMismatchType`, `iconPath`, `contentLinkURL`, `isPreviousTakingDiffSigRTL` | Card rendering | — | — | — | UI flag / portal link / asset. |
| `prescriptionLists[]` | One entry per organization, holding the list-level fields below with `organizationName` | ✓ | ✓ | — | Derived grouping: prescriptions are flattened into one list, so the per-organization list fields need a home of their own. |
| `prescriptionList.numRefillsDueSoon` | Count of refills due | — | ✓ | — | A real count; derivable but cheap to keep. |
| `prescriptionList.pickups[]`, `.deliveries[]`, `.inProgressWorkRequests[]` | Pending pharmacy work | — | ✓ | — | Uncaptured; passed through. |
| `prescriptionList.previousTakingValuesDate` | Date of the last "taking differently" review | — | ✓ | — | Chronology detail. |
| `prescriptionList.isPossiblyFiltered`, `.medicationsVerified`, `.showPreviousTakingValues`, `.showNotificationBanners`, `.showFilteredWarning`, `.showRefillButton`, `.showRefillDisclaimer`, `.onHealthSummaryPage`, `.loadingOrgNames`, `.hasOrgsLoading`, `.errorOrgNames`, `.hasOrgsWithErrors`, `.manualOrgNames`, `.hasOrgsManual`, `.showPrescriptionListWithTwoColumns`, `.showFreeTextPrescriptionInput`, `.showPrescriptionList`, `.enableDummyValidationCheckbox`, `.showDxrRefreshBanner`, `.showDxrBannerAction`, `.pretextStringKey`, `.showManagePharmacyLink` | List rendering and DXR state | — | — | — | UI flag / DXR plumbing. |
| `communityMembers[].context`, `.isPossiblyFiltered`, `.medicationsVerified`, `.showPreviousTakingValues`, `.isExternal`, `.showLoadingIndicator`, `.showAddMedicationBox`, `.showCommunityMemberOnInitialLoad`, `.showPersonalNotes`, `.requiresLoading`, `.showPrescriptionListWithTwoColumns`, `.enableSelectionMode`, `.useRxNormForSearch`, `.alwaysShowSearchMore`, `.showRespondByPreferences`, `.showMessageViewerOptions`, `.allowFreeTextPharmacy`, `.allowPickUpDateTimeInput`, `.allowMedsRefill`, `.areMedsPaidByPatient`, `.showEstimatedRxCost` | Per-organization page config | — | — | — | UI flag. |
| `getPatientFirstName` | First name | — | ✓ | — | Real; `get_profile` is the identity capability. |
| `showPatientAdmittedBanner`, `isProxyView`, `enableSelectionMode`, `hostedInIFrame`, `backToContextSet`, `medSettings.*`, `medicationsUrl` | Page config | — | — | — | UI flag / session context / portal link. |

**`medicationKey` is not a MyChart field.** The captured skeleton has `id`;
`medicationKey` exists only in the fake's fixture, and `request_refill` posts it
as `{ medicationKey }` to `/api/medications/RequestRefill`. Either the real
request shape is `{ id }` or it is something not yet captured. Out of scope
here, but the processor surfaces `id` and does not invent `medicationKey`.
