/**
 * The `Prescriptions` group.
 *
 * `request_refill` is declared and deliberately not implemented — see
 * `scrapers/myChart/chart/medications/REFILL.md` for the endpoint, what the
 * withdrawn scraper sent, and what a real implementation has to confirm first.
 */

import type { CapabilityImpl } from '../types';

export const PRESCRIPTION_CAPABILITIES: readonly CapabilityImpl[] = [
  {
    id: 'request_refill',
    title: 'Request a refill',
    description: 'Request a refill for a current medication.',
    kind: 'write',
    group: 'Prescriptions',
    // A write nobody has ever watched land. The withdrawn scraper posted
    // `{ medicationKey }` to `/api/medications/RequestRefill`; `medicationKey`
    // is a field only fake-mychart has ever used, and the captured medications
    // response names the prescription `id`. The fake answers `{success: true}`
    // to anything, so the scraper passed its tests while quite possibly sending
    // a body real MyChart ignores — and a refill that silently does not reach
    // the pharmacy is a patient who stops taking a medication believing it is
    // on the way. Verifying it means watching a real refill land, which is not
    // something to do speculatively on someone's prescription.
    notImplemented:
      'the refill request has never been watched reaching a real pharmacy, and the body the ' +
      'withdrawn scraper sent used a field name (`medicationKey`) that only fake-mychart has ' +
      'ever recognised. Ask the patient to request the refill in MyChart directly.',
    params: [
      { name: 'medication_name', type: 'string', description: 'Medication name as shown by get_medications.' },
      { name: 'medication_key', type: 'string', description: 'Exact prescription `id` from get_medications.' },
    ],
  },
];
