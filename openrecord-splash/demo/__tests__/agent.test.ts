/**
 * The demo's agent loop.
 *
 * The loop is a port of the iOS app's, so these tests pin the behaviour that
 * actually matters when a cheap model misbehaves: prose gets ignored rather
 * than crashing the turn, write tools can't be smuggled into a read batch, and
 * a dead model proxy surfaces an honest error instead of inventing one.
 */

import { describe, expect, test } from 'bun:test';
import {
  buildSystemPrompt,
  createProxyCompleter,
  extractToolCalls,
  isExclusiveTool,
  runTurn,
  isAffirmative,
  stripProtocolChatter,
} from '../src/agent';
import { createSession } from '../src/tools';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

/** A completer that replays a fixed script of model turns. */
function scriptedModel(turns: string[]) {
  const seen: { messages: Any[]; system: string }[] = [];
  let i = 0;
  const complete = async (messages: Any[], system: string) => {
    seen.push({ messages: structuredClone(messages), system });
    return turns[Math.min(i++, turns.length - 1)];
  };
  return { complete, seen, calls: () => i };
}

const respond = (text: string) => JSON.stringify({ tool: 'respond', args: { text } });

describe('extractToolCalls', () => {
  test('pulls a single call out of a bare JSON turn', () => {
    expect(extractToolCalls('{"tool":"get_profile","args":{}}')).toEqual([{ tool: 'get_profile', args: {} }]);
  });

  test('pulls multiple calls out of one turn', () => {
    const calls = extractToolCalls('{"tool":"get_billing","args":{}}\n{"tool":"get_messages","args":{"limit":50}}');
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual({ tool: 'get_messages', args: { limit: 50 } });
  });

  test('sees through markdown code fences', () => {
    const calls = extractToolCalls('```json\n{"tool":"get_vitals","args":{}}\n```');
    expect(calls).toEqual([{ tool: 'get_vitals', args: {} }]);
  });

  test('ignores prose wrapped around a call rather than failing the turn', () => {
    const calls = extractToolCalls('Sure! Let me look that up.\n{"tool":"get_allergies","args":{}}\nOne moment.');
    expect(calls).toEqual([{ tool: 'get_allergies', args: {} }]);
  });

  test('handles nested objects in args', () => {
    const calls = extractToolCalls('{"tool":"send_message","args":{"meta":{"a":{"b":1}},"subject":"hi"}}');
    expect((calls[0].args.meta as { a: { b: number } }).a.b).toBe(1);
  });

  test('braces inside strings do not confuse the scanner', () => {
    const calls = extractToolCalls('{"tool":"respond","args":{"text":"use {\\"tool\\": ...} to call a tool"}}');
    expect(calls).toHaveLength(1);
    expect(calls[0].args.text).toContain('use {"tool": ...}');
  });

  test('malformed JSON and non-tool objects are dropped', () => {
    expect(extractToolCalls('{"tool":}')).toEqual([]);
    expect(extractToolCalls('{"name":"get_profile"}')).toEqual([]);
    expect(extractToolCalls('{"tool":123,"args":{}}')).toEqual([]);
  });

  test('calls wrapped in a JSON array still parse', () => {
    // The scanner works on balanced top-level objects, so a model that wraps
    // its turn in an array gets the same treatment rather than a failed turn.
    const calls = extractToolCalls('[{"tool":"get_profile","args":{}},{"tool":"get_vitals","args":{}}]');
    expect(calls.map((c: Any) => c.tool)).toEqual(['get_profile', 'get_vitals']);
  });

  test('a call with no args object gets an empty one', () => {
    expect(extractToolCalls('{"tool":"get_profile"}')).toEqual([{ tool: 'get_profile', args: {} }]);
  });

  test('a stray closing brace in prose resyncs instead of derailing', () => {
    const calls = extractToolCalls('oops } stray\n{"tool":"get_goals","args":{}}');
    expect(calls).toEqual([{ tool: 'get_goals', args: {} }]);
  });

  test('empty and nullish input yield nothing', () => {
    expect(extractToolCalls('')).toEqual([]);
    expect(extractToolCalls(null)).toEqual([]);
  });
});

