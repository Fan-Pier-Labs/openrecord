import type { MyChartRequest } from './../core/myChartRequest';
import { RawCollector, type RawResponse } from '../core/rawResponse';
import { medicalHistoryProcessor, type MedicalHistoryStandard } from './medicalHistory.processor';

export type {
  MedicalHistoryStandard,
  DiagnosisStandard,
  SurgeryStandard,
  FamilyMemberStandard,
} from './medicalHistory.processor';
export { medicalHistoryProcessor } from './medicalHistory.processor';

/** `GET /app/histories` for the token, then `POST /api/histories/LoadHistoriesViewModel`. */
export async function fetchMedicalHistoryRaw(mychartRequest: MyChartRequest): Promise<RawResponse> {
  const collector = new RawCollector(mychartRequest);
  const token = await collector.pageToken('/app/histories');
  await collector.postJson('/api/histories/LoadHistoriesViewModel', token, {});
  return collector.toRaw();
}

/** The standard object — what `mode: 'json'` returns. */
export async function getMedicalHistory(mychartRequest: MyChartRequest): Promise<MedicalHistoryStandard> {
  return medicalHistoryProcessor.standard(await fetchMedicalHistoryRaw(mychartRequest));
}
