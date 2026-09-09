/**
 * Insurance benefits processor. Field decisions: this folder's README.md.
 *
 * `GetBenefitsSummary` is the "Insurance benefits" card on the billing
 * activity: how much of the deductible and the out-of-pocket maximum has been
 * used, how much is left, and when the accumulator resets. `moop` is Epic's
 * name for maximum out-of-pocket and keeps it (rule 2).
 *
 * The endpoint is keyed by GUARANTOR ACCOUNT, not by coverage — its two
 * arguments are the `id` and `context` the billing summary page carries per
 * account — so a patient with two guarantor accounts has two of these, and the
 * standard object is a list of accounts rather than a single card. The
 * guarantor number and patient name on each row are read off the same summary
 * card the request was addressed from, so a reader can tell the two apart;
 * nothing in the response itself identifies the account.
 *
 * Each limit carries two buckets, `accountBucket` and `patientBucket`, and
 * they stay apart. On the one captured account `accountBucket` was entirely
 * blank — empty-string amounts, `rollPeriod: "0"` — while `patientBucket`
 * carried the real numbers, which is exactly the case rule 6 covers: a field
 * that is populated on some responses and not others is emitted every time,
 * and the processor never looks at the value to decide.
 *
 * Shape captured on ONE real instance (N=1). Everything below is a field name
 * that capture showed; nothing is projected that has not been seen.
 */

import { answered, findRequest, findRequests, type RawRequestRecord, type RawResponse } from '../../core/rawResponse';
import type { Processor } from '../../processors/processor';
import { boolOrNull, num, rec, text, textOrNull } from '../../processors/read';
import { parseAmount, parseBillingAccountsHtml } from '../bills/summaryHtml';
import type { BillingAccount } from '../bills/types';

export const GET_BENEFITS_SUMMARY_PATH = '/api/billing-details/GetBenefitsSummary';

/** The three accumulators the card carries, in MyChart's own order. */
export const BENEFIT_LIMITS = ['deductible', 'moop', 'insuranceLimit'] as const;

export type BenefitLimitName = (typeof BENEFIT_LIMITS)[number];

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

function amount(value: unknown): number | null {
  return parseAmount(text(value)) ?? null;
}

function bucket(value: unknown): BenefitBucketStandard {
  const b = rec(value);
  return {
    isLimit: boolOrNull(b.isLimit),
    type: textOrNull(b.type),
    totalAmount: textOrNull(b.totalAmount),
    usedAmount: textOrNull(b.usedAmount),
    remainingAmount: textOrNull(b.remainingAmount),
    totalAmountNumber: amount(b.totalAmount),
    usedAmountNumber: amount(b.usedAmount),
    remainingAmountNumber: amount(b.remainingAmount),
    usedRatio: num(b.usedRatio),
    isTotalZero: boolOrNull(b.isTotalZero),
    rollPeriodEndDate: textOrNull(b.rollPeriodEndDate),
    rollPeriod: textOrNull(b.rollPeriod),
    numberOfPeriods: num(b.numberOfPeriods),
    usedOnPrevLevel: textOrNull(b.usedOnPrevLevel),
  };
}

function limit(value: unknown): BenefitLimitStandard | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const l = rec(value);
  return {
    type: textOrNull(l.type),
    network: textOrNull(l.network),
    name: textOrNull(l.name),
    accountBucket: bucket(l.accountBucket),
    patientBucket: bucket(l.patientBucket),
  };
}

/**
 * The recorded `GetBenefitsSummary` whose posted `guarantorId` names this
 * account. The calls differ only in their bodies — same path, same method —
 * so the request body is the only discriminator, which is why the collector
 * records it.
 */
export function benefitsRequestFor(raw: RawResponse, source: BillingAccount): RawRequestRecord | undefined {
  return findRequests(raw, GET_BENEFITS_SUMMARY_PATH).find(
    (r) => rec(r.requestBody).guarantorId === source.id,
  );
}

