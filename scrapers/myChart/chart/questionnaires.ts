import type { MyChartRequest } from '../core/myChartRequest';
import { RawCollector, type RawResponse } from '../core/rawResponse';
import { questionnairesProcessor, type QuestionnairesStandard } from './questionnaires.processor';

export type { QuestionnairesStandard } from './questionnaires.processor';
export { questionnairesProcessor } from './questionnaires.processor';

/**
 * `GET /Questionnaire` for the token, then `POST /Questionnaire/GetQuestionnaireList`.
 * `docs/api-surface-gaps.md` also saw a React-era `/api/questionnaire/GetQuestionnaireList`
 * return data on a probed account, so the endpoint itself may change.
 */
export async function fetchQuestionnairesRaw(mychartRequest: MyChartRequest): Promise<RawResponse> {
  const collector = new RawCollector(mychartRequest);
  const token = await collector.pageToken('/Questionnaire');
  await collector.postJson('/Questionnaire/GetQuestionnaireList', token, {});
  return collector.toRaw();
}

/** The standard object — what `mode: 'json'` returns. */
export async function getQuestionnaires(mychartRequest: MyChartRequest): Promise<QuestionnairesStandard> {
  return questionnairesProcessor.standard(await fetchQuestionnairesRaw(mychartRequest));
}
