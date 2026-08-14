import { makeAuthenticatedRequest } from '../core/makeAuthenticatedRequest';
import type { MyChartRequest } from "../core/myChartRequest";
import { getRequestVerificationTokenFromBody } from "../core/util";
import { logger } from '../../../shared/logger';

export type Goal = {
  name: string;
  description: string;
  status: string;
  startDate: string;
  targetDate: string;
  source: 'care_team' | 'patient';
};

export type GoalsResult = {
  careTeamGoals: Goal[];
  patientGoals: Goal[];
};

type GoalResponse = {
  name?: string;
  description?: string;
  status?: string;
  startDate?: string;
  targetDate?: string;
};

// Real MyChart keys each endpoint's list by its own name — `careTeamGoals`
// from LoadCareTeamGoals and `patientGoals` from LoadPatientGoals. (An earlier
// version read a `goals` key that only the fake served, so this scraper
// returned nothing against every real instance.)
type LoadGoalsResponse = {
  careTeamGoals?: GoalResponse[];
  patientGoals?: GoalResponse[];
};

function mapGoals(goals: GoalResponse[], source: 'care_team' | 'patient'): Goal[] {
  return goals.map(g => ({
    name: g.name || '',
    description: g.description || '',
    status: g.status || '',
    startDate: g.startDate || '',
    targetDate: g.targetDate || '',
    source,
  }));
}

export async function getGoals(mychartRequest: MyChartRequest): Promise<GoalsResult> {
  const pageResp = await makeAuthenticatedRequest(mychartRequest, { path: '/app/goals' });
  const html = await pageResp.text();
  const token = getRequestVerificationTokenFromBody(html);

  if (!token) {
    logger.debug('Could not find request verification token for goals');
    return { careTeamGoals: [], patientGoals: [] };
  }

  const [careTeamResp, patientResp] = await Promise.all([
    makeAuthenticatedRequest(mychartRequest, {
      path: '/api/goals/LoadCareTeamGoals',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        '__RequestVerificationToken': token,
      },
      body: JSON.stringify({}),
    }),
    makeAuthenticatedRequest(mychartRequest, {
      path: '/api/goals/LoadPatientGoals',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        '__RequestVerificationToken': token,
      },
      body: JSON.stringify({}),
    }),
  ]);

  const careTeamJson: LoadGoalsResponse = await careTeamResp.json();
  const patientJson: LoadGoalsResponse = await patientResp.json();

  return {
    careTeamGoals: mapGoals(careTeamJson.careTeamGoals ?? [], 'care_team'),
    patientGoals: mapGoals(patientJson.patientGoals ?? [], 'patient'),
  };
}
