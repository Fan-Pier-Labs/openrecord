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
import { openPreloginPage, postForm } from './preloginSession';
import { OPEN_SCHEDULING_PATH } from './providerDirectory';
import { resolveSchedulingContext, type SchedulingContext, type SchedulingSelector } from './schedulingContext';
import type { QuestionAnswer, SchedulingQuestion, SchedulingQuestionnaire } from './types';

const NEXT_STEP_PATH = '/DecisionTrees/AnonymousDecisionTree/NextStep';

/** `TraversalSourceWorkflow` for open scheduling, as the live page sends it. */
const SOURCE_WORKFLOW_OPEN_SCHEDULING = 5;

/** The `NewProvider` workflow, the same `2` the slot search sends as `Type`. */
const SCHEDULING_WORKFLOW_TYPE_NEW_PROVIDER = 2;

type QuestionnaireWalk = {
  /** The tree id — `LqfIds` for the slot search. */
  treeId: string;
  /** `PatientAnswerIds` for the slot search. Null if none was issued. */
  treeAnswerId: string | null;
  /** Every question the walk saw, in order. */
  questions: SchedulingQuestion[];
  /** The question that stopped the walk because no answer was supplied. */
  unanswered: SchedulingQuestion | null;
  /**
   * The tree reached its end. Not the same as having an answer id: a tree can
   * finish deliberately without one, which is how an org routes an emergency
   * out of online scheduling rather than booking it a routine slot.
   */
  traversalComplete: boolean;
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
    // ResponseType 8 is the choice list every captured scheduling tree used;
    // a question offering no choices at all is one that wants typing.
    freeText: (raw.Choices ?? []).length === 0,
    helpText: raw.HelpText?.trim() || null,
  };
}

/**
 * The `question` field of a `NextStep` post: the question's identity echoed
 * back, with the answer under `Answer`. The prompt and choice list are
 * deliberately not sent back — the live page does not send them either.
 *
 * The shape comes from Epic's own serializer rather than from guessing at the
 * wire. `ChoiceCollection.convertToCoreChoiceArray` walks every choice and
 * pushes the selected ones, and `Choice.convertToCoreChoiceModel` reduces each
 * to `{ Index }` — so one selection and five are the same call, and a
 * multi-response question is answered with more entries. A free-text question
 * sets `Answer.Text` alongside those choices.
 */
export function answerPayload(raw: RawQuestion, answer: QuestionAnswer): Record<string, unknown> {
  const indexes = answer.choiceIndex === undefined ? [] : [answer.choiceIndex].flat();
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
    Answer: {
      Choices: indexes.map((Index) => ({ Index })),
      ...(answer.text === undefined ? {} : { Text: answer.text }),
    },
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
  options: { token: string | null; treeId: string; visitTypeId: string | null; answers?: QuestionAnswer[] },
): Promise<QuestionnaireWalk> {
  const { token, treeId, visitTypeId, answers = [] } = options;
  const byQuestion = new Map(answers.map((a) => [a.questionId, a]));
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
      return { treeId, treeAnswerId, questions, unanswered: null, traversalComplete: true };
    }

    const question = parseQuestion(rawQuestion);
    if (!question) {
      return { treeId, treeAnswerId: null, questions, unanswered: null, traversalComplete: true };
    }
    questions.push(question);

    const answer = byQuestion.get(question.id);
    if (answer === undefined) {
      logger.debug(`questionnaire on ${request.hostname} needs an answer for ${JSON.stringify(question.prompt)}`);
      return { treeId, treeAnswerId: null, questions, unanswered: question, traversalComplete: false };
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
      question: answerPayload(rawQuestion, answer),
    };
  }

  throw new Error(`scheduling questionnaire on ${request.hostname} did not finish within ${MAX_STEPS} steps`);
}

// ── The two calls a client makes ─────────────────────────────────────────────

function toQuestionnaire(
  context: Pick<SchedulingContext, 'specialty' | 'reason' | 'window' | 'treeId' | 'visitTypeId'>,
  walk: QuestionnaireWalk | null,
): SchedulingQuestionnaire {
  const shared = {
    specialty: context.specialty,
    reasonForVisit: context.reason?.Title ?? null,
    window: context.window,
    treeId: context.treeId,
    visitTypeId: context.visitTypeId,
  };
  if (!walk) {
    return { ...shared, required: false, nextQuestion: null, questions: [], complete: true, answerToken: null };
  }
  return {
    ...shared,
    required: true,
    nextQuestion: walk.unanswered,
    questions: walk.questions,
    complete: walk.traversalComplete,
    answerToken: walk.treeAnswerId ? { lqfIds: [walk.treeId], patientAnswerIds: [walk.treeAnswerId] } : null,
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
  const walk = await walkSchedulingQuestionnaire(request, { token: context.token, treeId: context.treeId, visitTypeId: context.visitTypeId });
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
  from: SchedulingQuestionnaire | SchedulingSelector = {},
): Promise<SchedulingQuestionnaire> {
  // Handed the previous round's questionnaire, this needs nothing from the
  // specialty payload — it already carries the tree and visit type — so it
  // opens the page for an antiforgery token and walks. That matters: a
  // specialty payload is 0.6–2 MB, and a three-question tree would otherwise
  // download one per answer.
  if (isQuestionnaire(from)) {
    if (!from.treeId) return { ...from, nextQuestion: null, complete: true };
    const page = await openPreloginPage(request, OPEN_SCHEDULING_PATH);
    const walk = await walkSchedulingQuestionnaire(request, { token: page.token, treeId: from.treeId, visitTypeId: from.visitTypeId, answers });
    return toQuestionnaire(
      {
        specialty: from.specialty,
        reason: from.reasonForVisit === null ? null : { Id: '', Title: from.reasonForVisit },
        window: from.window,
        treeId: from.treeId,
        visitTypeId: from.visitTypeId,
      },
      walk,
    );
  }

  const context = await resolveSchedulingContext(request, from);
  if (!context.treeId) return toQuestionnaire(context, null);
  const walk = await walkSchedulingQuestionnaire(request, { token: context.token, treeId: context.treeId, visitTypeId: context.visitTypeId, answers });
  return toQuestionnaire(context, walk);
}

/** A questionnaire carries `required`; a selector never does. */
function isQuestionnaire(from: SchedulingQuestionnaire | SchedulingSelector): from is SchedulingQuestionnaire {
  return typeof (from as SchedulingQuestionnaire).required === 'boolean';
}
