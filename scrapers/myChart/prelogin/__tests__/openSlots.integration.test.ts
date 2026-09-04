/**
 * The anonymous slot search and its screening questionnaire, over real HTTP.
 *
 * The unit tests cover the parsers against a mocked transport. This covers the
 * part only a socket reaches: the three ways a live instance refuses a search,
 * each of which this scraper learned the hard way by probing real hosts and
 * none of which a mock would have caught.
 *
 *   1. Bracket-encoded nesting instead of Epic's dots.
 *   2. A provider/department pair the reason for visit does not cover.
 *   3. A gated visit type, until the decision tree's answer id arrives.
 *
 * Plus the `ContinueInfo` paging loop, which a mock can only fake.
 *
 * Requires fake-mychart running on FAKE_MYCHART_HOST (default localhost:4000).
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { MyChartRequest } from '../../core/myChartRequest';
import { resetFakeMyChart } from '../../__tests__/fake-mychart/mountMode';
import { fetchOpenSlots, fetchProviderAvailability } from '../openSlots';
import { postForm, PreloginEndpointError } from '../preloginSession';
import { fetchSchedulingQuestionnaire, submitSchedulingAnswers } from '../schedulingQuestionnaire';
import { resolveSchedulingContext } from '../schedulingContext';
import type { QuestionAnswer } from '../types';

const HOST = process.env.FAKE_MYCHART_HOST ?? 'localhost:4000';

/** A request pointed at the fake, with discovery already done. */
function request(): MyChartRequest {
  const req = new MyChartRequest(HOST);
  req.protocol = 'http';
  req.firstPathPart = 'MyChart';
  return req;
}

/** Walk the tree by always answering "No", the way the reference org's flow goes. */
async function answerEverything(specialty: string) {
  let questionnaire = await fetchSchedulingQuestionnaire(request(), { specialty });
  const answers: QuestionAnswer[] = [];
  while (!questionnaire.complete && questionnaire.nextQuestion) {
    const question = questionnaire.nextQuestion;
    const no = question.choices.find((c) => c.text === 'No');
    if (!no) throw new Error(`no "No" choice on ${question.prompt}`);
    answers.push({ questionId: question.id, choiceIndex: no.index });
    questionnaire = await submitSchedulingAnswers(request(), answers, { specialty });
  }
  return { questionnaire, answers };
}

