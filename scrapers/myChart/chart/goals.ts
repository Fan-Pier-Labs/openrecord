import type { MyChartRequest } from './../core/myChartRequest';
import { RawCollector, type RawResponse } from '../core/rawResponse';
import { goalsProcessor, type GoalsStandard } from './goals.processor';

export type { GoalsStandard, GoalSource } from './goals.processor';
export { goalsProcessor } from './goals.processor';

/**
 * `GET /app/goals` for the token, then `POST /api/goals/LoadCareTeamGoals` and
 * `POST /api/goals/LoadPatientGoals`. Real MyChart keys each list by its own
 * name (`careTeamGoals` / `patientGoals`); see the processor for what is and is
 * not known about the elements.
 */
export async function fetchGoalsRaw(mychartRequest: MyChartRequest): Promise<RawResponse> {
  const collector = new RawCollector(mychartRequest);
  const token = await collector.pageToken('/app/goals');
  await collector.postJson('/api/goals/LoadCareTeamGoals', token, {});
  await collector.postJson('/api/goals/LoadPatientGoals', token, {});
  return collector.toRaw();
}

/** The standard object — what `mode: 'json'` returns. */
export async function getGoals(mychartRequest: MyChartRequest): Promise<GoalsStandard> {
  return goalsProcessor.standard(await fetchGoalsRaw(mychartRequest));
}
