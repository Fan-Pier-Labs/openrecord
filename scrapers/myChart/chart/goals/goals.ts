import type { MyChartRequest } from '../../core/myChartRequest';
import { RawCollector, type RawResponse } from '../../core/rawResponse';
import {
  LOAD_CARE_TEAM_GOALS_PATH,
  LOAD_PATIENT_GOALS_PATH,
  goalsProcessor,
  type GoalsStandard,
} from './goals.processor';

export type { GoalsStandard, GoalSource } from './goals.processor';
export { goalsProcessor, LOAD_CARE_TEAM_GOALS_PATH, LOAD_PATIENT_GOALS_PATH } from './goals.processor';

/**
 * `GET /app/goals` for the token, then `POST /api/goals/LoadCareTeamGoals` and
 * `POST /api/goals/LoadPatientGoals`. Real MyChart keys each list by its own
 * name (`careTeamGoals` / `patientGoals`); see the processor for what is and is
 * not known about the elements.
 *
 * `FullLoad: true` is the goals *activity's* request for care-team goals, as
 * against the bare `{}` the health-summary widget sends for its abbreviated
 * list (`epic.px.client.goals`). Neither the whole list nor the abbreviated one
 * is a superset of the other by construction, so the activity's is the one to
 * ask for.
 *
 * Neither call is allowed to fail the whole read: one captured instance answers
 * `LoadPatientGoals` with HTTP 500 every time while care-team goals load fine,
 * and the processor names a failed endpoint rather than calling it empty.
 */
export async function fetchGoalsRaw(mychartRequest: MyChartRequest): Promise<RawResponse> {
  const collector = new RawCollector(mychartRequest);
  const token = await collector.pageToken('/app/goals');
  await collector.postJson(LOAD_CARE_TEAM_GOALS_PATH, token, { FullLoad: true });
  await collector.postJson(LOAD_PATIENT_GOALS_PATH, token, {});
  return collector.toRaw();
}

/** The standard object — what `mode: 'json'` returns. */
export async function getGoals(mychartRequest: MyChartRequest): Promise<GoalsStandard> {
  return goalsProcessor.standard(await fetchGoalsRaw(mychartRequest));
}
