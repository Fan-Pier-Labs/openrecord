/**
 * Billing processor. Field decisions: docs/processor-layer-proposal.md, `get_billing`.
 *
 * The scraper records the summary page and then, per guarantor account,
 * `GetVisits`, `GetStatementList`, `LoadPaymentList` and the details page.
 * Those are GETs keyed by `id`/`context` in their query strings, so the join
 * here re-parses the summary cards and matches each recorded request to its
 * account by those parameters. `id`, `context` and `EncID` are internal —
 * visible in `raw` as the request paths and the details page.
 *
 * `GetVisits` spreads charges across nine overlapping lists whose population
 * differs by Epic release; reading one loses charges and reading all
 * double-counts (#380). They are merged most-specific-first and
 * de-duplicated on (`HospitalAccountId`, `StartDate`, `Description`,
 * `SelfAmountDueRaw`), with `category` naming the list a row came from.
 */

import { answered, findRequest, findRequests, type RawRequestRecord, type RawResponse } from '../../core/rawResponse';
import type { Processor } from '../../processors/processor';
import { boolOrNull, list, num, rec, text, textOrNull } from '../../processors/read';
import { parseBillingAccountsHtml, parsePaymentPath } from './summaryHtml';
import type { BillingAccount } from './types';

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

/** Most specific first, so a row in both "bad debt" and "unified" is reported as bad debt. */
export const VISIT_LIST_CATEGORIES: readonly BillingVisitCategory[] = [
  'BadDebtVisitList',
  'PaymentPlanVisitList',
  'AdvanceBillVisitList',
  'ContestedVisitList',
  'AdjustmentVisitList',
  'InformationalVisitList',
  'NoBalanceVisitList',
  'VisitList',
  'UnifiedVisitList',
];

export interface BillingPaymentStandard {
  FormattedDateDisplay: string | null;
  Description: string | null;
  SubText: string | null;
  PaymentAmountDisplay: string | null;
  UndistributedAmountDisplay: string | null;
  Receipt: { DisplayNumber: string | null; SerialNumber: string | null } | null;
}

