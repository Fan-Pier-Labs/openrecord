# `medications` — what each mode carries

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
