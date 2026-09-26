/**
 * What the `goals` capabilities return: the standard objects the processors
 * build from MyChart's responses. MyChart's own shapes are in
 * `./mychart.types.ts`.
 */

export type GoalSource = 'care_team' | 'patient';

export interface GoalsStandard {
  careTeamGoals: Array<Record<string, unknown> & { source: 'care_team' }>;
  patientGoals: Array<Record<string, unknown> & { source: 'patient' }>;
  /**
   * Derived: the endpoints that did not answer, by path. Non-empty means the
   * matching list is "not known", not "empty" — see the note above.
   */
  unavailable: string[];
}