describe('isExclusiveTool', () => {
  test('respond and every write tool are exclusive', () => {
    for (const name of ['respond', 'send_message', 'send_reply', 'request_refill', 'book_appointment', 'add_emergency_contact']) {
      expect(isExclusiveTool(name)).toBe(true);
    }
  });

  test('reads are batchable', () => {
    for (const name of ['get_profile', 'get_lab_results', 'get_billing']) {
      expect(isExclusiveTool(name)).toBe(false);
    }
  });
});

describe('stripProtocolChatter', () => {
  test('drops a leading apology about the output format', () => {
    expect(stripProtocolChatter('I apologize for the error. Your A1c is 7.2%.')).toBe('Your A1c is 7.2%.');
    expect(stripProtocolChatter('Sorry, I used the wrong format. Here are your meds.')).toBe('Here are your meds.');
  });

  test('drops the follow-up promise that usually trails it', () => {
    const raw = 'I apologize again for the error. I will be more careful.\n\nHere is your summary.';
    expect(stripProtocolChatter(raw)).toBe('Here is your summary.');
  });

  test('keeps an apology that is about the patient, not the protocol', () => {
    const raw = "I'm sorry to hear you have been feeling unwell. Your last visit was on 2026-01-10.";
    expect(stripProtocolChatter(raw)).toBe(raw);
  });

  test('keeps an apology that is not at the start', () => {
    const raw = 'Your A1c is 7.2%. I apologize for the earlier error in that number.';
    expect(stripProtocolChatter(raw)).toBe(raw);
  });

  test('drops a leading acknowledgement of the JSON instruction', () => {
    // The model talking to the protocol instead of the patient. Surfacing this
    // verbatim is the bug this guards: a patient asked "hi" and was told the
    // assistant would ensure its responses were in JSON format.
    const raw =
      'I understand. I will ensure all my responses are in JSON format. How can I help you today?';
    expect(stripProtocolChatter(raw)).toBe('How can I help you today?');
  });

  test('returns empty when the message is nothing but chatter', () => {
    // Callers use '' as "no answer here" and fall back, because showing the
    // machinery to a patient is worse than an honest miss.
    expect(stripProtocolChatter('I apologize for the error.')).toBe('');
    expect(stripProtocolChatter('Understood. I will use the correct JSON format.')).toBe('');
    expect(stripProtocolChatter('Got it.')).toBe('');
  });

  test('keeps an acknowledgement that is about the patient', () => {
    const raw = 'I understand your concern about the cholesterol result. It is 210 mg/dL.';
    expect(stripProtocolChatter(raw)).toBe(raw);
  });

  test('an acknowledgement opener is not chatter without a protocol word', () => {
    // These read like chatter and are not. Widening the topic list to generic
    // words ("request", "again", "error") ate all three — the second one
    // entirely, leaving the patient with nothing.
    for (const raw of [
      'I will send that request to your doctor. It should be answered in 2 days.',
      'I will check again for new results tomorrow.',
      'I see an error in your lab report. The units look wrong.',
      'Sure, here are your medications: Atorvastatin, Lisinopril.',
    ]) {
      expect(stripProtocolChatter(raw)).toBe(raw);
    }
  });

  test('leaves ordinary replies untouched', () => {
    const raw = '## Medications\n\n**Atorvastatin 40mg** — 3 refills left';
    expect(stripProtocolChatter(raw)).toBe(raw);
  });
});

