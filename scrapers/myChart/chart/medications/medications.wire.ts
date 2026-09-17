/**
 * Raw MyChart responses for the `medications` scraper.
 *
 * Observed by the capture harness behind `fake-mychart/src/data/realShapes.ts`
 * on three real instances — what we have seen, never a contract Epic owes us.
 *
 * `unknown` means the field was `null` on every instance captured: we saw no
 * value, so we know no type. `unknown[]` means the array was always empty, so
 * we have never seen an element. Neither is `null` or `never[]`, which would
 * read as settled.
 *
 * Read a payload with `rec<T>()` from `processors/read.ts` — it checks the
 * field names and leaves every value to `text()` / `num()` / `list()`. Never
 * `as`: that checks the same names and then lies about the values.
 *
 * Endpoints: /api/medications/loadmedicationspage
 *
 * Keep in step with the captures; `scrapers/myChart/__tests__/wireShapes.unit.test.ts`
 * fails the build if these miss a field or invent one.
 */

import type { Organization } from '../../wire/shared';

/** Repeated shape. Appears in: chart/medications. */
export type CostDetail = {
  copay: number;
  formattedCopay: string;
  isCopayPending: boolean;
  isBilledToAccount: boolean;
  paymentCards: unknown[];
  hasPaymentCard: boolean;
};

