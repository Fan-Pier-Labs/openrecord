// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

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
 *
 * `GetVisits` also pages, returning the rows past the first page unhydrated
 * and priced at a fabricated `"$0.00"`. The scraper posts each of those back
 * to `GetMoreVisits`, one per request; {@link hydratedRows} collects the
 * answers and the merge swaps each stub for its real row. No caller ever
 * sees the placeholder: a stub that did not load is listed in
 * `unloadedVisits` instead, and `notice` says the visit list is incomplete.
 */

import { answered, findRequest, findRequests, type RawRequestRecord, type RawResponse } from '../../core/rawResponse';
import type { Processor } from '../../processors/processor';
import { htmlToText } from '../../processors/htmlText';
import { boolOrNull, list, num, rec, text, textOrNull } from '../../processors/read';
import type { BillingGetVisits, DataStatement, GetStatementList, LoadPaymentList, Statement } from './mychart.types';
import type { BillingAccountStandard, BillingCoverageInfoStandard, BillingPaymentStandard, BillingProcedureGroupStandard, BillingProcedureStandard, BillingStandard, BillingStatementStandard, BillingUnloadedVisitStandard, BillingVisitCategory, BillingVisitStandard } from './standardized.types';

export type { BillingAccountStandard, BillingCoverageInfoStandard, BillingPaymentStandard, BillingProcedureGroupStandard, BillingProcedureStandard, BillingStandard, BillingStatementStandard, BillingUnloadedReason, BillingUnloadedVisitStandard, BillingVisitCategory, BillingVisitStandard } from './standardized.types';
import { parseBillingAccountsHtml, parsePaymentPath } from './summaryHtml';
import type { BillingAccount } from './types';

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

function scalarOrNull(value: unknown): string | number | null {
  return typeof value === 'string' || typeof value === 'number' ? value : null;
}

/**
 * Whether `GetVisits` populated a charge row, read off `LevelOfDetailLoaded`.
 *
 * Epic pages this endpoint and lazy-loads the rows past the first page. An
 * unhydrated row is not empty, it is fabricated: `Description` is the
 * `"{VisitType} at {Facility}"` template with both slots blank, the procedure
 * and coverage lists are null, and every amount is the string `"$0.00"` even
 * on a visit charged thousands. The scraper posts those rows back to
 * `GetMoreVisits` and this merges the answers in, so a caller sees real
 * money; this predicate is how both sides agree on what still needs filling.
 *
 * Levels observed on the wire: `0` on every stub, `2` on every populated row.
 */
export function isStubRow(row: unknown): boolean {
  return num(rec(row).LevelOfDetailLoaded) === 0;
}

/**
 * The `listOfAccounts[i].EncAccountID` value(s) a `GetMoreVisits` body
 * posted, in index order. The scraper posts one per request, so this is
 * normally a single handle; the index in the field name is still honoured
 * rather than parse order, because it is what ASP.NET binds on.
 */
export function postedHydrateKeys(requestBody: unknown): string[] {
  if (typeof requestBody !== 'string') return [];
  const indexed: Array<{ i: number; id: string }> = [];
  for (const [field, value] of new URLSearchParams(requestBody)) {
    const match = /^listOfAccounts\[(\d+)\]\.EncAccountID$/.exec(field);
    if (match) indexed.push({ i: Number(match[1]), id: value });
  }
  return indexed.sort((a, b) => a.i - b.i).map((entry) => entry.id);
}

export interface Hydration {
  /** The hydrated row for each stub, keyed by the stub's encrypted handle. */
  rows: Map<string, Record<string, unknown>>;
  /** Handles whose own request succeeded and came back with no row. */
  empty: Set<string>;
}

/**
 * The hydrated rows from every `GetMoreVisits` answer, keyed by the encrypted
 * handle of the stub each one answers — and the handles MyChart answered
 * with nothing at all.
 *
 * The answer carries nothing to join on — a stub's `HospitalAccountId` is an
 * encrypted handle (`WP-24…`), its hydrated row's is the plain account number
 * (`4820015507`), and no field on the hydrated row carries the handle back.
 * So the handle a row answers is read off the request it came back to: the
 * recorded `requestBody`. The scraper posts one stub per request, which makes
 * that pairing exact — one handle in, one row out.
 *
 * The pairing puts real money on a row, so it is checked rather than
 * trusted: {@link hydratedFor} drops a pair whose `StartDate` disagrees.
 *
 * An answer that succeeded and carried no populated row is MyChart declining
 * that stub, not a failure: one live instance answered the same two of 15
 * stubs with `Success: true` and an empty list on every attempt, alone or
 * batched, and Epic's own "load all" returned them as dateless placeholders.
 * One handle per request is what lets that answer name its stub.
 */
