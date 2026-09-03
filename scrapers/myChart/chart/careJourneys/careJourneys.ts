import type { MyChartRequest } from '../../core/myChartRequest';
import { RawCollector, type RawResponse } from '../../core/rawResponse';
import { careJourneysProcessor, type CareJourneysStandard } from './careJourneys.processor';

export type { CareJourneysStandard } from './careJourneys.processor';
export { careJourneysProcessor } from './careJourneys.processor';

/** `GET /app/care-journeys` for the token, then `POST /api/care-journeys/GetCareJourneys`. */
export async function fetchCareJourneysRaw(mychartRequest: MyChartRequest): Promise<RawResponse> {
  const collector = new RawCollector(mychartRequest);
  const token = await collector.pageToken('/app/care-journeys');
  await collector.postJson('/api/care-journeys/GetCareJourneys', token, {});
  return collector.toRaw();
}

/** The standard object — what `mode: 'json'` returns. */
export async function getCareJourneys(mychartRequest: MyChartRequest): Promise<CareJourneysStandard> {
  return careJourneysProcessor.standard(await fetchCareJourneysRaw(mychartRequest));
}
