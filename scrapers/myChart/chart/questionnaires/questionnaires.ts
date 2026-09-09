import type { MyChartRequest } from '../../core/myChartRequest';
import { RawCollector, type RawResponse } from '../../core/rawResponse';
import { questionnairesProcessor, type QuestionnairesStandard } from './questionnaires.processor';

export type {
  QuestionnairesStandard,
  QuestionnaireStandard,
  AssignedQuestionnaireStandard,
  OptionalQuestionnaireStandard,
  QuestionnaireContextListStandard,
} from './questionnaires.processor';
export { questionnairesProcessor } from './questionnaires.processor';

/**
 * `GET /app/questionnaires` for the token, then `POST /api/questionnaire/GetQuestionnaireList`.
 *
 * The legacy `/Questionnaire` activity this used to call is dead — it answers
 * with Epic's `/Home/Error?code=15` page on all four accounts checked, so the
 * token fetch was the request that failed. The React route answers 200 with the
 * list on the same four, and Epic's own client posts it no request data at all,
 * so the body is `{}`. See README.md.
 */
export async function fetchQuestionnairesRaw(mychartRequest: MyChartRequest): Promise<RawResponse> {
  const collector = new RawCollector(mychartRequest);
  const token = await collector.pageToken('/app/questionnaires');
  await collector.postJson('/api/questionnaire/GetQuestionnaireList', token, {});
  return collector.toRaw();
}

/** The standard object — what `mode: 'json'` returns. */
export async function getQuestionnaires(mychartRequest: MyChartRequest): Promise<QuestionnairesStandard> {
  return questionnairesProcessor.standard(await fetchQuestionnairesRaw(mychartRequest));
}
