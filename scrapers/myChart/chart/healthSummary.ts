import type { MyChartRequest } from './../core/myChartRequest';
import { RawCollector, type RawResponse } from '../core/rawResponse';
import { healthSummaryProcessor, type HealthSummaryStandard } from './healthSummary.processor';

export type { HealthSummaryStandard, MeasurementStandard, VisitPointerStandard } from './healthSummary.processor';
export { healthSummaryProcessor } from './healthSummary.processor';

/**
 * `GET /app/health-summary` for the token, then
 * `POST /api/health-summary/FetchHealthSummary` and `POST /api/health-summary/FetchH2GHeader`.
 */
export async function fetchHealthSummaryRaw(mychartRequest: MyChartRequest): Promise<RawResponse> {
  const collector = new RawCollector(mychartRequest);
  const token = await collector.pageToken('/app/health-summary');
  await Promise.all([
    collector.postJson('/api/health-summary/FetchHealthSummary', token, {}),
    collector.postJson('/api/health-summary/FetchH2GHeader', token, {}),
  ]);
  return collector.toRaw();
}

/** The standard object — what `mode: 'json'` returns. */
export async function getHealthSummary(mychartRequest: MyChartRequest): Promise<HealthSummaryStandard> {
  return healthSummaryProcessor.standard(await fetchHealthSummaryRaw(mychartRequest));
}
