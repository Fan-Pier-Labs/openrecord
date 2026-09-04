/**
 * Goals processor. Field decisions: docs/processor-layer-proposal.md, `get_goals`.
 *
 * Two things the endpoints do that a naive read gets wrong, both observed on
 * four live instances:
 *
 * 1. **`LoadPatientGoals` always returns one goal.** Three of the four
 *    accounts, none of which has ever set a health goal, answered with a
 *    single element whose every field is blank (`goalId: ""`, `goalType: 0`,
 *    `readings: []`). It is the empty editable slot the activity renders, not
 *    a goal: `epic.px.client.goals` decides whether the patient has any with
 *    `patientGoals.length > 0 && !isNullOrEmpty(patientGoals[0].text)`, and its
 *    `setPatientGoal` reducer *deletes* an element whose `text` is `''`. So
 *    `text` is the display field, and an element without one is dropped here
 *    the same way — otherwise every patient in the product has exactly one
 *    nameless goal.
 * 2. **`LoadCareTeamGoals` takes `{ FullLoad: true }` for the whole list.**
 *    The bare `{}` the scraper used to post is the health-summary widget's
 *    abbreviated load. Both answered `[]` on all four accounts, so this is
 *    correctness in the request rather than a fix to an observed loss.
 *
 * Element shapes stay pass-through (rule 10): every captured `careTeamGoals`
 * was `[]`, and the only captured `patientGoals` element is the empty slot, so
 * no real element's field set has been seen. `source` is the one added field.
 *
 * A failing endpoint is named in `unavailable` rather than reported as an
 * empty list — one instance answers `LoadPatientGoals` with HTTP 500 on every
 * request, and "you have set no goals" is the wrong thing to say about that.
 */

import { findRequest, type RawResponse } from '../../core/rawResponse';
import type { Processor } from '../../processors/processor';
import { list, rec, text } from '../../processors/read';

export type GoalSource = 'care_team' | 'patient';

export const LOAD_CARE_TEAM_GOALS_PATH = '/api/goals/LoadCareTeamGoals';
export const LOAD_PATIENT_GOALS_PATH = '/api/goals/LoadPatientGoals';

export interface GoalsStandard {
  careTeamGoals: Array<Record<string, unknown> & { source: 'care_team' }>;
  patientGoals: Array<Record<string, unknown> & { source: 'patient' }>;
  /**
   * Derived: the endpoints that did not answer, by path. Non-empty means the
   * matching list is "not known", not "empty" — see the note above.
   */
  unavailable: string[];
}

/**
 * The empty editable slot MyChart returns for a patient with no goals: no
 * display text. The React activity treats exactly this as "no goals".
 */
function isEmptyPatientGoalSlot(goal: Record<string, unknown>): boolean {
  return text(goal.text).trim() === '';
}

export const goalsProcessor: Processor<GoalsStandard> = {
  standard(raw: RawResponse): GoalsStandard {
    const unavailable: string[] = [];

    function envelope(path: string): Record<string, unknown> {
      const record = findRequest(raw, path);
      if (!record || record.status < 200 || record.status >= 300) {
        unavailable.push(path);
        return {};
      }
      return rec(record.body);
    }

    const careTeam = envelope(LOAD_CARE_TEAM_GOALS_PATH);
    const patient = envelope(LOAD_PATIENT_GOALS_PATH);

    return {
      careTeamGoals: list(careTeam.careTeamGoals).map((g) => ({ ...rec(g), source: 'care_team' as const })),
      patientGoals: list(patient.patientGoals)
        .map((g) => rec(g))
        .filter((g) => !isEmptyPatientGoalSlot(g))
        .map((g) => ({ ...g, source: 'patient' as const })),
      unavailable,
    };
  },
  concise: (standard) => standard,
};
