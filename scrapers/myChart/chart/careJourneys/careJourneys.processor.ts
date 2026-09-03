/**
 * Care journeys processor. Field decisions: docs/processor-layer-proposal.md,
 * `get_care_journeys`.
 *
 * No captured skeleton: the element names the fake serves are fixture-only,
 * so each journey passes through whole (rule 10). Narrows to name, status and
 * provider once a capture exists.
 */

import { bodyOf, type RawResponse } from '../../core/rawResponse';
import type { Processor } from '../../processors/processor';
import { list, rec } from '../../processors/read';

export interface CareJourneysStandard {
  careJourneys: unknown[];
}

export const careJourneysProcessor: Processor<CareJourneysStandard> = {
  standard(raw: RawResponse): CareJourneysStandard {
    return { careJourneys: list(rec(bodyOf(raw, 'GetCareJourneys')).careJourneys) };
  },
  concise: (standard) => standard,
};