function hydratedRows(raw: RawResponse): Hydration {
  const hydration: Hydration = { rows: new Map(), empty: new Set() };
  for (const record of findRequests(raw, 'GetMoreVisits')) {
    if (!answered(record)) continue;
    const posted = postedHydrateKeys(record.requestBody);
    const body = rec(record.body);
    const rows = list(rec(body.Data).UnifiedVisitList);
    if (body.Success === true && !rows.some((row) => !isStubRow(row))) {
      for (const handle of posted) hydration.empty.add(handle);
      continue;
    }
    rows.forEach((row, i) => {
      const handle = posted[i];
      const r = rec(row);
      if (!handle || isStubRow(r)) return;
      hydration.rows.set(handle, r);
    });
  }
  return hydration;
}

/**
 * The hydrated row answering one stub, or null when it does not agree with
 * the stub on the service date. The date is the one field a stub already has
 * right, so a row that came back to the wrong request fails to match instead
 * of quietly attaching one visit's charges to another.
 */
function hydratedFor(
  stub: Record<string, unknown>,
  hydrated: Map<string, Record<string, unknown>>,
): Record<string, unknown> | null {
  const row = hydrated.get(text(stub.HospitalAccountId));
  if (!row) return null;
  return num(row.StartDate) === num(stub.StartDate) ? row : null;
}

