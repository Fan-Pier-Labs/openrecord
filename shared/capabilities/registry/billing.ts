/** The `Billing` group — what was charged, and who is covering it. */

import { fetchBillingRaw, billingProcessor, downloadBillingStatement } from '../../../scrapers/myChart/chart/bills/bills';
import { fetchInsuranceRaw, insuranceProcessor } from '../../../scrapers/myChart/chart/insurance/insurance';
import { fetchInsuranceBenefitsRaw, insuranceBenefitsProcessor } from '../../../scrapers/myChart/chart/insuranceBenefits/insuranceBenefits';
import { fetchInsurancePayersRaw, insurancePayersProcessor } from '../../../scrapers/myChart/chart/insurancePayers/insurancePayers';
import { requireStr } from '../args';
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
    id: 'download_billing_statement',
    title: 'Download billing statement',
    description:
      'Download one billing statement or itemized bill as the PDF MyChart serves for it. Identify it with the `RecordID` of a statement from get_billing. The file is saved on the user’s own device and the path returned.',
    kind: 'read',
    group: 'Billing',
    returnsFile: true,
    params: [
      { name: 'record_id', type: 'string', required: true, description: 'The `RecordID` of the chosen statement from get_billing. Copy it verbatim.' },
    ],
    run: (request, args) => downloadBillingStatement(request, requireStr(args, 'record_id')),
  },
  {
    id: 'get_insurance',
    title: 'Insurance',
    description:
      'Insurance coverages on file: payer, plan, member and group numbers, effective dates. ' +
      'Not the deductible or out-of-pocket maximum — those are get_insurance_benefits.',
    kind: 'read',
    group: 'Billing',
    params: [],
    run: (request) => fetchInsuranceRaw(request),
    processor: insuranceProcessor,
  },
  {
    id: 'get_insurance_benefits',
    title: 'Insurance benefits',
    description:
      'How much of the deductible and the out-of-pocket maximum has been used, how much is left, ' +
      'and when each resets. MyChart keys these to a billing guarantor account rather than to a ' +
      'coverage, so a patient with two accounts gets one set per account. For the coverages ' +
      'themselves — payer, plan, member id — use get_insurance.',
    kind: 'read',
    group: 'Billing',
    params: [],
    run: (request) => fetchInsuranceBenefitsRaw(request),
    processor: insuranceBenefitsProcessor,
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
