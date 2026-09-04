/**
 * The screening questionnaire some orgs put in front of open scheduling.
 *
 * When an org attaches a decision tree to a visit type, `GetSlots` refuses the
 * search with `ErrorCode: "LqfAnswersRequired"` until the tree has been walked
 * and its answer id is included. This is the single most common reason a
 * scheduling-enabled instance returns nothing: 221 of the 577 instances that
 * serve the workflow answer that code.
 *
 * The tree lives on a different route family from everything else here —
 * `DecisionTrees/AnonymousDecisionTree/…` rather than `Scheduling/Anonymous/…`
 * — and is walked one question at a time:
 *
 *   POST DecisionTrees/AnonymousDecisionTree/NextStep
 *        traversalInfo{…}          the cursor, echoed from the last response
 *        prevInputNode{…}          the node just answered, with Question nulled
 *        question{…}               that node's question, carrying the answer
 *     → NextInputNode{Question{Prompt, Choices[]}}, TraversalInfo{TreeAnswerID, …}
 *
 * The tree id is not a separate lookup: it is `AnonymousSchedulingDecisionTreeId`
 * on the visit type, already present in `GetSpecialtyData`. When the walk
 * finishes, `TraversalInfo.TreeAnswerID` is the id `GetSlots` wants as
 * `PatientAnswerIds`, alongside the tree id as `LqfIds`.
 *
 * ## Why this does not answer for you
 *
 * These are clinical screening questions — "Do you think you are having a life
 * threatening emergency?" is the first one on the instance this was built
 * against. Guessing the answer that keeps the funnel moving would put words in
 * a patient's mouth and could route a real emergency into a routine
 * appointment. So the questions are surfaced and the caller supplies answers;
 * nothing here picks one on its own.
 */

import type { MyChartRequest } from '../core/myChartRequest';
import { logger } from '../../../shared/logger';
import { postForm } from './preloginSession';
import { OPEN_SCHEDULING_PATH } from './providerDirectory';
import { resolveSchedulingContext, type SchedulingSelector } from './schedulingContext';
import type { SchedulingWindow, Specialty } from './types';

const NEXT_STEP_PATH = '/DecisionTrees/AnonymousDecisionTree/NextStep';

/** `TraversalSourceWorkflow` for open scheduling, as the live page sends it. */
const SOURCE_WORKFLOW_OPEN_SCHEDULING = 5;

/** The `NewProvider` workflow, the same `2` the slot search sends as `Type`. */
const SCHEDULING_WORKFLOW_TYPE_NEW_PROVIDER = 2;

/** One choice a question offers. `index` is what an answer refers to. */
export type QuestionChoice = { index: string; text: string };

/** A question the tree asked, flattened to what a caller needs to answer it. */
export type SchedulingQuestion = {
  /** Opaque question id. Stable across sessions on the instances checked. */
  id: string;
  prompt: string;
  choices: QuestionChoice[];
  required: boolean;
  multiResponse: boolean;
  helpText: string | null;
};

/** How a caller answers: the choice `index` for a given question. */
export type QuestionAnswer = { questionId: string; choiceIndex: string };

export type QuestionnaireWalk = {
  /** The tree id — `LqfIds` for the slot search. */
  treeId: string;
  /** `PatientAnswerIds` for the slot search. Null if the walk did not finish. */
  treeAnswerId: string | null;
  /** Every question the walk saw, in order. */
  questions: SchedulingQuestion[];
  /** The question that stopped the walk because no answer was supplied. */
  unanswered: SchedulingQuestion | null;
  complete: boolean;
};

// ── Raw shapes ───────────────────────────────────────────────────────────────

type RawChoice = { Index?: string | null; Text?: string | null };

type RawQuestion = {
  ID?: string | null;
  DAT?: string | null;
  Prompt?: string | null;
  HelpText?: string | null;
  Choices?: RawChoice[] | null;
  QuestionType?: number;
  ResponseType?: number;
  IsRequired?: boolean;
  IsMultiResponse?: boolean;
  IsTrigger?: boolean;
  IsEnabled?: boolean;
  DisplayStyle?: string | null;
  DisplayStyleVal?: number;
};

type RawInputNode = {
  CSN?: string | null;
  ID?: string | null;
  Type?: number;
  IsFirst?: boolean;
  DeclutterNavigationButtons?: boolean;
  Question?: RawQuestion | null;
};

type RawTraversalInfo = Record<string, unknown> & {
  TreeID?: string;
  TreeAnswerID?: string | null;
  IsTraversalComplete?: boolean;
};

type RawNextStep = { NextInputNode?: RawInputNode | null; TraversalInfo?: RawTraversalInfo | null };

// ── Parsing ──────────────────────────────────────────────────────────────────

