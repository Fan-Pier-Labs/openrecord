/** The `Prescriptions` group — refill requests, and resolving what to refill. */

import { getMedications } from '../../../scrapers/myChart/chart/medications/medications';
import { requestMedicationRefill } from '../../../scrapers/myChart/chart/medications/medicationRefill';
import type { MyChartRequest } from '../../../scrapers/myChart/core/myChartRequest';
import { resolveUnique } from '../../resolveUnique';
import { optStr, str } from '../args';
import type { CapabilityArgs, CapabilityImpl } from '../types';

/** Resolve `medication_key` directly, or `medication_name` by fuzzy match. */
async function resolveMedicationKey(request: MyChartRequest, args: CapabilityArgs): Promise<{ key: string; name: string }> {
  const explicitKey = optStr(args, 'medication_key');
  if (explicitKey) return { key: explicitKey, name: optStr(args, 'medication_name') ?? explicitKey };

  const query = str(args, 'medication_name').trim();
  if (!query) throw new Error('Pass either medication_key (from get_medications) or medication_name.');

  const meds = (await getMedications(request)).prescriptions;
  // Match on the label the patient is most likely to use — "Lisinopril" as
  // well as "Lisinopril 10mg" — but exact-first, so naming a medication
  // precisely is never rejected for resembling another one.
  const med = resolveUnique(meds, query, {
    getName: (m) => m.name ?? '',
    // Patients say "Lipitor" as often as "Atorvastatin 20mg".
    getAlternateNames: (m) => (m.patientFriendlyName.text ? [m.patientFriendlyName.text] : []),
    label: 'medication',
    stripTitles: false,
  });

  if (!med.refillDetails?.isRefillable) throw new Error(`"${med.name}" is not refillable through MyChart.`);
  // `id` is the prescription's MyChart id. Whether the refill endpoint wants
  // it under `medicationKey` is unverified — see docs/processor-layer-todo.md.
  if (!med.id) throw new Error(`"${med.name}" has no prescription id, so it cannot be refilled here.`);
  return { key: med.id, name: med.name ?? '' };
}

export const PRESCRIPTION_CAPABILITIES: readonly CapabilityImpl[] = [
  {
    id: 'request_refill',
    title: 'Request a refill',
    description: 'Request a refill for a current medication. Give the medication name; an ambiguous name is an error rather than a guess.',
    kind: 'write',
    group: 'Prescriptions',
    params: [
      { name: 'medication_name', type: 'string', description: 'Medication name as shown by get_medications.' },
      { name: 'medication_key', type: 'string', description: 'Exact prescription `id` from get_medications. Use instead of medication_name when you have it.' },
    ],
    run: async (request, args) => {
      const { key, name } = await resolveMedicationKey(request, args);
      const result = await requestMedicationRefill(request, key);
      return { ...result, medication: name };
    },
  },
];
