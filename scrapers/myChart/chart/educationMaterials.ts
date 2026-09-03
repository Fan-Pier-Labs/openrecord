import type { MyChartRequest } from '../core/myChartRequest';
import { RawCollector, type RawResponse } from '../core/rawResponse';
import { educationMaterialsProcessor, type EducationMaterialsStandard } from './educationMaterials.processor';

export type { EducationMaterialsStandard, EducationMaterialStandard } from './educationMaterials.processor';
export { educationMaterialsProcessor } from './educationMaterials.processor';

/** `GET /app/education` for the token, then `POST /api/education/GetPatEducationTitles`. */
export async function fetchEducationMaterialsRaw(mychartRequest: MyChartRequest): Promise<RawResponse> {
  const collector = new RawCollector(mychartRequest);
  const token = await collector.pageToken('/app/education');
  await collector.postJson('/api/education/GetPatEducationTitles', token, {});
  return collector.toRaw();
}

/** The standard object — what `mode: 'json'` returns. */
export async function getEducationMaterials(mychartRequest: MyChartRequest): Promise<EducationMaterialsStandard> {
  return educationMaterialsProcessor.standard(await fetchEducationMaterialsRaw(mychartRequest));
}
