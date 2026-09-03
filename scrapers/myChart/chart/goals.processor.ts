/**
 * Goals processor. Field decisions: docs/processor-layer-proposal.md, `get_goals`.
 *
 * Both element shapes are unverified — care-team goals were `[]` on every
 * capture, and the captured patient-goal element (`goalId`, `goalType`,
 * `readings[]`, …) has none of the display fields the fake invents — so
 * elements pass through whole with only `source` added (rule 10).
 */

import { bodyOf, type RawResponse } from '../core/rawResponse';
import type { Processor } from '../processors/processor';
import { list, rec } from '../processors/read';

export type GoalSource = 'care_team' | 'patient';

export interface GoalsStandard {
  careTeamGoals: Array<Record<string, unknown> & { source: 'care_team' }>;
  patientGoals: Array<Record<string, unknown> & { source: 'patient' }>;
}

export const goalsProcessor: Processor<GoalsStandard> = {
  standard(raw: RawResponse): GoalsStandard {
    const careTeam = rec(bodyOf(raw, 'LoadCareTeamGoals'));
    const patient = rec(bodyOf(raw, 'LoadPatientGoals'));
    return {
      careTeamGoals: list(careTeam.careTeamGoals).map((g) => ({ ...rec(g), source: 'care_team' as const })),
      patientGoals: list(patient.patientGoals).map((g) => ({ ...rec(g), source: 'patient' as const })),
    };
  },
  concise: (standard) => standard,
};
