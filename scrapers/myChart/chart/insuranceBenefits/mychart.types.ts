/**
 * Raw MyChart responses for the `insuranceBenefits` scraper.
 *
 * Observed by the capture harness behind `fake-mychart/src/data/realShapes.ts`
 * on three real instances — what we have seen, never a contract Epic owes us.
 *
 * `unknown` means the field was `null` on every instance captured: we saw no
 * value, so we know no type. `unknown[]` means the array was always empty, so
 * we have never seen an element. Neither is `null` or `never[]`, which would
 * read as settled.
 *
 * Read a payload with `rec<T>()` from `../../processors/read.ts` — it checks the
 * field names and leaves every value to `text()` / `num()` / `list()`. Never
 * `as`: that checks the same names and then lies about the values.
 *
 * Keep in step with `realShapes.ts` when the captures are refreshed.
 */

/** Repeated shape. Appears in: chart/insuranceBenefits. */
export type AccountBucket = {
  isLimit?: boolean;
  type?: string;
  totalAmount?: string;
  usedAmount?: string;
  remainingAmount?: string;
  usedRatio?: number;
  isTotalZero?: boolean;
  rollPeriodEndDate?: string;
  rollPeriod?: string;
  numberOfPeriods?: number;
  usedOnPrevLevel?: string;
};

/** Repeated shape. Appears in: chart/insuranceBenefits. */
export type Deductible = {
  type?: string;
  network?: string;
  name?: string;
  accountBucket?: {
    isLimit?: boolean;
    type?: string;
    totalAmount?: string;
    usedAmount?: string;
    remainingAmount?: string;
    usedRatio?: number;
    isTotalZero?: boolean;
    rollPeriodEndDate?: string;
    rollPeriod?: string;
    numberOfPeriods?: number;
    usedOnPrevLevel?: string;
  };
  patientBucket?: {
    isLimit?: boolean;
    type?: string;
    totalAmount?: string;
    usedAmount?: string;
    remainingAmount?: string;
    usedRatio?: number;
    isTotalZero?: boolean;
    rollPeriodEndDate?: string;
    rollPeriod?: string;
    numberOfPeriods?: number;
    usedOnPrevLevel?: string;
  };
};

export type GetBenefitsSummary = {
  coverageName?: string;
  payerName?: string;
  payerLogoBlobMagicId?: string;
  lastUpdatedText?: string;
  benefitsPatientId?: string;
  helpText?: string;
  coverageId?: string;
  queryKey?: string;
  noCoverageAvailable?: boolean;
  hasAmbiguousCoverages?: boolean;
  hasRTEUpdateInProgress?: boolean;
  canAccessInsuranceHub?: boolean;
  canAccessInsuranceSummary?: boolean;
  canAccessCustomerService?: boolean;
  canAccessAnyLinks?: boolean;
  insuranceHubUrl?: string;
  payerPhoneNumber?: string;
  showPhoneNumberAsAction?: boolean;
  showPhoneNumberAsTextOnly?: boolean;
  showInsuranceSummaryMessage?: boolean;
  deductible?: Deductible;
  moop?: Deductible;
  insuranceLimit?: Deductible;
};
