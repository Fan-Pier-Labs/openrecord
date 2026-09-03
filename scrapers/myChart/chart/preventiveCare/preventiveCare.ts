import type { MyChartRequest } from '../../core/myChartRequest';
import { RawCollector, type RawResponse } from '../../core/rawResponse';
import { preventiveCareProcessor, type PreventiveCareStandard } from './preventiveCare.processor';

export type { PreventiveCareStandard, PreventiveCareItemStandard, PreventiveCareStatus } from './preventiveCare.processor';
export { preventiveCareProcessor, parsePreventiveCareHtml } from './preventiveCare.processor';

/** `GET /HealthAdvisories` — an HTML page; there is no JSON endpoint. */
export async function fetchPreventiveCareRaw(mychartRequest: MyChartRequest): Promise<RawResponse> {
  const collector = new RawCollector(mychartRequest);
  await collector.send({ path: '/HealthAdvisories' });
  return collector.toRaw();
}

/** The standard object — what `mode: 'json'` returns. */
export async function getPreventiveCare(mychartRequest: MyChartRequest): Promise<PreventiveCareStandard> {
  return preventiveCareProcessor.standard(await fetchPreventiveCareRaw(mychartRequest));
}
