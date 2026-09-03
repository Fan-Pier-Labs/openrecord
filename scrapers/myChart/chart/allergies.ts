import type { MyChartRequest } from '../core/myChartRequest';
import { RawCollector, type RawResponse } from '../core/rawResponse';
import { allergiesProcessor, type AllergiesStandard } from './allergies.processor';

export type { AllergiesStandard } from './allergies.processor';
export { allergiesProcessor } from './allergies.processor';

/** `GET /Clinical/Allergies` for the token, then `POST /api/allergies/LoadAllergies`. */
export async function fetchAllergiesRaw(mychartRequest: MyChartRequest): Promise<RawResponse> {
  const collector = new RawCollector(mychartRequest);
  const token = await collector.pageToken('/Clinical/Allergies');
  await collector.postJson('/api/allergies/LoadAllergies', token, {});
  return collector.toRaw();
}

/** The standard object — what `mode: 'json'` returns. */
export async function getAllergies(mychartRequest: MyChartRequest): Promise<AllergiesStandard> {
  return allergiesProcessor.standard(await fetchAllergiesRaw(mychartRequest));
}
