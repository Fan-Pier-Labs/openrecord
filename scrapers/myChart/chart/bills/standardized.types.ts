/**
 * What the `bills` capabilities return: the standard objects the processors
 * build from MyChart's responses. MyChart's own shapes are in
 * `./mychart.types.ts`.
 */

export type BillingVisitCategory =
  | 'BadDebtVisitList'
  | 'PaymentPlanVisitList'
  | 'AdvanceBillVisitList'
  | 'ContestedVisitList'
  | 'AdjustmentVisitList'
  | 'InformationalVisitList'
  | 'NoBalanceVisitList'
  | 'VisitList'
  | 'UnifiedVisitList';

export interface BillingPaymentStandard {
  FormattedDateDisplay: string | null;
  Description: string | null;
  SubText: string | null;
  PaymentAmountDisplay: string | null;
  UndistributedAmountDisplay: string | null;
  Receipt: { DisplayNumber: string | null; SerialNumber: string | null } | null;
}

export interface BillingProcedureStandard {
  /**
   * Derived: `Description` with its markup stripped (rule 9). MyChart wraps
   * the procedure code in the description — `"Office Visit, Established Pat -
   * <span class='subtlecolor'>99213 (CPT®)</span>"` — so the CPT code only
   * reaches a reader as text if the span is converted rather than passed on.
   */
  DescriptionText: string | null;
  Amount: string | null;
  SelfAmountDue: string | null;
  InsuranceAmountDue: string | null;
  IsContested: boolean | null;
  HasAmountDue: boolean | null;
  PaymentList: BillingPaymentStandard[];
  SelfBadDebtAmount: string | null;
  HasBadDebtAmount: boolean | null;
  AdjustmentsOnly: boolean | null;
  BillingSystem: number | null;
}

export interface BillingProcedureGroupStandard {
  Description: string | null;
  Amount: string | null;
  ProcedureList: BillingProcedureStandard[];
  PaymentList: BillingPaymentStandard[];
  EstPlanPaymentList: BillingPaymentStandard[];
}

export interface BillingCoverageInfoStandard {
  CoverageName: string | null;
  Billed: string | null;
  Covered: string | null;
  PendingInsurance: string | null;
  RemainingResponsibility: string | null;
  Copay: string | null;
  Deductible: string | null;
  Coinsurance: string | null;
  NotCovered: string | null;
  Benefits: Array<{ Name: string | null; Amount: string | null }>;
}

export interface BillingVisitStandard {
  /** Derived: which `GetVisits` list the row came from. */
  category: BillingVisitCategory;
  StartDateDisplay: string | null;
  DateRangeDisplay: string | null;
  Description: string | null;
  Patient: string | null;
  Provider: string | null;
  HospitalAccountDisplay: string | null;
  HospitalAccountId: string | null;
  PrimaryPayer: string | null;
  ChargeAmount: string | null;
  InsurancePaymentAmount: string | null;
  InsuranceAmountDue: string | null;
  InsuranceEstimatedPaymentAmount: string | null;
  InsuranceAmountDueRaw: number | null;
  SelfPaymentAmount: string | null;
  SelfAmountDue: string | null;
  SelfAmountDueRaw: number | null;
  SelfAdjustmentAmount: string | null;
  SelfDiscountAmount: string | null;
  SelfBadDebtAmount: string | null;
  SelfBadDebtAmountRaw: number | null;
  SelfPaymentPlanAmountDue: string | null;
  SelfPaymentPlanAmountDueRaw: number | null;
  NotOnPlanAmount: string | null;
  NotOnPlanAmountRaw: number | null;
  ContestedChargeAmount: string | null;
  ContestedPaymentAmount: string | null;
  SurchargeAmount: string | null;
  TaxOrSurcharge: number | null;
  IsPatientNotResponsible: boolean | null;
  PatientNotResponsibleYet: boolean | null;
  IsOnPaymentPlan: boolean | null;
  IsNotOnPaymentPlan: boolean | null;
  /** Release-dependent name for the same flag; whichever the instance sent. */
  IsBadDebtHAR: boolean | null;
  IsBadDebtVisit: boolean | null;
  IsContestedHAR: boolean | null;
  IsClosedHospitalAccount: boolean | null;
  AdjustmentsOnly: boolean | null;
  PatFriendlyAccountStatusAccessibleText: string | null;
  EstimateInfo: { EstimateAmount: string | null; EstimateStatus: number | null } | null;
  AgencyInformation: { Name: string | null; PhoneNumber: string | null };
  AgencyInformationDescription: string | null;
  ProcedureList: BillingProcedureStandard[];
  ProcedureGroupList: BillingProcedureGroupStandard[];
  CoverageInfoList: BillingCoverageInfoStandard[];
}

