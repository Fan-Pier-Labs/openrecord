import { SessionExpiredError } from '../../core/makeAuthenticatedRequest';
import type { MyChartRequest } from '../../core/myChartRequest';
import { RawCollector, type RawResponse } from '../../core/rawResponse';
import { parseBillingAccountsHtml } from '../bills/summaryHtml';
import type { BillingAccount } from '../bills/types';
import {
  GET_BENEFITS_SUMMARY_PATH,
  insuranceBenefitsProcessor,
  type InsuranceBenefitsStandard,
} from './insuranceBenefits.processor';

export type {
  InsuranceBenefitsStandard,
  InsuranceBenefitsAccountStandard,
  BenefitLimitStandard,
  BenefitBucketStandard,
  BenefitLimitName,
} from './insuranceBenefits.processor';
export {
  insuranceBenefitsProcessor,
  benefitsRequestFor,
  BENEFIT_LIMITS,
  GET_BENEFITS_SUMMARY_PATH,
} from './insuranceBenefits.processor';

function detailsPagePath(account: BillingAccount): string {
  return `/Billing/Details?ID=${account.id}&Context=${account.context}`;
}

/**
 * The patient's benefit accumulators — deductible and out-of-pocket maximum.
 *
 * `GET /Billing/Summary` for the guarantor accounts, then per account the
 * `/Billing/Details` page for its antiforgery token and
 * `POST /api/billing-details/GetBenefitsSummary`. The two arguments the POST
 * takes are that account's own `id` and `context` off the summary card, under
 * the names `guarantorId` and `billingSystem` — the endpoint is keyed by
 * guarantor account rather than by coverage, which is why this walks the
 * billing summary at all.
 *
 * It is a React `/api/*` route, so the token rides in the
 * `__RequestVerificationToken` header with a JSON body, not in a form field.
 *
 * The summary page is the payload: without it there are no accounts to ask
 * about, so a failure there throws. Each account's own pair of requests is
 * tolerated, so one guarantor account's outage does not cost the other's
 * deductible, and the processor names the ones that did not answer. Every
 * account failing is a failed read — there is nothing loaded to return, and
 * an empty accumulator list is precisely the wrong answer — so the first
 * failure is thrown.
 */
export async function fetchInsuranceBenefitsRaw(mychartRequest: MyChartRequest): Promise<RawResponse> {
  const collector = new RawCollector(mychartRequest);
  const summary = await collector.send({ path: '/Billing/Summary' });
  const accounts = parseBillingAccountsHtml(summary.text, mychartRequest.hostname);

  const failures: Error[] = [];
  for (const account of accounts) {
    try {
      const token = await collector.pageToken(detailsPagePath(account));
      const { failure } = await collector.send(
        {
          path: GET_BENEFITS_SUMMARY_PATH,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', __RequestVerificationToken: token },
          body: JSON.stringify({ guarantorId: account.id, billingSystem: account.context }),
        },
        { tolerateFailure: true },
      );
      if (failure) failures.push(failure);
    } catch (err) {
      // The token page throws on its own — a failed page, or one carrying no
      // token — and a dead session is not this account's problem to absorb.
      if (err instanceof SessionExpiredError) throw err;
      failures.push(err as Error);
    }
  }
  if (accounts.length > 0 && failures.length === accounts.length) throw failures[0]!;

  return collector.toRaw();
}

/** The standard object — what `mode: 'json'` returns. */
export async function getInsuranceBenefits(mychartRequest: MyChartRequest): Promise<InsuranceBenefitsStandard> {
  return insuranceBenefitsProcessor.standard(await fetchInsuranceBenefitsRaw(mychartRequest));
}
