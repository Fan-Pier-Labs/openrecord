import type { MyChartRequest } from '../core/myChartRequest';
import { RawCollector, type RawResponse } from '../core/rawResponse';
import { ehiExportProcessor, type EhiExportStandard } from './ehiExport.processor';

export type { EhiExportStandard, EhiTemplateStandard } from './ehiExport.processor';
export { ehiExportProcessor } from './ehiExport.processor';

/** `GET /app/release-of-information` for the token, then `POST /api/release-of-information/GetEHIETemplates`. */
export async function fetchEhiExportRaw(mychartRequest: MyChartRequest): Promise<RawResponse> {
  const collector = new RawCollector(mychartRequest);
  const token = await collector.pageToken('/app/release-of-information');
  await collector.postJson('/api/release-of-information/GetEHIETemplates', token, {});
  return collector.toRaw();
}

/** The standard object — what `mode: 'json'` returns. */
export async function getEhiExportTemplates(mychartRequest: MyChartRequest): Promise<EhiExportStandard> {
  return ehiExportProcessor.standard(await fetchEhiExportRaw(mychartRequest));
}
