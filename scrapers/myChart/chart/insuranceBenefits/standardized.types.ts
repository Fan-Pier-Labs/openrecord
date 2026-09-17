/**
 * What the `insuranceBenefits` capabilities return: the standard objects the processors
 * build from MyChart's responses. MyChart's own shapes are in
 * `./mychart.types.ts`.
 */

/**
 * One side of an accumulator — what the whole family has used, or what this
 * patient has. Amounts are MyChart's own formatted strings and are empty when
 * the payer did not populate that side; the `…Number` fields are the derived
 * parse (rule 3), `null` when there was nothing to parse.
 */
export interface BenefitBucketStandard {
  isLimit: boolean | null;
  /** "Family" or "Individual" on the capture; MyChart's own word. */
  type: string | null;
  totalAmount: string | null;
  usedAmount: string | null;
  remainingAmount: string | null;
  /** Derived: the three amounts above parsed out of MyChart's currency formatting. */
  totalAmountNumber: number | null;
  usedAmountNumber: number | null;
  remainingAmountNumber: number | null;
  /** 0..1. MyChart sends this as a number, not a string. */
  usedRatio: number | null;
  isTotalZero: boolean | null;
  /** When the accumulator resets, as MyChart formatted it. */
  rollPeriodEndDate: string | null;
  /** "ConYear" when the period is set, the string "0" when it is not. */
  rollPeriod: string | null;
  numberOfPeriods: number | null;
  usedOnPrevLevel: string | null;
}

export interface BenefitLimitStandard {
  type: string | null;
  network: string | null;
  name: string | null;
  /** What the whole guarantor account has used against the limit. */
  accountBucket: BenefitBucketStandard;
  /** What this patient has used against it. Kept apart: they are different numbers. */
  patientBucket: BenefitBucketStandard;
}

export interface InsuranceBenefitsAccountStandard {
  /** Derived from the billing summary card the request was addressed from. */
  guarantorNumber: string;
  patientName: string;
  coverageName: string | null;
  payerName: string | null;
  /** MyChart's own "Last updated 1/1/2026" line. Not a parsed instant — no clock (rule 8). */
  lastUpdatedText: string | null;
  helpText: string | null;
  coverageId: string | null;
  benefitsPatientId: string | null;
  queryKey: string | null;
  /** MyChart's own answer to "is there anything to show", not an inference. */
  noCoverageAvailable: boolean | null;
  hasAmbiguousCoverages: boolean | null;
  hasRTEUpdateInProgress: boolean | null;
  canAccessInsuranceHub: boolean | null;
  canAccessInsuranceSummary: boolean | null;
  canAccessCustomerService: boolean | null;
  canAccessAnyLinks: boolean | null;
  insuranceHubUrl: string | null;
  payerPhoneNumber: string | null;
  /** The accumulators. `null` when MyChart sent no object for that one. */
  deductible: BenefitLimitStandard | null;
  moop: BenefitLimitStandard | null;
  insuranceLimit: BenefitLimitStandard | null;
}

export interface InsuranceBenefitsStandard {
  accounts: InsuranceBenefitsAccountStandard[];
  /**
   * Derived: every guarantor account answered, and every one of them said
   * `noCoverageAvailable` — MyChart's own field, not an inference. False
   * whenever an account went unread, because unknown is not none.
   */
  hasNoBenefits: boolean;
  /**
   * Derived: the guarantor numbers whose benefits call did not answer. A name
   * here means that account's accumulators are unknown, not zero.
   */
  unavailable: string[];
}