export function parseQuestion(raw: RawQuestion | null | undefined): SchedulingQuestion | null {
  if (!raw || typeof raw.ID !== 'string') return null;
  return {
    id: raw.ID,
    prompt: raw.Prompt?.trim() ?? '',
    choices: (raw.Choices ?? [])
      .filter((c): c is RawChoice => typeof c?.Index === 'string')
      .map((c) => ({ index: c.Index!, text: c.Text?.trim() ?? '' })),
    required: raw.IsRequired === true,
    multiResponse: raw.IsMultiResponse === true,
    helpText: raw.HelpText?.trim() || null,
  };
}

/**
 * The `question` field of a `NextStep` post: the question's identity echoed
 * back, with the chosen choice under `Answer`. The prompt and choice list are
 * deliberately not sent back — the live page does not send them either.
 */
export function answerPayload(raw: RawQuestion, choiceIndex: string): Record<string, unknown> {
  return {
    ID: raw.ID,
    DAT: raw.DAT,
    QuestionType: raw.QuestionType,
    ResponseType: raw.ResponseType,
    IsRequired: raw.IsRequired,
    IsMultiResponse: raw.IsMultiResponse,
    IsTrigger: raw.IsTrigger,
    IsEnabled: raw.IsEnabled,
    DisplayStyle: raw.DisplayStyle ?? '',
    DisplayStyleVal: raw.DisplayStyleVal ?? 0,
    Answer: { Choices: [{ Index: choiceIndex }] },
  };
}

// ── Walking ──────────────────────────────────────────────────────────────────

/** Guard against a tree that never reports itself complete. */
const MAX_STEPS = 25;

/**
 * Walk a scheduling decision tree, answering with `answers` as far as they go.
 *
 * With no answers this is a read: it returns the first question and stops, so
 * a caller can show the questionnaire before deciding anything. With answers
 * it walks until the tree completes or reaches a question nothing answers.
 */
export async function walkSchedulingQuestionnaire(
  request: MyChartRequest,
  token: string | null,
  treeId: string,
  visitTypeId: string | null,
  answers: QuestionAnswer[] = [],
): Promise<QuestionnaireWalk> {
  const byQuestion = new Map(answers.map((a) => [a.questionId, a.choiceIndex]));
  const questions: SchedulingQuestion[] = [];
  /**
   * Questions already answered in this walk.
   *
   * A tree that re-serves an answered question is not advancing, and answering
   * it again would spin until `MAX_STEPS` — so a repeat fails loudly instead.
   * The bug this caught was `RestartTree` being echoed back as `true`; the
   * guard stays because a silent 25-step spin is the worst way to find out.
   */
  const answered = new Set<string>();

  let traversalInfo: Record<string, unknown> = {
    TreeID: treeId,
    IsTraversalComplete: false,
    SourceWorkflow: SOURCE_WORKFLOW_OPEN_SCHEDULING,
    TreeWasDirty: false,
    TreeWasLocked: false,
    RestartTree: true,
    UseInProgress: '',
    // Not optional: without the whole AdditionalContext block the endpoint
    // answers the release error surface rather than the first question. The
    // empty strings are what the live page sends for a fresh anonymous walk.
    AdditionalContext: {
      VisitTypeID: visitTypeId ?? '',
      TicketID: '',
      OriginalApptDAT: '',
      FavoriteApptDAT: '',
      OrdersString: '',
      IsGuest: false,
      SchedulingWorkflowType: SCHEDULING_WORKFLOW_TYPE_NEW_PROVIDER,
      IsAuthenticatedWidget: false,
    },
  };
  let body: Record<string, unknown> = { traversalInfo };

  for (let step = 0; step < MAX_STEPS; step++) {
    const data = await postForm<RawNextStep>(request, NEXT_STEP_PATH, token, body, OPEN_SCHEDULING_PATH);
    // The response echoes `RestartTree: true` straight back. Sending that again
    // restarts the traversal, so the walk re-serves question one forever; the
    // live client clears the flag after the opening step and so must this.
    traversalInfo = { ...(data.TraversalInfo ?? {}), RestartTree: false };
    const node = data.NextInputNode ?? null;
    const rawQuestion = node?.Question ?? null;

    if (data.TraversalInfo?.IsTraversalComplete === true || !rawQuestion) {
      const treeAnswerId = (data.TraversalInfo?.TreeAnswerID as string | undefined) ?? null;
      return { treeId, treeAnswerId, questions, unanswered: null, complete: treeAnswerId !== null };
    }

    const question = parseQuestion(rawQuestion);
    if (!question) {
      return { treeId, treeAnswerId: null, questions, unanswered: null, complete: false };
    }
    questions.push(question);

    const choiceIndex = byQuestion.get(question.id);
    if (choiceIndex === undefined) {
      logger.debug(`questionnaire on ${request.hostname} needs an answer for ${JSON.stringify(question.prompt)}`);
      return { treeId, treeAnswerId: null, questions, unanswered: question, complete: false };
    }
    if (answered.has(question.id)) {
      throw new Error(
        `scheduling questionnaire on ${request.hostname} re-served an answered question — ` +
          'the traversal is session state, so walk it on a fresh session rather than reusing one',
      );
    }
    answered.add(question.id);

    body = {
      traversalInfo,
      // The node just answered, with its question stripped — the page nulls it.
      prevInputNode: {
        CSN: node?.CSN,
        ID: node?.ID,
        Type: node?.Type,
        IsFirst: node?.IsFirst,
        DeclutterNavigationButtons: node?.DeclutterNavigationButtons ?? false,
        Question: null,
      },
      question: answerPayload(rawQuestion, choiceIndex),
    };
  }

  throw new Error(`scheduling questionnaire on ${request.hostname} did not finish within ${MAX_STEPS} steps`);
}

