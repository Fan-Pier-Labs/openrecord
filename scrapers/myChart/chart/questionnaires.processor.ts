/**
 * Questionnaires processor. Field decisions: docs/processor-layer-proposal.md,
 * `get_questionnaires`.
 *
 * No captured skeleton: the element names the fake serves are fixture-only,
 * so each questionnaire passes through whole (rule 10). Narrows to name,
 * status and due date once a capture exists.
 */

import { bodyOf, type RawResponse } from '../core/rawResponse';
import type { Processor } from '../processors/processor';
import { list, rec } from '../processors/read';

export interface QuestionnairesStandard {
  questionnaires: unknown[];
}

export const questionnairesProcessor: Processor<QuestionnairesStandard> = {
  standard(raw: RawResponse): QuestionnairesStandard {
    return { questionnaires: list(rec(bodyOf(raw, 'GetQuestionnaireList')).questionnaires) };
  },
  concise: (standard) => standard,
};
