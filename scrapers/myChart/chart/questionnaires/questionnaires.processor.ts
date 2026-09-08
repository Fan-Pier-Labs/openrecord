/**
 * Questionnaires processor. Field decisions: docs/processor-layer-proposal.md,
 * `get_questionnaires`.
 *
 * `GetQuestionnaireList` answers with four lists rather than one, and they are
 * kept apart under MyChart's own names because they are different answers:
 * `assignedQuestionnaires` were given to the patient to fill in,
 * `optionalQuestionnaires` are offered and never due, `questionnaireContextLists`
 * regroups assigned entries by whatever assigned them (an appointment, a care
 * journey, a letter), and `completedQuestionnaires` are done.
 *
 * The assigned and optional element shapes come from four live captures. Every
 * captured `completedQuestionnaires` was `[]`, so its elements pass through
 * whole (rule 10) until one is seen.
 *
 * `context` says what a questionnaire hangs off, so it stays; `isProxyAccessing`
 * describes the caller rather than the chart, and the six top-level flags
 * (`showSeriesText`, `showBackButton`, `showPretext`, `messageQnrExpired`,
 * `callingApp`, `sourceActivity`) describe the activity Epic was rendering.
 * `disablePastResponse` and `index` are the same kind of thing on an element.
 */

import { bodyOf, type RawResponse } from '../../core/rawResponse';
import type { Processor } from '../../processors/processor';
import { boolOrNull, list, num, rec, textOrNull } from '../../processors/read';

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

function questionnaireOf(value: unknown): QuestionnaireStandard {
  const q = rec(value);
  return {
    type: num(q.type),
    isContextSpecific: boolOrNull(q.isContextSpecific),
    preText: textOrNull(q.preText),
    postText: textOrNull(q.postText),
    isPreTextSmartText: boolOrNull(q.isPreTextSmartText),
    isPostTextSmartText: boolOrNull(q.isPostTextSmartText),
    status: num(q.status),
    rootName: textOrNull(q.rootName),
    id: textOrNull(q.id),
    name: textOrNull(q.name),
  };
}

function assignedOf(value: unknown): AssignedQuestionnaireStandard {
  const entry = rec(value);
  return {
    dueDateISO: textOrNull(entry.dueDateISO),
    apptDateISO: textOrNull(entry.apptDateISO),
    isHistory: boolOrNull(entry.isHistory),
    seriesData: rec(entry.seriesData),
    hxData: rec(entry.hxData),
    displayNameOverride: textOrNull(entry.displayNameOverride),
    isTravelScreening: boolOrNull(entry.isTravelScreening),
    context: rec(entry.context),
    questionnaire: {
      ...questionnaireOf(entry.questionnaire),
      filterType: textOrNull(rec(entry.questionnaire).filterType),
    },
  };
}

function optionalOf(value: unknown): OptionalQuestionnaireStandard {
  const entry = rec(value);
  return {
    description: textOrNull(entry.description),
    context: rec(entry.context),
    questionnaire: questionnaireOf(entry.questionnaire),
  };
}

export const questionnairesProcessor: Processor<QuestionnairesStandard> = {
  standard(raw: RawResponse): QuestionnairesStandard {
    const body = rec(bodyOf(raw, 'GetQuestionnaireList'));
    return {
      assignedQuestionnaires: list(body.assignedQuestionnaires).map(assignedOf),
      optionalQuestionnaires: list(body.optionalQuestionnaires).map(optionalOf),
      questionnaireContextLists: list(body.questionnaireContextLists).map((value) => {
        const contextList = rec(value);
        return {
          listContext: rec(contextList.listContext),
          assignedQuestionnaires: list(contextList.assignedQuestionnaires).map(assignedOf),
        };
      }),
      completedQuestionnaires: list(body.completedQuestionnaires),
    };
  },
  concise(standard) {
    const named = (q: QuestionnaireStandard) => ({ id: q.id, name: q.name, status: q.status });
    const assigned = (a: AssignedQuestionnaireStandard) => ({
      dueDateISO: a.dueDateISO,
      displayNameOverride: a.displayNameOverride,
      questionnaire: named(a.questionnaire),
    });
    return {
      assignedQuestionnaires: standard.assignedQuestionnaires.map(assigned),
      optionalQuestionnaires: standard.optionalQuestionnaires.map((o) => ({
        description: o.description,
        questionnaire: named(o.questionnaire),
      })),
      questionnaireContextLists: standard.questionnaireContextLists.map((l) => ({
        assignedQuestionnaires: l.assignedQuestionnaires.map(assigned),
      })),
      completedQuestionnaires: standard.completedQuestionnaires,
    };
  },
};