export interface BillingStatementStandard {
  /**
   * Derived: `DateDisplay`'s `YYYYMMDD` as `YYYY-MM-DD`. On a live instance
   * `FormattedDateDisplay` came back null on every statement while
   * `DateDisplay` was populated, so this is the date a consumer can rely on.
   */
  dateISO: string | null;
  FormattedDateDisplay: string | null;
  DateDisplay: string | null;
  Description: string | null;
  SubText: string | null;
  StatementAmountDisplay: string | null;
  IsRead: boolean | null;
  IsDetailBill: boolean | null;
  IsPaperless: boolean | null;
  ServiceDateStart: string | number | null;
  ServiceDateEnd: string | number | null;
  /** The handle `download_billing_statement` takes. */
  RecordID: string | null;
}

export interface BillingAccountStandard {
  /** Derived from the summary card header. */
  guarantorNumber: string;
  patientName: string;
  /** Derived: the card balance, parsed. */
  amountDueNumber: number | null;
  /**
   * Derived: the pay-online path from the summary page's inline config,
   * relative to the instance root, when its `ID` is this account's. Kept
   * because it is how a patient pays from the app (rule 4); `GetVisits`'
   * own `URLMakePayment` is null on every live instance checked.
   */
  paymentUrl: string | null;
  /** Derived: the nine `GetVisits` lists merged and de-duplicated. */
  visits: BillingVisitStandard[];
  VisitListAmount: string | null;
  BadDebtVisitListAmount: string | null;
  PaymentPlanVisitListAmount: string | null;
  NotPaymentPlanVisitListAmount: string | null;
  AdvanceBillVisitListAmount: string | null;
  AdjustmentVisitListAmount: string | null;
  VisitAutoPayVisitListAmount: string | null;
  ContestedVisitListAmount: string | null;
  PaymentPlanVisitListAutoPayAmount: string | null;
  PaymentPlanVisitListScheduledDate: string | number | null;
  EstimatedPaymentPlanBalance: string | number | null;
  PaymentPlanVisitListPostResolutionAmount: string | null;
  CanMakePayment: boolean | null;
  /**
   * A portal link by class, kept on purpose (rule 4): it is how a patient pays
   * a bill from the app, not a button MyChart's page renders. Relative to the
   * instance; the app resolves it against the hostname.
   */
  URLMakePayment: string | null;
  HasUnconvertedPBVisits: boolean | null;
  HasVisits: boolean | null;
  PartialPaymentPlanAlert: { Code: number | null; Banner: { HeaderText: string | null; DetailText: string | null } };
  /** Uncaptured; passed through whole. */
  UndistributedPayments: unknown[];
  SharedAgencyInformation: { Name: string | null; PhoneNumber: string | null };
  /** `DataStatement` and `DataDetailBill` statements merged; `IsDetailBill` tells them apart. */
  statements: BillingStatementStandard[];
  payments: BillingPaymentStandard[];
  /**
   * Derived: the best-effort endpoints (`GetStatementList`, `LoadPaymentList`)
   * that did not answer for this account. A name here means the matching list
   * is unknown, not empty — the scraper tolerates their failure so a
   * statement-list outage does not cost the visit history.
   */
  unavailable: string[];
}

export interface BillingStandard {
  /** Derived: the card balances summed. */
  totalDue: number;
  accounts: BillingAccountStandard[];
}
