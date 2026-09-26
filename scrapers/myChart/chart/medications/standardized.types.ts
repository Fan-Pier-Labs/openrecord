/**
 * What the `medications` capabilities return: the standard objects the processors
 * build from MyChart's responses. MyChart's own shapes are in
 * `./mychart.types.ts`.
 */

export interface CostDetailsStandard {
  formattedCopay: string | null;
  copay: number | null;
  isCopayPending: boolean | null;
}

export interface LastDispenseStandard {
  dispenseQuantity: string | null;
  dispenseUnit: string | null;
  dispenseAmount: string | null;
  dispenseDate: string | null;
  isRxReady: boolean | null;
  dispenseType: number | null;
  costDetails: CostDetailsStandard;
  delivery: {
    formattedShipDate: string | null;
    formattedAddress: string[];
    shipmentTrackingInfo: unknown[];
  };
}

export interface OwningPharmacyStandard {
  name: string | null;
  phoneNumber: string | null;
  formattedAddress: string[];
  hours: unknown[];
  isPreferred: boolean | null;
}

export interface RefillDetailsStandard {
  isRefillable: boolean | null;
  refillsRemaining: string | null;
  hasRefillsRemaining: boolean | null;
  refillStatus: number | null;
  refillExpirationDate: string | null;
  refillWarningCode: string | null;
  scheduledFillDate: string | null;
  externalFillRequestDate: string | null;
  nextDispenseDate: string | null;
  writtenDispenseQuantity: string | null;
  writtenDispenseUnit: string | null;
  writtenDispenseAmount: string | null;
  daySupply: string | null;
  lastDispense: LastDispenseStandard;
  costDetails: CostDetailsStandard;
  owningPharmacy: OwningPharmacyStandard;
}

export interface PrescriptionStandard {
  id: string | null;
  name: string | null;
  patientFriendlyName: { text: string | null; caption: string | null; captionType: string | null };
  sig: string | null;
  sigTranslationFromOrder: string | null;
  dateToDisplay: string | null;
  dateDisplayKey: string | null;
  formattedDateNoted: string | null;
  startDate: string | null;
  lastUpdateInstant: string | null;
  hasFutureStartDate: boolean | null;
  prescriptionNumber: string | null;
  authorizingProvider: { name: string | null };
  orderingProvider: { name: string | null };
  isPatientReported: boolean | null;
  isClinicReported: boolean | null;
  isPendingUpdate: boolean | null;
  pendingUpdateType: number | null;
  isAnticoagulationMed: boolean | null;
  isFrequencyPRN: boolean | null;
  criticalMedMessage: string | null;
  classList: string[];
  varianceComment: string | null;
  previousTakingDiffSig: string | null;
  previousTakingDiffSigInstant: string | null;
  previousTakingDiffSigCSN: string | null;
  refillDetails: RefillDetailsStandard | null;
  /** Derived: `organization.organizationName` of the enclosing community member. */
  organizationName: string | null;
}

export interface PrescriptionListStandard {
  organizationName: string | null;
  numRefillsDueSoon: number | null;
  previousTakingValuesDate: string | null;
  pickups: unknown[];
  deliveries: unknown[];
  inProgressWorkRequests: unknown[];
}

export interface MedicationsStandard {
  getPatientFirstName: string | null;
  prescriptions: PrescriptionStandard[];
  prescriptionLists: PrescriptionListStandard[];
}
