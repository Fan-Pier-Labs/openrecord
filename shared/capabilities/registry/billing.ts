/** The `Billing` group — what was charged, and who is covering it. */

import { fetchBillingRaw, billingProcessor } from '../../../scrapers/myChart/chart/bills/bills';
import { fetchInsuranceRaw, insuranceProcessor } from '../../../scrapers/myChart/chart/insurance/insurance';
import { fetchInsurancePayersRaw, insurancePayersProcessor } from '../../../scrapers/myChart/chart/insurancePayers/insurancePayers';
import type { CapabilityImpl } from '../types';

export const BILLING_CAPABILITIES: readonly CapabilityImpl[] = [
  {
    id: 'get_billing',
    title: 'Billing',
    description: 'Billing history and account balances.',
    kind: 'read',
    group: 'Billing',
    params: [],
    run: (request) => fetchBillingRaw(request),
    processor: billingProcessor,
  },
  {
    id: 'get_insurance',
    title: 'Insurance',
    description: 'Insurance coverages on file.',
    kind: 'read',
    group: 'Billing',
    params: [],
    run: (request) => fetchInsuranceRaw(request),
    processor: insuranceProcessor,
  },
  {
    id: 'get_insurance_payers',
    title: 'Insurance payers accepted',
    description:
      "The insurance payers this organization's MyChart offers when adding a coverage — the " +
      "organization's configured payer catalogue, the same for every patient on the instance. " +
      "Not the patient's own coverage (that is get_insurance) and not an in-network guarantee.",
    kind: 'read',
    group: 'Billing',
    lessFrequentlyUsed: true,
    params: [],
    run: (request) => fetchInsurancePayersRaw(request),
    processor: insurancePayersProcessor,
  },
];
