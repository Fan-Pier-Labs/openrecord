import type { MyChartRequest } from './../core/myChartRequest';
import { RawCollector, type RawResponse } from '../core/rawResponse';
import { healthIssuesProcessor, type HealthIssuesStandard } from './healthIssues.processor';

export type { HealthIssuesStandard, HealthIssueStandard } from './healthIssues.processor';
export { healthIssuesProcessor } from './healthIssues.processor';

/** `GET /Clinical/HealthIssues` for the token, then `POST /api/HealthIssues/LoadHealthIssuesData`. */
export async function fetchHealthIssuesRaw(mychartRequest: MyChartRequest): Promise<RawResponse> {
  const collector = new RawCollector(mychartRequest);
  const token = await collector.pageToken('/Clinical/HealthIssues');
  await collector.postJson('/api/HealthIssues/LoadHealthIssuesData', token, {});
  return collector.toRaw();
}

/** The standard object — what `mode: 'json'` returns. */
export async function getHealthIssues(mychartRequest: MyChartRequest): Promise<HealthIssuesStandard> {
  return healthIssuesProcessor.standard(await fetchHealthIssuesRaw(mychartRequest));
}