// ── The two calls a client makes ─────────────────────────────────────────────

/**
 * The ids a completed questionnaire yields, and what a slot search needs.
 *
 * Verified to survive the session it was produced in: a token walked in one
 * session searched successfully from a second, fresh one. So a client can ask
 * its questions at leisure — across a restart, or a different process — and
 * hand the token back whenever the person has answered.
 */
export type QuestionnaireAnswerToken = {
  lqfIds: string[];
  patientAnswerIds: string[];
};

/**
 * What a client needs to put a questionnaire in front of someone.
 *
 * The questions arrive one at a time because this is a decision tree, not a
 * form: what it asks second depends on the first answer. `nextQuestion` is
 * what to ask now, `questions` is everything seen so far in order, and
 * `complete` with a `token` means the search can run.
 */
export type SchedulingQuestionnaire = {
  /** False when the org attaches no tree — nothing to ask, search directly. */
  required: boolean;
  treeId: string | null;
  /** Ask this next. Null when the walk is finished or nothing is required. */
  nextQuestion: SchedulingQuestion | null;
  /** Every question answered or seen so far, in the order the tree gave them. */
  questions: SchedulingQuestion[];
  complete: boolean;
  /** Present once `complete`; pass it to `fetchOpenSlots`. */
  token: QuestionnaireAnswerToken | null;
  /** Which specialty and reason these questions belong to. */
  specialty: Specialty;
  reasonForVisit: string | null;
  /**
   * How far out this instance will book. A client asking "when would you like
   * to be seen?" should keep the answer inside this window; pass the chosen
   * date to `fetchOpenSlots` as `startDate`.
   */
  window: SchedulingWindow;
};

function toQuestionnaire(
  context: Awaited<ReturnType<typeof resolveSchedulingContext>>,
  walk: QuestionnaireWalk | null,
): SchedulingQuestionnaire {
  const shared = {
    specialty: context.specialty,
    reasonForVisit: context.reason?.Title ?? null,
    window: context.window,
    treeId: context.treeId,
  };
  if (!walk) {
    return { ...shared, required: false, nextQuestion: null, questions: [], complete: true, token: null };
  }
  return {
    ...shared,
    required: true,
    nextQuestion: walk.unanswered,
    questions: walk.questions,
    complete: walk.complete,
    token:
      walk.complete && walk.treeAnswerId
        ? { lqfIds: [walk.treeId], patientAnswerIds: [walk.treeAnswerId] }
        : null,
  };
}

/**
 * Read the screening questionnaire an org puts in front of its availability.
 *
 * Call this first. It asks nothing of the caller and answers nothing itself —
 * it reports whether a questionnaire is required and, if so, hands back the
 * first question to put to a person, plus the window the org will book in.
 *
 * `required: false` means go straight to `fetchOpenSlots`.
 */
export async function fetchSchedulingQuestionnaire(
  request: MyChartRequest,
  selector: SchedulingSelector = {},
): Promise<SchedulingQuestionnaire> {
  const context = await resolveSchedulingContext(request, selector);
  if (!context.treeId) return toQuestionnaire(context, null);
  const walk = await walkSchedulingQuestionnaire(request, context.token, context.treeId, context.visitTypeId);
  return toQuestionnaire(context, walk);
}

/**
 * Submit the answers a person gave, and get back either the next question or
 * the token that unlocks the search.
 *
 * A tree branches, so one round is often not enough: keep calling with the
 * answers gathered so far until `complete`. Answers are replayed from the top
 * each time, which is what makes this safe to call from a fresh session — the
 * traversal itself is server state, but the answer list is the client's.
 */
export async function submitSchedulingAnswers(
  request: MyChartRequest,
  answers: QuestionAnswer[],
  selector: SchedulingSelector = {},
): Promise<SchedulingQuestionnaire> {
  const context = await resolveSchedulingContext(request, selector);
  if (!context.treeId) return toQuestionnaire(context, null);
  const walk = await walkSchedulingQuestionnaire(request, context.token, context.treeId, context.visitTypeId, answers);
  return toQuestionnaire(context, walk);
}
