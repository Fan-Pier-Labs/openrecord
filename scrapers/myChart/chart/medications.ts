import type { MyChartRequest } from './../core/myChartRequest';
import { RawCollector, type RawResponse } from '../core/rawResponse';
import { medicationsProcessor, type MedicationsStandard } from './medications.processor';

export type {
  MedicationsStandard,
  PrescriptionStandard,
  PrescriptionListStandard,
  RefillDetailsStandard,
  OwningPharmacyStandard,
  LastDispenseStandard,
  CostDetailsStandard,
} from './medications.processor';
export { medicationsProcessor } from './medications.processor';

/** `GET /Clinical/Medications` for the token, then `POST /api/medications/LoadMedicationsPage`. */
export async function fetchMedicationsRaw(mychartRequest: MyChartRequest): Promise<RawResponse> {
  const collector = new RawCollector(mychartRequest);
  const token = await collector.pageToken('/Clinical/Medications');
  await collector.postJson('/api/medications/LoadMedicationsPage', token, {});
  return collector.toRaw();
}

/** The standard object — what `mode: 'json'` returns. */
export async function getMedications(mychartRequest: MyChartRequest): Promise<MedicationsStandard> {
  return medicationsProcessor.standard(await fetchMedicationsRaw(mychartRequest));
}
