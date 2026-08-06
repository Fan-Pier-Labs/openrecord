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

  test('never strips a reply down to nothing', () => {
    // If the apology *is* the whole message, showing it beats showing a blank.
    const raw = 'I apologize for the error.';
    expect(stripProtocolChatter(raw)).toBe(raw);
  });

  test('leaves ordinary replies untouched', () => {
    const raw = '## Medications\n\n**Atorvastatin 40mg** — 3 refills left';
    expect(stripProtocolChatter(raw)).toBe(raw);
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
    const model = scriptedModel([
      '{"tool":"request_refill","args":{"medication_name":"Atorvastatin"}}',
      respond('Refill submitted.'),
    ]);
    const session = createSession();
    const result = await runTurn({ ...base(), session, complete: model.complete });

    expect(result.text).toBe('Refill submitted.');
    expect(session.medications[0].refillsRemaining).toBe(2);
  });

  test('a tool error is fed back so the model can recover', async () => {
    const model = scriptedModel([
      '{"tool":"request_refill","args":{"medication_name":"Metformin"}}',
      respond('That one has no refills left.'),
    ]);
    const result = await runTurn({ ...base(), complete: model.complete });

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