/** `/api/medications/loadmedicationspage` */
export type LoadMedicationsPage = {
  communityMembers: Array<{
    context: number;
    isPossiblyFiltered: boolean;
    medicationsVerified: boolean;
    showPreviousTakingValues: boolean;
    isExternal: boolean;
    organization: Organization;
    prescriptionList: {
      prescriptions: Array<{
        target: string;
        isSigRTL: boolean;
        isTranslationFromOrderRTL: boolean;
        dateDisplayKey: string;
        dateToDisplay: string;
        prescriptionNumber: string;
        hasFutureStartDate: boolean;
        authorizingProvider: {
          type: number;
          hasPhotoOnBlob: boolean;
          id: string;
          name: string;
        };
        orderingProvider: {
          type: number;
          hasPhotoOnBlob: boolean;
          id: string;
          name: string;
        };
        providerDisplayKey: string;
        showProviderInMedsCard: boolean;
        drawProviderDetailsLink: boolean;
        isSelected: boolean;
        classList: string[];
        isPatientReported: boolean;
        showPrescriptionCardBottomDetails: boolean;
        showPrescriptionCardBottom: boolean;
        showDeleteButton: boolean;
        showRefillButton: boolean;
        showRefillStatus: boolean;
        showWaitingForInsuranceAuth: boolean;
        showOrderLevelStatus: boolean;
        showBannerMessage: boolean;
        showDuplicateWarning: boolean;
        showHomeHealthPendingUpdateWarning: boolean;
        isAnticoagulationMed: boolean;
        isFrequencyPRN: boolean;
        criticalMedMessage: string;
        showSig: boolean;
        showPendingUndoDeleteButton: boolean;
        showPendingUndoAddButton: boolean;
        disableValidation: boolean;
        prescriptionListType: number;
        organization: Organization;
        hasPrescriptionColDetail: boolean;
        hasRefillColDetail: boolean;
        hasPharmacyColDetail: boolean;
        showDrivingDirections: boolean;
        showMessagePharmacyAction: boolean;
        showCostDetails: boolean;
        showPayButton: boolean;
        highlightMedIsHidden: boolean;
        proxiesWhoCantAccessConfMeds: unknown[];
        showProxiesWhoCantAccessList: boolean;
        showOutpatientPauseWarning: boolean;
        outpatientPauseSummary: string;
        outpatientPauseExtraText: string;
        outpatientPauseDupMismatchType: number;
        refillDetails: {
          writtenDispenseQuantity: string;
          writtenDispenseUnit: string;
          writtenDispenseAmount: string;
          daySupply: string;
          nextDispenseDate: string;
          owningPharmacy: {
            id: string;
            name: string;
            isIntegrated: boolean;
            phoneNumber: string;
            formattedAddress: string[];
            hours: unknown[];
            supportedDeliveryMethods: Array<{
              name: string;
              type: number;
              isDeliveryAddressRequired: boolean;
              behavesLikeType: number;
              paymentMethods: number[];
              deliveryFee: {
                price: number;
                tax: number;
                totalDue: number;
              };
            }>;
            departmentID: string;
            hasCreditCardPayments: boolean;
            showDrivingDirections: boolean;
            isPreferred: boolean;
            isPatientMessagingEnabled: boolean;
          };
          lastDispense: {
            dispenseQuantity: string;
            dispenseUnit: string;
            dispenseAmount: string;
            dispenseDate: string;
            amountDue: number;
            workRequestFee: number;
            workRequestFeeDue: number;
            isPaymentValidForDeliveryMethod: boolean;
            isRxReady: boolean;
            costDetails: CostDetail;
            dispenseType: number;
            delivery: {
              shipmentTrackingInfo: unknown[];
              formattedAddress: unknown[];
              formattedShipDate: string;
            };
          };
          refillButtonHoverCode: string;
          refillButtonStatus: number;
          refillsRemainingKey: string;
          refillExpirationDate: string;
          hasRefillsRemaining: boolean;
          refillsRemaining: string;
          isRefillable: boolean;
          refillWarningCode: string;
          arePharmaciesAvailableForRefill: boolean;
          refillStatus: number;
          scheduledFillDate: string;
          externalFillRequestDate: string;
          showLastDispenseQuantity: boolean;
          rxFlags: unknown[];
          costDetails: CostDetail;
          currentFillDat: string;
          doesWorkRequestContainHiddenMed: boolean;
        };
        formattedDateNoted: string;
        startDate: string;
        sig: string;
        sigTranslationFromOrder: string;
        lastUpdateInstant: string;
        id: string;
        name: string;
        patientFriendlyName: {
          text: string;
          caption: string;
          captionType: string;
        };
        iconPath: string;
        contentLinkURL: string;
        pendingUpdateType: number;
        isPendingUpdate: boolean;
        varianceReason: {
          comment: string;
          "epic.Core.Data.ICommentable.CommentClientEditable": boolean;
        };
        varianceComment: string;
        previousTakingDiffSig: string;
        isPreviousTakingDiffSigRTL: boolean;
        previousTakingDiffSigCSN: string;
        previousTakingDiffSigInstant: string;
        isClinicReported: boolean;
      }>;
      isPossiblyFiltered: boolean;
      medicationsVerified: boolean;
      showPreviousTakingValues: boolean;
      previousTakingValuesDate: string;
      pickups: unknown[];
      deliveries: unknown[];
      inProgressWorkRequests: unknown[];
      showNotificationBanners: boolean;
      organization: Organization;
      showFilteredWarning: boolean;
      showRefillButton: boolean;
      showRefillDisclaimer: boolean;
      onHealthSummaryPage: boolean;
      loadingOrgNames: string;
      hasOrgsLoading: boolean;
      errorOrgNames: string;
      hasOrgsWithErrors: boolean;
      manualOrgNames: string;
      hasOrgsManual: boolean;
      showPrescriptionListWithTwoColumns: boolean;
      showFreeTextPrescriptionInput: boolean;
      showPrescriptionList: boolean;
      enableDummyValidationCheckbox: boolean;
      showDxrRefreshBanner: boolean;
      showDxrBannerAction: boolean;
      pretextStringKey: string;
      showManagePharmacyLink: boolean;
      numRefillsDueSoon: number;
    };
    showLoadingIndicator: boolean;
    showAddMedicationBox: boolean;
    showCommunityMemberOnInitialLoad: boolean;
    showPersonalNotes: boolean;
    requiresLoading: boolean;
    showPrescriptionListWithTwoColumns: boolean;
    enableSelectionMode: boolean;
    useRxNormForSearch: boolean;
    alwaysShowSearchMore: boolean;
    showRespondByPreferences: boolean;
    showMessageViewerOptions: boolean;
    allowFreeTextPharmacy: boolean;
    allowPickUpDateTimeInput: boolean;
    allowMedsRefill: boolean;
    areMedsPaidByPatient: boolean;
    showEstimatedRxCost: boolean;
  }>;
  showPatientAdmittedBanner: boolean;
  isProxyView: boolean;
  getPatientFirstName: string;
  enableSelectionMode: boolean;
  hostedInIFrame: boolean;
  backToContextSet: boolean;
  medSettings: {
    useRxNormForSearch: boolean;
    alwaysShowSearchMore: boolean;
    defaults: unknown[];
    dateOfBirth: string;
    searchMethod: number;
    isMedAdherenceFeatureEnabled: boolean;
    medicationTakingSettings: {
      reasonsForTakingDifferently: unknown[];
      reasonsForNotTaking: unknown[];
    };
  };
  medicationsUrl: string;
};
