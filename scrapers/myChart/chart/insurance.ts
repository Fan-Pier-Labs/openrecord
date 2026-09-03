import type { MyChartRequest } from '../core/myChartRequest';
import { RawCollector, type RawResponse } from '../core/rawResponse';
import { insuranceProcessor, type InsuranceStandard } from './insurance.processor';

export type { InsuranceStandard, InsuranceCoverageStandard } from './insurance.processor';
export { insuranceProcessor, parseInsuranceHtml } from './insurance.processor';

/** `GET /Insurance` — an HTML page; the insurance-hub JSON endpoints answer 500 on the captured instance. */
export async function fetchInsuranceRaw(mychartRequest: MyChartRequest): Promise<RawResponse> {
  const collector = new RawCollector(mychartRequest);
  await collector.send({ path: '/Insurance' });
  return collector.toRaw();
}

/** The standard object — what `mode: 'json'` returns. */
export async function getInsurance(mychartRequest: MyChartRequest): Promise<InsuranceStandard> {
  return insuranceProcessor.standard(await fetchInsuranceRaw(mychartRequest));
}
