/**
 * What the `questionnaires` capabilities return: the standard objects the processors
 * build from MyChart's responses. MyChart's own shapes are in
 * `./mychart.types.ts`.
 */

/** The questionnaire itself, as it appears on an optional entry. */
export interface QuestionnaireStandard {
  type: number | null;
  isContextSpecific: boolean | null;
  preText: string | null;
  postText: string | null;
  isPreTextSmartText: boolean | null;
  isPostTextSmartText: boolean | null;
  status: number | null;
  rootName: string | null;
  id: string | null;
  name: string | null;
}

/** An assigned entry's questionnaire carries one field an optional one does not. */
export interface AssignedQuestionnaireDetailStandard extends QuestionnaireStandard {
  filterType: string | null;
}

export interface AssignedQuestionnaireStandard {
  dueDateISO: string | null;
  apptDateISO: string | null;
  isHistory: boolean | null;
  /** Series and past responses, whole. */
  seriesData: Record<string, unknown>;
  /** Which history activity assigned it, whole. */
  hxData: Record<string, unknown>;
  displayNameOverride: string | null;
  isTravelScreening: boolean | null;
  /** What the questionnaire hangs off (appointment, care journey, letter), whole. */
  context: Record<string, unknown>;
  questionnaire: AssignedQuestionnaireDetailStandard;
}

export interface OptionalQuestionnaireStandard {
  description: string | null;
  context: Record<string, unknown>;
  questionnaire: QuestionnaireStandard;
}

export interface QuestionnaireContextListStandard {
  listContext: Record<string, unknown>;
  assignedQuestionnaires: AssignedQuestionnaireStandard[];
}

export interface QuestionnairesStandard {
  assignedQuestionnaires: AssignedQuestionnaireStandard[];
  optionalQuestionnaires: OptionalQuestionnaireStandard[];
  questionnaireContextLists: QuestionnaireContextListStandard[];
  /** Uncaptured element shape: passed through whole. */
  completedQuestionnaires: unknown[];
}
