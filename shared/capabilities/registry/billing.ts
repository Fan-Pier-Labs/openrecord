/** The `Billing` group — what was charged, and who is covering it. */

import { fetchBillingRaw, billingProcessor } from '../../../scrapers/myChart/chart/bills/bills';
import { fetchInsuranceRaw, insuranceProcessor } from '../../../scrapers/myChart/chart/insurance/insurance';
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

];