export interface BillingProcedureStandard {
  Description: string | null;
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
  /** Handle for a future statement-PDF capability. */
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

function scalarOrNull(value: unknown): string | number | null {
  return typeof value === 'string' || typeof value === 'number' ? value : null;
}

export function payment(value: unknown): BillingPaymentStandard {
  const p = rec(value);
  const receipt = p.Receipt === null || p.Receipt === undefined ? null : rec(p.Receipt);
  return {
    FormattedDateDisplay: textOrNull(p.FormattedDateDisplay),
    Description: textOrNull(p.Description),
    SubText: textOrNull(p.SubText),
    PaymentAmountDisplay: textOrNull(p.PaymentAmountDisplay),
    UndistributedAmountDisplay: textOrNull(p.UndistributedAmountDisplay),
    Receipt: receipt === null ? null : { DisplayNumber: textOrNull(receipt.DisplayNumber), SerialNumber: textOrNull(receipt.SerialNumber) },
  };
}

function procedure(value: unknown): BillingProcedureStandard {
  const p = rec(value);
  return {
    Description: textOrNull(p.Description),
    Amount: textOrNull(p.Amount),
    SelfAmountDue: textOrNull(p.SelfAmountDue),
    InsuranceAmountDue: textOrNull(p.InsuranceAmountDue),
    IsContested: boolOrNull(p.IsContested),
    HasAmountDue: boolOrNull(p.HasAmountDue),
    PaymentList: list(p.PaymentList).map(payment),
    SelfBadDebtAmount: textOrNull(p.SelfBadDebtAmount),
    HasBadDebtAmount: boolOrNull(p.HasBadDebtAmount),
    AdjustmentsOnly: boolOrNull(p.AdjustmentsOnly),
    BillingSystem: num(p.BillingSystem),
  };
}

function procedureGroup(value: unknown): BillingProcedureGroupStandard {
  const g = rec(value);
  return {
    Description: textOrNull(g.Description),
    Amount: textOrNull(g.Amount),
    ProcedureList: list(g.ProcedureList).map(procedure),
    PaymentList: list(g.PaymentList).map(payment),
    EstPlanPaymentList: list(g.EstPlanPaymentList).map(payment),
  };
}

function coverageInfo(value: unknown): BillingCoverageInfoStandard {
  const c = rec(value);
  return {
    CoverageName: textOrNull(c.CoverageName),
    Billed: textOrNull(c.Billed),
    Covered: textOrNull(c.Covered),
    PendingInsurance: textOrNull(c.PendingInsurance),
    RemainingResponsibility: textOrNull(c.RemainingResponsibility),
    Copay: textOrNull(c.Copay),
    Deductible: textOrNull(c.Deductible),
    Coinsurance: textOrNull(c.Coinsurance),
    NotCovered: textOrNull(c.NotCovered),
    Benefits: list(c.Benefits).map((b) => ({ Name: textOrNull(rec(b).Name), Amount: textOrNull(rec(b).Amount) })),
  };
}

export function visit(value: unknown, category: BillingVisitCategory): BillingVisitStandard {
  const v = rec(value);
  const estimate = v.EstimateInfo === null || v.EstimateInfo === undefined ? null : rec(v.EstimateInfo);
  const agency = rec(v.AgencyInformation);
  return {
    category,
    StartDateDisplay: textOrNull(v.StartDateDisplay),
    DateRangeDisplay: textOrNull(v.DateRangeDisplay),
    Description: textOrNull(v.Description),
    Patient: textOrNull(v.Patient),
    Provider: textOrNull(v.Provider),
    HospitalAccountDisplay: textOrNull(v.HospitalAccountDisplay),
    HospitalAccountId: textOrNull(v.HospitalAccountId),
    PrimaryPayer: textOrNull(v.PrimaryPayer),
    ChargeAmount: textOrNull(v.ChargeAmount),
    InsurancePaymentAmount: textOrNull(v.InsurancePaymentAmount),
    InsuranceAmountDue: textOrNull(v.InsuranceAmountDue),
    InsuranceEstimatedPaymentAmount: textOrNull(v.InsuranceEstimatedPaymentAmount),
    InsuranceAmountDueRaw: num(v.InsuranceAmountDueRaw),
    SelfPaymentAmount: textOrNull(v.SelfPaymentAmount),
    SelfAmountDue: textOrNull(v.SelfAmountDue),
    SelfAmountDueRaw: num(v.SelfAmountDueRaw),
    SelfAdjustmentAmount: textOrNull(v.SelfAdjustmentAmount),
    SelfDiscountAmount: textOrNull(v.SelfDiscountAmount),
    SelfBadDebtAmount: textOrNull(v.SelfBadDebtAmount),
    SelfBadDebtAmountRaw: num(v.SelfBadDebtAmountRaw),
    SelfPaymentPlanAmountDue: textOrNull(v.SelfPaymentPlanAmountDue),
    SelfPaymentPlanAmountDueRaw: num(v.SelfPaymentPlanAmountDueRaw),
    NotOnPlanAmount: textOrNull(v.NotOnPlanAmount),
    NotOnPlanAmountRaw: num(v.NotOnPlanAmountRaw),
    ContestedChargeAmount: textOrNull(v.ContestedChargeAmount),
    ContestedPaymentAmount: textOrNull(v.ContestedPaymentAmount),
    SurchargeAmount: textOrNull(v.SurchargeAmount),
    TaxOrSurcharge: num(v.TaxOrSurcharge),
    IsPatientNotResponsible: boolOrNull(v.IsPatientNotResponsible),
    PatientNotResponsibleYet: boolOrNull(v.PatientNotResponsibleYet),
    IsOnPaymentPlan: boolOrNull(v.IsOnPaymentPlan),
    IsNotOnPaymentPlan: boolOrNull(v.IsNotOnPaymentPlan),
    IsBadDebtHAR: boolOrNull(v.IsBadDebtHAR),
    IsBadDebtVisit: boolOrNull(v.IsBadDebtVisit),
    IsContestedHAR: boolOrNull(v.IsContestedHAR),
    IsClosedHospitalAccount: boolOrNull(v.IsClosedHospitalAccount),
    AdjustmentsOnly: boolOrNull(v.AdjustmentsOnly),
    PatFriendlyAccountStatusAccessibleText: textOrNull(v.PatFriendlyAccountStatusAccessibleText),
    EstimateInfo: estimate === null ? null : { EstimateAmount: textOrNull(estimate.EstimateAmount), EstimateStatus: num(estimate.EstimateStatus) },
    AgencyInformation: { Name: textOrNull(agency.Name), PhoneNumber: textOrNull(agency.PhoneNumber) },
    AgencyInformationDescription: textOrNull(v.AgencyInformationDescription),
    ProcedureList: list(v.ProcedureList).map(procedure),
    ProcedureGroupList: list(v.ProcedureGroupList).map(procedureGroup),
    CoverageInfoList: list(v.CoverageInfoList).map(coverageInfo),
  };
}

/** The nine `GetVisits` lists as one, most specific category first, de-duplicated. */
export function mergeVisitLists(data: Record<string, unknown>): BillingVisitStandard[] {
  const seen = new Set<string>();
  const visits: BillingVisitStandard[] = [];
  for (const category of VISIT_LIST_CATEGORIES) {
    for (const row of list(data[category])) {
      const r = rec(row);
      const identity = `${text(r.HospitalAccountId)}|${num(r.StartDate) ?? ''}|${text(r.Description)}|${num(r.SelfAmountDueRaw) ?? ''}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      visits.push(visit(r, category));
    }
  }
  return visits;
}

export function statement(value: unknown): BillingStatementStandard {
  const s = rec(value);
  return {
    FormattedDateDisplay: textOrNull(s.FormattedDateDisplay),
    DateDisplay: textOrNull(s.DateDisplay),
    Description: textOrNull(s.Description),
    SubText: textOrNull(s.SubText),
    StatementAmountDisplay: textOrNull(s.StatementAmountDisplay),
    IsRead: boolOrNull(s.IsRead),
    IsDetailBill: boolOrNull(s.IsDetailBill),
    IsPaperless: boolOrNull(s.IsPaperless),
    ServiceDateStart: scalarOrNull(s.ServiceDateStart),
    ServiceDateEnd: scalarOrNull(s.ServiceDateEnd),
    RecordID: textOrNull(s.RecordID),
  };
}

function queryParams(path: string): URLSearchParams {
  const q = path.indexOf('?');
  return new URLSearchParams(q < 0 ? '' : path.slice(q + 1));
}

/** The recorded request for `fragment` whose `id`/`context` query params name this account. */
function accountRequest(raw: RawResponse, source: BillingAccount, fragment: string): RawRequestRecord | undefined {
  return findRequests(raw, fragment).find((r) => {
    const params = queryParams(r.path);
    const id = params.get('id') ?? params.get('ID');
    const context = params.get('context') ?? params.get('Context');
    return id === source.id && context === source.context;
  });
}

function account(raw: RawResponse, source: BillingAccount): BillingAccountStandard {
  const data = rec(rec(accountRequest(raw, source, 'GetVisits')?.body).Data);
  const alert = rec(data.PartialPaymentPlanAlert);
  const banner = rec(alert.Banner);
  const agency = rec(data.SharedAgencyInformation);
  const unavailable: string[] = [];
  function tolerated(fragment: string): Record<string, unknown> {
    const record = accountRequest(raw, source, fragment);
    if (!answered(record)) {
      unavailable.push(fragment);
      return {};
    }
    return rec(record.body);
  }
  const statementsBody = tolerated('GetStatementList');
  const paymentsBody = tolerated('LoadPaymentList');
  return {
    guarantorNumber: source.guarantorNumber,
    patientName: source.patientName,
    amountDueNumber: source.amountDue ?? null,
    paymentUrl: paymentPathFor(raw, source),
    visits: mergeVisitLists(data),
    VisitListAmount: textOrNull(data.VisitListAmount),
    BadDebtVisitListAmount: textOrNull(data.BadDebtVisitListAmount),
    PaymentPlanVisitListAmount: textOrNull(data.PaymentPlanVisitListAmount),
    NotPaymentPlanVisitListAmount: textOrNull(data.NotPaymentPlanVisitListAmount),
    AdvanceBillVisitListAmount: textOrNull(data.AdvanceBillVisitListAmount),
    AdjustmentVisitListAmount: textOrNull(data.AdjustmentVisitListAmount),
    VisitAutoPayVisitListAmount: textOrNull(data.VisitAutoPayVisitListAmount),
    ContestedVisitListAmount: textOrNull(data.ContestedVisitListAmount),
    PaymentPlanVisitListAutoPayAmount: textOrNull(data.PaymentPlanVisitListAutoPayAmount),
    PaymentPlanVisitListScheduledDate: scalarOrNull(data.PaymentPlanVisitListScheduledDate),
    EstimatedPaymentPlanBalance: scalarOrNull(data.EstimatedPaymentPlanBalance),
    PaymentPlanVisitListPostResolutionAmount: textOrNull(data.PaymentPlanVisitListPostResolutionAmount),
    CanMakePayment: boolOrNull(data.CanMakePayment),
    URLMakePayment: textOrNull(data.URLMakePayment),
    HasUnconvertedPBVisits: boolOrNull(data.HasUnconvertedPBVisits),
    HasVisits: boolOrNull(data.HasVisits),
    PartialPaymentPlanAlert: {
      Code: num(alert.Code),
      Banner: { HeaderText: textOrNull(banner.HeaderText), DetailText: textOrNull(banner.DetailText) },
    },
    UndistributedPayments: list(data.UndistributedPayments),
    SharedAgencyInformation: { Name: textOrNull(agency.Name), PhoneNumber: textOrNull(agency.PhoneNumber) },
    statements: [
      ...list(rec(statementsBody.DataStatement).StatementList),
      ...list(rec(statementsBody.DataDetailBill).StatementList),
    ].map(statement),
    payments: list(rec(paymentsBody.Data).PaymentList).map(payment),
    unavailable,
  };
}

/** The summary page's pay-online path, when it names this account's id. */
function paymentPathFor(raw: RawResponse, source: BillingAccount): string | null {
  const summary = text(findRequest(raw, '/Billing/Summary')?.body);
  const path = parsePaymentPath(summary);
  if (!path) return null;
  const id = new URLSearchParams(path.split('?')[1] ?? '').get('ID');
  return id === null || id === source.id ? path : null;
}

export const billingProcessor: Processor<BillingStandard> = {
  standard(raw: RawResponse): BillingStandard {
    const summary = text(findRequest(raw, '/Billing/Summary')?.body);
    const accounts = parseBillingAccountsHtml(summary).map((source) => account(raw, source));
    const cents = accounts.reduce((sum, a) => sum + Math.round((a.amountDueNumber ?? 0) * 100), 0);
    return { totalDue: cents / 100, accounts };
  },
  concise(standard) {
    return {
      totalDue: standard.totalDue,
      accounts: standard.accounts.map((a) => ({
        guarantorNumber: a.guarantorNumber,
        patientName: a.patientName,
        amountDueNumber: a.amountDueNumber,
        visits: a.visits.map((v) => ({
          StartDateDisplay: v.StartDateDisplay,
          DateRangeDisplay: v.DateRangeDisplay,
          Description: v.Description,
          Patient: v.Patient,
          Provider: v.Provider,
          PrimaryPayer: v.PrimaryPayer,
          ChargeAmount: v.ChargeAmount,
          InsurancePaymentAmount: v.InsurancePaymentAmount,
          InsuranceAmountDue: v.InsuranceAmountDue,
          SelfPaymentAmount: v.SelfPaymentAmount,
          SelfAmountDue: v.SelfAmountDue,
          category: v.category,
        })),
        statements: a.statements.map((s) => ({
          FormattedDateDisplay: s.FormattedDateDisplay,
          Description: s.Description,
          StatementAmountDisplay: s.StatementAmountDisplay,
          IsRead: s.IsRead,
        })),
        payments: a.payments.map((p) => ({
          FormattedDateDisplay: p.FormattedDateDisplay,
          Description: p.Description,
          PaymentAmountDisplay: p.PaymentAmountDisplay,
        })),
        unavailable: a.unavailable,
      })),
    };
  },
};
