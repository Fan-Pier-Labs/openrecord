import type { MyChartRequest } from './../core/myChartRequest';
import { RawCollector, type RawResponse } from '../core/rawResponse';
import { immunizationsProcessor, type ImmunizationsStandard } from './immunizations.processor';

export type { ImmunizationsStandard, ImmunizationStandard } from './immunizations.processor';
export { immunizationsProcessor } from './immunizations.processor';

/** `GET /Clinical/Immunizations` for the token, then `POST /api/immunizations/LoadImmunizations`. */
export async function fetchImmunizationsRaw(mychartRequest: MyChartRequest): Promise<RawResponse> {
  const collector = new RawCollector(mychartRequest);
  const token = await collector.pageToken('/Clinical/Immunizations');
  await collector.postJson('/api/immunizations/LoadImmunizations', token, {});
  return collector.toRaw();
}

/** The standard object — what `mode: 'json'` returns. */
export async function getImmunizations(mychartRequest: MyChartRequest): Promise<ImmunizationsStandard> {
  return immunizationsProcessor.standard(await fetchImmunizationsRaw(mychartRequest));
}