describe('isAffirmative', () => {
  test('accepts a plain yes', () => {
    for (const yes of ['yes', 'Yes', 'yep', 'ok', 'sure', 'go ahead', 'send it', 'yes please']) {
      expect(isAffirmative(yes)).toBe(true);
    }
  });

  test('fails closed on anything else', () => {
    // A missed yes costs a turn; a false positive sends a real message.
    for (const notYes of ['no', 'not yet', "don't", 'cancel', 'wait', 'what am i on?', '', '   ']) {
      expect(isAffirmative(notYes)).toBe(false);
    }
  });

  test('a yes with a caveat is not a yes', () => {
    expect(isAffirmative('yes but change the subject first')).toBe(false);
    expect(isAffirmative('ok, send it to a different doctor')).toBe(false);
  });
});

describe('buildSystemPrompt', () => {
  test('lists the tools and the JSON protocol', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('get_lab_results');
    expect(prompt).toContain('respond(text)');
    expect(prompt).toContain('{ "tool": "<tool_name>", "args": { ... } }');
  });

  test('omits account-management tools the assistant should not drive', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).not.toContain('complete_2fa(');
    expect(prompt).not.toContain('connect_instance(');
  });

  test('formatting guidance differs per surface', () => {
    expect(buildSystemPrompt({ surface: 'ios' })).toContain('narrow phone screen');
    expect(buildSystemPrompt({ surface: 'desktop' })).toContain('desktop chat window');
  });

  test('the memory digest and skill playbook are injected when supplied', () => {
    const prompt = buildSystemPrompt({ memoryDigest: 'DIGEST-MARKER', skillAddition: 'PLAYBOOK-MARKER' });
    expect(prompt).toContain('DIGEST-MARKER');
    expect(prompt).toContain('PLAYBOOK-MARKER');
  });

  test('neither section appears when not supplied', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).not.toContain('invoked a specific skill');
    expect(prompt).not.toContain('Patient digest from prior sessions');
  });
});

