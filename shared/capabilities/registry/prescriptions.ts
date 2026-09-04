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
    description:
      'Request a refill for a current medication. NOT IMPLEMENTED: this reads nothing, changes ' +
      'nothing and submits nothing — the refill request has never been watched reaching a real ' +
      'pharmacy. Ask the patient to request the refill in MyChart directly.',
    kind: 'write',
    group: 'Prescriptions',
    // A write nobody has ever watched land. The withdrawn scraper posted
    // `{ medicationKey }` to `/api/medications/RequestRefill`; `medicationKey`
    // is a field only fake-mychart has ever used, and the captured medications
    // response names the prescription `id`. The fake answers `{success: true}`
    // to anything, so the scraper passed its tests while quite possibly sending
    // a body real MyChart ignores — and a refill that silently does not reach
    // the pharmacy is a patient who stops taking a medication believing it is
    // on the way. See REFILL.md for what a real implementation must establish.
    notImplemented:
      'request_refill is not implemented: it did nothing, read nothing and changed nothing. The ' +
      'refill request has never been watched reaching a real pharmacy, so OpenRecord will not ' +
      'pretend to submit one. Ask the patient to request the refill in MyChart directly. Do not ' +
      'report this as a completed action.',
    params: [
      {
        name: 'medication_name',
        type: 'string',
        description: 'Ignored until this is implemented. Medication name as shown by get_medications.',
      },
      {
        name: 'medication_key',
        type: 'string',
        description: 'Ignored until this is implemented. Exact prescription `id` from get_medications.',
      },
    ],
  },
];