describe('anonymous slot search over HTTP', () => {
  beforeAll(async () => {
    await resetFakeMyChart(HOST);
  });
  afterAll(async () => {
    await resetFakeMyChart(HOST);
  });

  it('searches an ungated specialty and pages to the end', async () => {
    const result = await fetchOpenSlots(request(), { specialty: 'Cardiology', maxPages: 5 });

    expect(result.errorCode).toBeNull();
    expect(result.complete).toBe(true);
    expect(result.slots.length).toBeGreaterThan(0);
    // Every slot joins back onto the directory and carries a usable instant.
    for (const slot of result.slots) {
      expect(slot.providerId).toMatch(/^WP-/);
      expect(slot.clinicId).toMatch(/^WP-/);
      expect(new Date(slot.startUtc ?? '').getTime()).toBeGreaterThan(0);
      expect(slot.lengthInMinutes).toBe(30);
    }
  });

  it('follows the ContinueInfo cursor rather than stopping at the first page', async () => {
    // The fake returns one pair per call, so more than one pair means paging.
    const oneCall = await fetchOpenSlots(request(), { specialty: 'Primary Care', maxPages: 1, answerToken: await tokenFor('Primary Care') });
    const allCalls = await fetchOpenSlots(request(), { specialty: 'Primary Care', maxPages: 5, answerToken: await tokenFor('Primary Care') });

    expect(allCalls.pages).toBeGreaterThan(1);
    expect(allCalls.slots.length).toBeGreaterThan(oneCall.slots.length);
    expect(allCalls.complete).toBe(true);
  });

  it('narrows to a single provider', async () => {
    const all = await fetchOpenSlots(request(), { specialty: 'Cardiology', maxPages: 5 });
    const providerId = all.slots[0]!.providerId;
    const mine = await fetchProviderAvailability(request(), providerId, { specialty: 'Cardiology', maxPages: 5 });

    expect(mine.slots.length).toBeGreaterThan(0);
    expect(mine.slots.every((s) => s.providerId === providerId)).toBe(true);
  });

  it('is refused when the payload uses jQuery brackets instead of Epic dots', async () => {
    // The bug that shipped: `encodeForm` wrote `outer[inner]`, which the two
    // lenient endpoints bind and this one does not.
    const context = await resolveSchedulingContext(request(), { specialty: 'Cardiology' });
    const pair = context.pairs[0]!;
    const bracketed =
      `workflow[Type]=2&appointmentBuilder[Appointments][0][VisitTypeId]=${encodeURIComponent(context.visitTypeId ?? '')}` +
      `&appointmentBuilder[Appointments][0][ProviderDepartmentPairs][0][ProviderId]=${encodeURIComponent(pair.ProviderId)}` +
      `&appointmentBuilder[Appointments][0][ProviderDepartmentPairs][0][DepartmentId]=${encodeURIComponent(pair.DepartmentId)}`;

    const req = request();
    const page = await req.makeRequest({ path: '/OpenScheduling' });
    await page.text();
    const response = await req.makeRequest({
      method: 'POST',
      path: '/Scheduling/Anonymous/GetSlots',
      body: bracketed,
      followRedirects: false,
      headers: {
        __RequestVerificationToken: context.token ?? '',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });
    expect(response.status).not.toBe(200);
  });

  it('is refused when a pair the reason does not cover is sent', async () => {
    const context = await resolveSchedulingContext(request(), { specialty: 'Cardiology' });
    const covered = new Set(context.reason?.DirectProviderDepartmentPairIDs ?? []);
    const uncovered = context.pairs.find((p) => !covered.has(`${p.ProviderId}^${p.DepartmentId}`));
    expect(uncovered).toBeDefined();

    // Bypasses fetchOpenSlots, which filters these out — that filter is the fix.
    await expect(
      postForm(
        request(),
        '/Scheduling/Anonymous/GetSlots',
        context.token,
        {
          workflow: { Type: 2, IsAnonymous: true },
          appointmentBuilder: {
            Appointments: [{ VisitTypeId: context.visitTypeId, ProviderDepartmentPairs: [uncovered], Slot: '' }],
            SpecialtyId: context.specialty.id,
          },
          startDte: 0,
        },
        '/OpenScheduling',
      ),
    ).rejects.toBeInstanceOf(PreloginEndpointError);
  });
});

describe('the screening questionnaire over HTTP', () => {
  beforeAll(async () => {
    await resetFakeMyChart(HOST);
  });

  it('refuses a gated specialty with LqfAnswersRequired and surfaces the question', async () => {
    const result = await fetchOpenSlots(request(), { specialty: 'Primary Care', maxPages: 1 });

    expect(result.errorCode).toBe('LqfAnswersRequired');
    expect(result.slots).toEqual([]);
    expect(result.questionnaire?.nextQuestion?.prompt).toMatch(/life threatening emergency/i);
  });

  it('reports no questionnaire on a specialty the org does not gate', async () => {
    const questionnaire = await fetchSchedulingQuestionnaire(request(), { specialty: 'Cardiology' });
    expect(questionnaire.required).toBe(false);
    expect(questionnaire.complete).toBe(true);
    expect(questionnaire.nextQuestion).toBeNull();
  });

  it('publishes the window a client should ask a date within', async () => {
    const questionnaire = await fetchSchedulingQuestionnaire(request(), { specialty: 'Primary Care' });
    expect(questionnaire.window).toEqual({ earliestDaysOut: 0, latestDaysOut: 120, explicit: true });
  });

  it('walks the tree one question at a time and ends with a token', async () => {
    const { questionnaire, answers } = await answerEverything('Primary Care');

    expect(answers.length).toBeGreaterThan(1);
    expect(questionnaire.complete).toBe(true);
    expect(questionnaire.answerToken?.lqfIds).toHaveLength(1);
    expect(questionnaire.answerToken?.patientAnswerIds).toHaveLength(1);
    expect(questionnaire.questions.map((q) => q.prompt)).toEqual([
      expect.stringMatching(/life threatening emergency/i),
      expect.stringMatching(/seen at Springfield General/i),
    ]);
  });

  it('unlocks the search with the token, from a session that never walked the tree', async () => {
    const { questionnaire } = await answerEverything('Primary Care');
    // A brand new request: the token has to stand on its own, which is what
    // lets a client ask its questions across a restart.
    const result = await fetchOpenSlots(request(), {
      specialty: 'Primary Care',
      answerToken: questionnaire.answerToken!,
      maxPages: 5,
    });

    expect(result.errorCode).toBeNull();
    expect(result.questionnaire).toBeNull();
    expect(result.slots.length).toBeGreaterThan(0);
  });

  it('ends the walk without a token when the answer routes out of scheduling', async () => {
    const first = await fetchSchedulingQuestionnaire(request(), { specialty: 'Primary Care' });
    const yes = first.nextQuestion!.choices.find((c) => c.text === 'Yes')!;
    const result = await submitSchedulingAnswers(
      request(),
      [{ questionId: first.nextQuestion!.id, choiceIndex: yes.index }],
      { specialty: 'Primary Care' },
    );

    // An emergency is not booked a routine slot. The traversal finished, so
    // there is nothing left to ask — but no id was issued, so the search stays
    // gated. `complete` with a null `answerToken` is how a caller sees that.
    expect(result.complete).toBe(true);
    expect(result.nextQuestion).toBeNull();
    expect(result.answerToken).toBeNull();
  });
});

/** The answer token for a gated specialty, for tests that only need the search. */
async function tokenFor(specialty: string) {
  const { questionnaire } = await answerEverything(specialty);
  return questionnaire.answerToken!;
}