describe('runTurn', () => {
  const base = () => ({ session: createSession(), userText: 'what are my meds?', history: [] });

  test('a respond-only turn returns its text with no tool calls', async () => {
    const model = scriptedModel([respond('Here you go.')]);
    const result = await runTurn({ ...base(), complete: model.complete });

    expect(result.text).toBe('Here you go.');
    expect(result.toolCalls).toHaveLength(0);
  });

  test('reads run, then their results are fed back for the reply', async () => {
    const model = scriptedModel([
      '{"tool":"get_medications","args":{}}',
      respond('You take four medications.'),
    ]);
    const result = await runTurn({ ...base(), complete: model.complete });

    expect(result.text).toBe('You take four medications.');
    expect(result.toolCalls.map((c: Any) => c.tool)).toEqual(['get_medications']);

    // The second model turn must actually see the tool output.
    const secondTurn = model.seen[1].messages.at(-1).content;
    expect(secondTurn).toContain('Result of get_medications');
    expect(secondTurn).toContain('Atorvastatin');
  });

  test('a batch of reads runs in one round trip', async () => {
    const model = scriptedModel([
      '{"tool":"get_billing","args":{}}\n{"tool":"get_insurance","args":{}}',
      respond('done'),
    ]);
    const result = await runTurn({ ...base(), complete: model.complete });

    expect(result.toolCalls.map((c: Any) => c.tool)).toEqual(['get_billing', 'get_insurance']);
    expect(model.calls()).toBe(2);
  });

  test('a write tool batched with a read is rejected and retried', async () => {
    const model = scriptedModel([
      '{"tool":"get_medications","args":{}}\n{"tool":"request_refill","args":{"medication_name":"Atorvastatin"}}',
      respond('ok'),
    ]);
    const session = createSession();
    const result = await runTurn({ ...base(), session, complete: model.complete });

    // Nothing ran, and the refill count is untouched.
    expect(result.toolCalls).toHaveLength(0);
    expect(session.medications[0].refillsRemaining).toBe(3);
    expect(model.seen[1].messages.at(-1).content).toContain('must be called alone');
  });

  test('respond batched with anything else is rejected and retried', async () => {
    const model = scriptedModel([
      `{"tool":"get_profile","args":{}}\n${respond('too early')}`,
      respond('after retry'),
    ]);
    const result = await runTurn({ ...base(), complete: model.complete });

    expect(result.text).toBe('after retry');
    expect(result.toolCalls).toHaveLength(0);
    expect(model.seen[1].messages.at(-1).content).toContain('`respond` is exclusive');
  });

  test('a write tool called alone executes and mutates the session', async () => {
    const args = { medication_name: 'Atorvastatin' };
    const model = scriptedModel([
      JSON.stringify({ tool: 'request_refill', args }),
      respond('Refill submitted.'),
    ]);
    const session = createSession();
    const result = await runTurn({
      ...base(),
      session,
      userText: 'yes',
      pendingWrite: { tool: 'request_refill', args },
      complete: model.complete,
    });

    expect(result.text).toBe('Refill submitted.');
    expect(session.medications[0].refillsRemaining).toBe(2);
  });

  test('a tool error is fed back so the model can recover', async () => {
    const args = { medication_name: 'Metformin' };
    const model = scriptedModel([
      JSON.stringify({ tool: 'request_refill', args }),
      respond('That one has no refills left.'),
    ]);
    const result = await runTurn({
      ...base(),
      userText: 'yes',
      pendingWrite: { tool: 'request_refill', args },
      complete: model.complete,
    });

    expect(result.text).toBe('That one has no refills left.');
    expect(model.seen[1].messages.at(-1).content).toContain('no refills remaining');
  });

  test('prose is re-prompted, then surfaced verbatim if the model never complies', async () => {
    const model = scriptedModel(['Your medications are Atorvastatin and Lisinopril.']);
    const result = await runTurn({ ...base(), complete: model.complete });

    // Three attempts before giving up, matching the iOS client.
    expect(model.calls()).toBe(3);
    expect(result.text).toBe('Your medications are Atorvastatin and Lisinopril.');
  });

  test('a turn that is pure protocol chatter never reaches the user', async () => {
    // The reported leak: greeted with "hi", the model acknowledged the JSON
    // instruction instead of using it, and the acknowledgement was shown to
    // the patient. Nothing about the machinery may survive to result.text.
    const model = scriptedModel([
      'I understand. I will ensure all my responses are in JSON format.',
      'Understood. I will use the correct format from now on.',
      'I apologize for the error.',
    ]);
    const result = await runTurn({ ...base(), complete: model.complete });

    expect(result.text).not.toContain('JSON');
    expect(result.text).not.toContain('format');
    expect(result.text).not.toContain('apologize');
    expect(result.text).toBe("I couldn't put that together — try rephrasing?");
  });

  test('a real answer buried under chatter is surfaced without it', async () => {
    const model = scriptedModel([
      'I understand. I will ensure all my responses are in JSON format. Your A1c is 7.2%.',
    ]);
    const result = await runTurn({ ...base(), complete: model.complete });

    expect(result.text).toBe('Your A1c is 7.2%.');
  });

  test('a write is held for confirmation instead of running', async () => {
    // The reported failure: asked "what am i on?", the model fired a write.
    // The payload must be put to the user and nothing may reach the session.
    const session = createSession();
    const before = structuredClone(session.messages);
    const model = scriptedModel([
      '{"tool":"send_message","args":{"recipient_name":"Dr. Julius Hibbert","subject":"Refill","message_body":"Please refill my Metformin."}}',
    ]);
    const result = await runTurn({
      ...base(),
      session,
      userText: 'what am i on?',
      complete: model.complete,
    });

    expect(result.toolCalls).toHaveLength(0);
    expect(session.messages).toEqual(before);
    expect(result.pendingWrite?.tool).toBe('send_message');
    expect(result.text).toContain('send_message');
    expect(result.text).toContain('Please refill my Metformin.');
  });

  test('a held write runs once the user says yes', async () => {
    const session = createSession();
    const pendingWrite = {
      tool: 'send_message',
      args: { recipient_name: 'Dr. Julius Hibbert', subject: 'Refill', message_body: 'Please refill my Metformin.' },
    };
    const model = scriptedModel([
      JSON.stringify({ tool: 'send_message', args: pendingWrite.args }),
      respond('Sent.'),
    ]);
    const result = await runTurn({
      ...base(),
      session,
      userText: 'yes',
      pendingWrite,
      complete: model.complete,
    });

    expect(result.toolCalls.map((c: Any) => c.tool)).toEqual(['send_message']);
    expect(result.text).toBe('Sent.');
    expect(result.pendingWrite ?? null).toBeNull();
  });

  test('a yes approves only the exact payload it was shown', async () => {
    // Approval must not become a blank cheque: a model that swaps the body
    // after the user agrees has to ask again.
    const session = createSession();
    const model = scriptedModel([
      '{"tool":"send_message","args":{"recipient_name":"Dr. Julius Hibbert","subject":"Refill","message_body":"Something else entirely."}}',
    ]);
    const result = await runTurn({
      ...base(),
      session,
      userText: 'yes',
      pendingWrite: {
        tool: 'send_message',
        args: { recipient_name: 'Dr. Julius Hibbert', subject: 'Refill', message_body: 'Please refill my Metformin.' },
      },
      complete: model.complete,
    });

    // The approved payload ran, exactly as shown. The swapped one did not —
    // it is held for its own confirmation.
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].args.message_body).toBe('Please refill my Metformin.');
    expect(result.pendingWrite?.args.message_body).toBe('Something else entirely.');
    expect(session.messages.some((m: Any) => m.body === 'Something else entirely.')).toBe(false);
  });

  test('the approved write runs from the stored payload, not the model re-emit', async () => {
    // The model rewording the body on re-emit must not run a second copy, and
    // must not bounce the user back into another confirmation for work that is
    // already done.
    const session = createSession();
    const args = { recipient_name: 'Dr. Julius Hibbert', subject: 'Refill', message_body: 'Please refill my Metformin.' };
    const model = scriptedModel([
      JSON.stringify({ tool: 'send_message', args: { ...args, message_body: 'Reworded on re-emit.' } }),
      respond('Sent.'),
    ]);
    const result = await runTurn({
      ...base(),
      session,
      userText: 'yes',
      pendingWrite: { tool: 'send_message', args },
      complete: model.complete,
    });

    expect(result.text).toBe('Sent.');
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].args.message_body).toBe('Please refill my Metformin.');
    expect(session.messages.filter((m: Any) => m.subject === 'Refill')).toHaveLength(1);
  });

  test('reads are never gated', async () => {
    const model = scriptedModel(['{"tool":"get_medications","args":{}}', respond('Four medications.')]);
    const result = await runTurn({ ...base(), complete: model.complete });

    expect(result.toolCalls.map((c: Any) => c.tool)).toEqual(['get_medications']);
    expect(result.pendingWrite ?? null).toBeNull();
  });

  test('the fullest prose attempt wins, not the last one', async () => {
    // Re-prompting a model that answered in prose often yields something much
    // shorter and less useful. Keeping the best attempt is the whole point.
    const model = scriptedModel([
      'Your A1c is 7.2%, up from 6.8% in July and 6.4% in December 2024.',
      'I can help with that. What would you like to know?',
      'Sure.',
    ]);
    const result = await runTurn({ ...base(), complete: model.complete });

    expect(result.text).toContain('7.2%');
    expect(result.text).not.toContain('What would you like to know');
  });

  test('running out of turns surfaces real prose over the housekeeping message', async () => {
    // Reads forever, but slipped a real answer in on the second turn.
    let n = 0;
    const complete = async () => {
      n += 1;
      if (n === 2) return 'Your cholesterol panel shows LDL 172, which is above the target of 130.';
      return '{"tool":"get_profile","args":{}}';
    };
    const result = await runTurn({ ...base(), complete });

    expect(result.text).toContain('LDL 172');
    expect(result.text).not.toContain('more steps than I have room for');
  });

  test('a model that recovers after one prose turn is not penalised', async () => {
    const model = scriptedModel(['I will look that up.', respond('Four medications.')]);
    const result = await runTurn({ ...base(), complete: model.complete });
    expect(result.text).toBe('Four medications.');
  });

  test('an empty respond still produces something to show', async () => {
    const model = scriptedModel([JSON.stringify({ tool: 'respond', args: { text: '   ' } })]);
    expect((await runTurn({ ...base(), complete: model.complete })).text).toBe('Done.');
  });

  test('tool events fire in order for the UI', async () => {
    const model = scriptedModel(['{"tool":"get_allergies","args":{}}', respond('ok')]);
    const events: string[] = [];
    await runTurn({
      ...base(),
      complete: model.complete,
      callbacks: {
        onToolStart: (c: Any) => events.push(`start:${c.tool}`),
        onToolEnd: (r: Any) => events.push(`end:${r.tool}`),
      },
    });
    expect(events).toEqual(['start:get_allergies', 'end:get_allergies']);
  });

  test('the loop gives up rather than spinning forever', async () => {
    // A model that only ever emits reads and never responds.
    const model = scriptedModel(['{"tool":"get_profile","args":{}}']);
    const result = await runTurn({ ...base(), complete: model.complete });

    expect(result.text).toContain('one thing at a time');
    expect(result.toolCalls.length).toBeLessThanOrEqual(8);
  });
});

