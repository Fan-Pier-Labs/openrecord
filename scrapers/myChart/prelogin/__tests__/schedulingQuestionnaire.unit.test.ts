/**
 * The screening decision tree that gates the slot search on 221 of the 577
 * instances that serve open scheduling.
 *
 * The step shapes here are cut from a live capture. The `RestartTree`
 * assertion is the important one: the server echoes the flag back as `true`,
 * and sending that again restarts the traversal, so the walk re-serves
 * question one until it gives up.
 */
import { describe, expect, it } from 'bun:test';

import { createMockRequest, jsonResponse } from '../../auth/__tests__/mockMyChartRequest';
import { answerPayload, parseQuestion, walkSchedulingQuestionnaire } from '../schedulingQuestionnaire';

const QUESTION_ONE = {
  ID: 'Q1',
  DAT: 'DAT1',
  Prompt: 'Do you think you are having a life threatening emergency?',
  HelpText: '',
  QuestionType: 2,
  ResponseType: 8,
  IsRequired: true,
  IsMultiResponse: false,
  IsTrigger: false,
  IsEnabled: true,
  DisplayStyle: '',
  DisplayStyleVal: 0,
  Choices: [
    { Index: '1', Text: 'Yes' },
    { Index: '2', Text: 'No' },
  ],
};

const QUESTION_TWO = { ...QUESTION_ONE, ID: 'Q2', DAT: 'DAT2', Prompt: 'Do you currently have a PCP?' };

/** The traversal cursor, echoing `RestartTree: true` the way the server does. */
const traversal = (over: Record<string, unknown> = {}) => ({
  TreeID: 'TREE-1',
  TreeAnswerID: 'ANSWER-1',
  SourceWorkflow: 5,
  RestartTree: true,
  TreeWasDirty: false,
  TreeWasLocked: false,
  IsTraversalComplete: false,
  ...over,
});

function mockTree(steps: unknown[]) {
  let n = 0;
  const handle = createMockRequest(
    { '/DecisionTrees/AnonymousDecisionTree/NextStep': () => jsonResponse(steps[n++] ?? {}) },
    { firstPathPart: 'MyChart-SGH' },
  );
  const posts = () =>
    handle
      .callsTo('/DecisionTrees/AnonymousDecisionTree/NextStep')
      .map((c) => Object.fromEntries(new URLSearchParams(c.body ?? '')));
  return { request: handle.req, posts };
}

describe('parseQuestion', () => {
  it('flattens a question to its prompt and choices', () => {
    expect(parseQuestion(QUESTION_ONE)).toEqual({
      id: 'Q1',
      prompt: 'Do you think you are having a life threatening emergency?',
      choices: [
        { index: '1', text: 'Yes' },
        { index: '2', text: 'No' },
      ],
      required: true,
      multiResponse: false,
      helpText: null,
    });
  });

  it('is null without an id to answer against', () => {
    expect(parseQuestion({ Prompt: 'orphan' })).toBeNull();
    expect(parseQuestion(null)).toBeNull();
  });
});

describe('answerPayload', () => {
  it('echoes the question identity and carries the chosen index', () => {
    const payload = answerPayload(QUESTION_ONE, '2');
    expect(payload).toMatchObject({ ID: 'Q1', DAT: 'DAT1', QuestionType: 2, ResponseType: 8 });
    expect(payload.Answer).toEqual({ Choices: [{ Index: '2' }] });
    // The page does not send the prompt or the choice list back.
    expect(payload).not.toHaveProperty('Prompt');
    expect(payload).not.toHaveProperty('Choices');
  });
});

describe('walkSchedulingQuestionnaire', () => {
  it('reads the first question and stops when nothing answers it', async () => {
    const { request, posts } = mockTree([{ NextInputNode: { CSN: 'C1', ID: 'N1', Type: 1, IsFirst: true, Question: QUESTION_ONE }, TraversalInfo: traversal() }]);
    const walk = await walkSchedulingQuestionnaire(request, 'tok', 'TREE-1', 'VT-1');

    expect(walk.complete).toBe(false);
    expect(walk.treeAnswerId).toBeNull();
    expect(walk.unanswered?.id).toBe('Q1');
    expect(posts()).toHaveLength(1);
  });

  it('sends the AdditionalContext block the endpoint refuses to work without', async () => {
    const { request, posts } = mockTree([{ NextInputNode: { Question: QUESTION_ONE }, TraversalInfo: traversal() }]);
    await walkSchedulingQuestionnaire(request, 'tok', 'TREE-1', 'VT-1');

    expect(posts()[0]).toMatchObject({
      'traversalInfo.TreeID': 'TREE-1',
      'traversalInfo.SourceWorkflow': '5',
      'traversalInfo.RestartTree': 'true',
      'traversalInfo.AdditionalContext.VisitTypeID': 'VT-1',
      'traversalInfo.AdditionalContext.SchedulingWorkflowType': '2',
      'traversalInfo.AdditionalContext.IsGuest': 'false',
    });
  });

  it('clears RestartTree after the opening step, so the walk advances', async () => {
    const { request, posts } = mockTree([
      { NextInputNode: { CSN: 'C1', ID: 'N1', Type: 1, IsFirst: true, Question: QUESTION_ONE }, TraversalInfo: traversal() },
      { NextInputNode: { CSN: 'C2', ID: 'N2', Type: 1, Question: QUESTION_TWO }, TraversalInfo: traversal({ RestartTree: false }) },
    ]);
    const walk = await walkSchedulingQuestionnaire(request, 'tok', 'TREE-1', 'VT-1', [{ questionId: 'Q1', choiceIndex: '2' }]);

    expect(walk.unanswered?.id).toBe('Q2');
    expect(walk.questions.map((q) => q.id)).toEqual(['Q1', 'Q2']);
    // The server echoed RestartTree true; re-sending it would restart the tree.
    expect(posts()[0]!['traversalInfo.RestartTree']).toBe('true');
    expect(posts()[1]!['traversalInfo.RestartTree']).toBe('false');
    expect(posts()[1]!['question.Answer.Choices[0].Index']).toBe('2');
    expect(posts()[1]!['prevInputNode.CSN']).toBe('C1');
    // The previous node's question is nulled, not echoed back.
    expect(posts()[1]!['prevInputNode.Question']).toBeUndefined();
  });

  it('returns the answer id the slot search needs once the tree completes', async () => {
    const { request } = mockTree([
      { NextInputNode: { CSN: 'C1', ID: 'N1', Question: QUESTION_ONE }, TraversalInfo: traversal() },
      { NextInputNode: null, TraversalInfo: traversal({ IsTraversalComplete: true, TreeAnswerID: 'HQA-9' }) },
    ]);
    const walk = await walkSchedulingQuestionnaire(request, 'tok', 'TREE-1', 'VT-1', [{ questionId: 'Q1', choiceIndex: '2' }]);

    expect(walk.complete).toBe(true);
    expect(walk.treeAnswerId).toBe('HQA-9');
    expect(walk.unanswered).toBeNull();
  });

  it('fails loudly when the tree re-serves a question it already answered', async () => {
    // What a stuck traversal looks like: the same question, over and over.
    const step = { NextInputNode: { CSN: 'C1', ID: 'N1', Question: QUESTION_ONE }, TraversalInfo: traversal() };
    const { request } = mockTree([step, step, step]);

    await expect(
      walkSchedulingQuestionnaire(request, 'tok', 'TREE-1', 'VT-1', [{ questionId: 'Q1', choiceIndex: '2' }]),
    ).rejects.toThrow(/re-served an answered question/);
  });
});
