/**
 * Questionnaires processor. Field decisions: docs/processor-layer-proposal.md,
 * `get_questionnaires`.
 *
 * No captured skeleton: the element names the fake serves are fixture-only,
 * so each questionnaire passes through whole (rule 10). Narrows to name,
 * status and due date once a capture exists.
 *
 * One captured instance no longer serves the legacy activity at all: it
 * answers `/Questionnaire` with HTTP 500 and `GetQuestionnaireList` with the
 * 404 page, whose markup carries an antiforgery token — so the request
 * succeeds, the "body" is a page of HTML, and reading `questionnaires` off it
 * used to produce a confident empty list. A non-object body is refused here
 * instead. See `get_questionnaires`'s `unverified` note in the registry.
 */

import { findRequest, type RawResponse } from '../../core/rawResponse';
import type { Processor } from '../../processors/processor';
import { list, rec } from '../../processors/read';

export const GET_QUESTIONNAIRE_LIST_PATH = '/Questionnaire/GetQuestionnaireList';

export interface QuestionnairesStandard {
  questionnaires: unknown[];
}

export const questionnairesProcessor: Processor<QuestionnairesStandard> = {
  standard(raw: RawResponse): QuestionnairesStandard {
    const record = findRequest(raw, GET_QUESTIONNAIRE_LIST_PATH);
    const body = record?.body;
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new Error(
        `${GET_QUESTIONNAIRE_LIST_PATH} answered with ${record ? 'a non-JSON body' : 'nothing'}, ` +
          'which is how an instance that no longer serves the legacy Questionnaire activity ' +
          'responds. Refusing to report "no questionnaires" from it.',
      );
    }
    return { questionnaires: list(rec(body).questionnaires) };
  },
  concise: (standard) => standard,
};