describe('a failing model surfaces an error rather than inventing an answer', () => {
  test('a proxy failure propagates and notifies', async () => {
    const dead = async () => {
      throw new Error('502 Bad Gateway');
    };
    let notified: Error | null = null;

    await expect(
      runTurn({
        session: createSession(),
        userText: 'show me my lab results',
        history: [],
        complete: dead,
        callbacks: { onError: (err: Error) => (notified = err) },
      }),
    ).rejects.toThrow('502 Bad Gateway');

    expect(notified).toBeTruthy();
  });

  test('a failure part-way through still reports the tools that already ran', async () => {
    // The UI shows the activity panel regardless, so the calls must not be lost.
    let n = 0;
    const flaky = async () => {
      n += 1;
      if (n === 1) return '{"tool":"get_medications","args":{}}';
      throw new Error('rate limited');
    };

    const records: string[] = [];
    await expect(
      runTurn({
        session: createSession(),
        userText: 'meds?',
        history: [],
        complete: flaky,
        callbacks: { onToolEnd: (r: Any) => records.push(r.tool) },
      }),
    ).rejects.toThrow('rate limited');

    expect(records).toEqual(['get_medications']);
  });

  test('an abort propagates as an abort', async () => {
    const aborted = async () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    };
    await expect(
      runTurn({ session: createSession(), userText: 'hi', history: [], complete: aborted }),
    ).rejects.toThrow('aborted');
  });
});

describe('createProxyCompleter', () => {
  test('posts the provider-neutral shape and returns the text', async () => {
    let captured: Any;
    const original = globalThis.fetch;
    globalThis.fetch = (async (_url: string, init: Any) => {
      captured = JSON.parse(init.body);
      return new Response(JSON.stringify({ text: 'hello', model: 'test' }), { status: 200 });
    }) as Any;

    try {
      const complete = createProxyCompleter('https://example.invalid');
      const text = await complete([{ role: 'user', content: 'hi' }], 'SYSTEM');
      expect(text).toBe('hello');
      expect(captured.system).toBe('SYSTEM');
      expect(captured.messages).toEqual([{ role: 'user', content: 'hi' }]);
    } finally {
      globalThis.fetch = original;
    }
  });

  test('a non-200 raises with the status attached', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: 'rate limited' }), { status: 429 })) as Any;

    try {
      const complete = createProxyCompleter('https://example.invalid');
      await expect(complete([{ role: 'user', content: 'hi' }], '')).rejects.toThrow('rate limited');
    } finally {
      globalThis.fetch = original;
    }
  });
});