function payment(value: unknown): BillingPaymentStandard {
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
  const description = textOrNull(p.Description);
  return {
    DescriptionText: description === null ? null : htmlToText(description),
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

function visit(value: unknown, category: BillingVisitCategory): BillingVisitStandard {
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

function unloadedVisit(stub: Record<string, unknown>, category: BillingVisitCategory, hydration: Hydration): BillingUnloadedVisitStandard {
  return {
    category,
    StartDate: num(stub.StartDate),
    StartDateDisplay: textOrNull(stub.StartDateDisplay),
    BillingSystemDisplay: textOrNull(stub.BillingSystemDisplay),
    reason: hydration.empty.has(text(stub.HospitalAccountId)) || hydration.empty.has(text(stub.EmptyVisitEstimateID))
      ? 'returned_empty'
      : 'not_loaded',
  };
}

/**
 * The nine `GetVisits` lists as one, most specific category first,
 * de-duplicated — with every stub replaced by the row `GetMoreVisits`
 * returned for it.
 *
 * The swap happens before de-duplication because a stub and its hydrated self
 * do not look alike: the identity includes `Description` and
 * `SelfAmountDueRaw`, which are exactly the fields hydration fills in.
 *
 * A stub that did not load goes to `unloadedVisits`, never `visits`: its
 * every amount is a fabricated `"$0.00"` that reads exactly like a settled
 * visit, so a caller summing `visits` must not see it. The rows that did load
 * are still returned — one visit MyChart will not serve is no reason to lose
 * the rest of the account.
 */
export function mergeVisitLists(
  data: Record<string, unknown>,
  hydration: Hydration = { rows: new Map(), empty: new Set() },
): { visits: BillingVisitStandard[]; unloadedVisits: BillingUnloadedVisitStandard[] } {
  const seen = new Set<string>();
  const visits: BillingVisitStandard[] = [];
  const unloadedVisits: BillingUnloadedVisitStandard[] = [];
  for (const category of VISIT_LIST_CATEGORIES) {
    for (const row of list(data[category])) {
      let r = rec(row);
      if (isStubRow(r)) r = hydratedFor(r, hydration.rows) ?? r;
      const identity = `${text(r.HospitalAccountId)}|${num(r.StartDate) ?? ''}|${text(r.Description)}|${num(r.SelfAmountDueRaw) ?? ''}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      if (isStubRow(r)) unloadedVisits.push(unloadedVisit(r, category, hydration));
      else visits.push(visit(r, category));
    }
  }
  return { visits, unloadedVisits };
}

const LIST_LABEL: Record<string, string> = { GetStatementList: 'statements', LoadPaymentList: 'payment history' };

/** What `notice` says, or null when every account loaded everything. */
function billingNotice(accounts: BillingAccountStandard[]): string | null {
  const sentences: string[] = [];
  const noCharges = accounts.filter((a) => a.unavailable.includes('GetVisits')).map((a) => a.guarantorNumber);
  if (noCharges.length > 0) {
    sentences.push(
      `MyChart failed to return the charges on guarantor account ${noCharges.join(', ')}, so its visits are missing ` +
        'entirely; the balance comes from the billing summary and still stands. They may load on a retry.',
    );
  }
  const rows = unloadedRowsNotice(accounts);
  if (rows) sentences.push(rows);
  const lists = accounts.flatMap((a) =>
    a.unavailable.filter((f) => f !== 'GetVisits').map((f) => `the ${LIST_LABEL[f] ?? f} on guarantor account ${a.guarantorNumber}`),
  );
  if (lists.length > 0) sentences.push(`MyChart failed to return ${lists.join(', ')}; those are unknown, not empty.`);
  return sentences.length > 0 ? sentences.join(' ') : null;
}

function unloadedRowsNotice(accounts: BillingAccountStandard[]): string | null {
  const parts = accounts
    .filter((a) => a.unloadedVisits.length > 0)
    .map((a) => {
      const dates = a.unloadedVisits.map((v) => v.StartDateDisplay ?? 'unknown date').join(', ');
      return `${a.unloadedVisits.length} of ${a.visits.length + a.unloadedVisits.length} charge rows on guarantor account ${a.guarantorNumber} (service dates ${dates})`;
    });
  if (parts.length === 0) return null;
  const declined = accounts.some((a) => a.unloadedVisits.some((v) => v.reason === 'returned_empty'));
  const failed = accounts.some((a) => a.unloadedVisits.some((v) => v.reason === 'not_loaded'));
  return (
    `MyChart did not load ${parts.join('; ')}. They are listed under unloadedVisits and left out of visits, ` +
    'so the visit list is incomplete — their charges are unknown, not $0.00. The account balances come from ' +
    'the billing summary and are not affected.' +
    (declined ? " For rows marked returned_empty, MyChart answered with no detail; its own billing page can't show them either." : '') +
    (failed ? ' Rows marked not_loaded failed to load and may load on a retry.' : '')
  );
}

/** `20251130` → `2025-11-30`; null for anything else. */
export function statementDateISO(dateDisplay: unknown): string | null {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(text(dateDisplay));
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

export function statement(value: unknown): BillingStatementStandard {
  const s = rec<Statement>(value);
  return {
    dateISO: statementDateISO(s.DateDisplay),
    // No live capture has this field; only the hand-written fixture does.
    FormattedDateDisplay: textOrNull(rec(value).FormattedDateDisplay),
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

function account(raw: RawResponse, source: BillingAccount, hydration: Hydration): BillingAccountStandard {
  const unavailable: string[] = [];
  const visitsRecord = accountRequest(raw, source, 'GetVisits');
  if (!answered(visitsRecord)) unavailable.push('GetVisits');
  const data = answered(visitsRecord) ? rec(rec<BillingGetVisits>(visitsRecord.body).Data) : {};
  const { visits, unloadedVisits } = mergeVisitLists(data, hydration);
  const alert = rec(data.PartialPaymentPlanAlert);
  const banner = rec(alert.Banner);
  const agency = rec(data.SharedAgencyInformation);
  function tolerated(fragment: string): unknown {
    const record = accountRequest(raw, source, fragment);
    if (!answered(record)) {
      unavailable.push(fragment);
      return {};
    }
    return record.body;
  }
  const statementsBody = rec<GetStatementList>(tolerated('GetStatementList'));
  const paymentsBody = rec<LoadPaymentList>(tolerated('LoadPaymentList'));
  return {
    guarantorNumber: source.guarantorNumber,
    patientName: source.patientName,
    amountDueNumber: source.amountDue ?? null,
    paymentUrl: paymentPathFor(raw, source),
    visits,
    unloadedVisits,
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
      ...list(rec<DataStatement>(statementsBody.DataStatement).StatementList),
      ...list(rec<DataStatement>(statementsBody.DataDetailBill).StatementList),
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
    const hydration = hydratedRows(raw);
    const accounts = parseBillingAccountsHtml(summary).map((source) => account(raw, source, hydration));
    const cents = accounts.reduce((sum, a) => sum + Math.round((a.amountDueNumber ?? 0) * 100), 0);
    return { totalDue: cents / 100, notice: billingNotice(accounts), accounts };
  },
  concise(standard) {
    return {
      totalDue: standard.totalDue,
      notice: standard.notice,
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
          dateISO: s.dateISO,
          FormattedDateDisplay: s.FormattedDateDisplay,
          Description: s.Description,
          StatementAmountDisplay: s.StatementAmountDisplay,
          IsRead: s.IsRead,
          RecordID: s.RecordID,
        })),
        payments: a.payments.map((p) => ({
          FormattedDateDisplay: p.FormattedDateDisplay,
          Description: p.Description,
          PaymentAmountDisplay: p.PaymentAmountDisplay,
        })),
        unloadedVisits: a.unloadedVisits.map((v) => ({ StartDateDisplay: v.StartDateDisplay, reason: v.reason })),
        unavailable: a.unavailable,
      })),
    };
  },
};