function account(body: unknown, source: BillingAccount): InsuranceBenefitsAccountStandard {
  const b = rec(body);
  return {
    guarantorNumber: source.guarantorNumber,
    patientName: source.patientName,
    coverageName: textOrNull(b.coverageName),
    payerName: textOrNull(b.payerName),
    lastUpdatedText: textOrNull(b.lastUpdatedText),
    helpText: textOrNull(b.helpText),
    coverageId: textOrNull(b.coverageId),
    benefitsPatientId: textOrNull(b.benefitsPatientId),
    queryKey: textOrNull(b.queryKey),
    noCoverageAvailable: boolOrNull(b.noCoverageAvailable),
    hasAmbiguousCoverages: boolOrNull(b.hasAmbiguousCoverages),
    hasRTEUpdateInProgress: boolOrNull(b.hasRTEUpdateInProgress),
    canAccessInsuranceHub: boolOrNull(b.canAccessInsuranceHub),
    canAccessInsuranceSummary: boolOrNull(b.canAccessInsuranceSummary),
    canAccessCustomerService: boolOrNull(b.canAccessCustomerService),
    canAccessAnyLinks: boolOrNull(b.canAccessAnyLinks),
    insuranceHubUrl: textOrNull(b.insuranceHubUrl),
    payerPhoneNumber: textOrNull(b.payerPhoneNumber),
    deductible: limit(b.deductible),
    moop: limit(b.moop),
    insuranceLimit: limit(b.insuranceLimit),
  };
}

export const insuranceBenefitsProcessor: Processor<InsuranceBenefitsStandard> = {
  standard(raw: RawResponse): InsuranceBenefitsStandard {
    const summary = text(findRequest(raw, '/Billing/Summary')?.body);
    const accounts: InsuranceBenefitsAccountStandard[] = [];
    const unavailable: string[] = [];

    for (const source of parseBillingAccountsHtml(summary)) {
      const record = benefitsRequestFor(raw, source);
      if (!answered(record)) {
        // The scraper tolerates a per-account failure so one guarantor
        // account's outage does not cost the other's deductible; naming it
        // here is what keeps that from reading as "you have no deductible".
        unavailable.push(source.guarantorNumber);
        continue;
      }
      accounts.push(account(record.body, source));
    }

    return {
      accounts,
      // Never claimed over an account we could not read: an unavailable
      // account's accumulators are unknown, which is not "none".
      hasNoBenefits: unavailable.length === 0 && accounts.every((a) => a.noCoverageAvailable === true),
      unavailable,
    };
  },

  concise(standard) {
    const brief = (b: BenefitBucketStandard) => ({
      type: b.type,
      totalAmount: b.totalAmount,
      usedAmount: b.usedAmount,
      remainingAmount: b.remainingAmount,
      rollPeriodEndDate: b.rollPeriodEndDate,
    });
    const briefLimit = (l: BenefitLimitStandard | null) =>
      l === null
        ? null
        : {
            name: l.name,
            network: l.network,
            // Both sides, always. The captured account had the numbers on one
            // of them and blanks on the other, and which one that is differs
            // by payer — dropping the blank is membership by value (rule 6).
            accountBucket: brief(l.accountBucket),
            patientBucket: brief(l.patientBucket),
          };
    return {
      accounts: standard.accounts.map((a) => ({
        guarantorNumber: a.guarantorNumber,
        patientName: a.patientName,
        payerName: a.payerName,
        coverageName: a.coverageName,
        lastUpdatedText: a.lastUpdatedText,
        noCoverageAvailable: a.noCoverageAvailable,
        deductible: briefLimit(a.deductible),
        moop: briefLimit(a.moop),
        insuranceLimit: briefLimit(a.insuranceLimit),
      })),
      hasNoBenefits: standard.hasNoBenefits,
      unavailable: standard.unavailable,
    };
  },
};
