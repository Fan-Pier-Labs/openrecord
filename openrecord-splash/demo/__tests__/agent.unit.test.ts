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
  describeWrite,
  isDraftRequest,
  extractToolCalls,
  isExclusiveTool,
  resolveWriteDetails,
  runTurn,
  stripProtocolChatter,
} from '../src/agent';
import { TOOL_SPECS, WRITE_TOOL_NAMES, activeRecord, createSession, executeTool } from '../src/tools';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

/** A completer that replays a fixed script of model turns. */
function scriptedModel(turns: string[]) {
  const seen: { messages: Any[]; system: string }[] = [];
  let i = 0;
  const complete = async (messages: Any[], system: string) => {
    seen.push({ messages: structuredClone(messages), system });
    return turns[Math.min(i++, turns.length - 1)]!;
  };
  return { complete, seen, calls: () => i };
}

const respond = (text: string) => JSON.stringify({ tool: 'respond', args: { text } });

/**
 * The loop's cosmetic tool latency, turned off.
 *
 * `runTurn` sleeps for `toolLatencyMs(tool)` before each call so the demo's
 * activity panel is visible long enough to read; nothing here is testing that.
 * Left on, this suite spends ~11 real seconds asleep — and every test added
 * makes it worse — waiting out a delay whose only job is to be seen by a human.
 */
const noLatency = () => 0;

/** Answers the write-confirmation dialog. Records what it was shown. */
function dialog(answer: boolean) {
  const shown: Any[] = [];
  return {
    shown,
    onConfirmWrite: async (write: Any) => {
      shown.push(write);
      return answer;
    },
  };
}

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
    expect((calls[0]!.args.meta as { a: { b: number } }).a.b).toBe(1);
  });

  test('braces inside strings do not confuse the scanner', () => {
    const calls = extractToolCalls('{"tool":"respond","args":{"text":"use {\\"tool\\": ...} to call a tool"}}');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.args.text).toContain('use {"tool": ...}');
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
    // Derived from the catalogue, not listed here: a write added to TOOL_SPECS
    // has to be exclusive from the moment it exists, and a test that named the
    // writes itself would pass while a new one was silently batchable.
    expect(isExclusiveTool('respond')).toBe(true);
    for (const name of WRITE_TOOL_NAMES) {
      expect(isExclusiveTool(name)).toBe(true);
    }
  });

  test('reads are batchable', () => {
    const reads = TOOL_SPECS.filter((t: Any) => !t.write);
    expect(reads.length).toBeGreaterThan(20);
    for (const spec of reads) {
      expect(isExclusiveTool(spec.name)).toBe(false);
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

  test('drops a promise about how it will answer, echoed from our own nudge', () => {
    const raw = 'I will focus on answering your question directly.\n\nYour balance is $420.00.';
    expect(stripProtocolChatter(raw)).toBe('Your balance is $420.00.');
    expect(stripProtocolChatter('I will answer your question directly. You owe $420.')).toBe('You owe $420.');
  });

  test('leaves ordinary replies untouched', () => {
    const raw = '## Medications\n\n**Atorvastatin 40mg** — 3 refills left';
    expect(stripProtocolChatter(raw)).toBe(raw);
  });
});

describe('isDraftRequest', () => {
  test('asking to see a message is not asking to send one', () => {
    for (const t of [
      'Draft a message asking billing for an itemized statement.',
      'draft here',
      'Write a message to Dr. Hibbert about my refill.',
      'Compose a note to Patient Accounts.',
      'Can you prepare a message for billing?',
    ]) {
      expect(isDraftRequest(t)).toBe(true);
    }
  });

  test('an explicit send is not a draft request', () => {
    for (const t of [
      'Draft a message to billing and send it.',
      'Write to Dr. Hibbert and submit it.',
      'Send a message to billing asking for an itemized statement.',
      'yes',
    ]) {
      expect(isDraftRequest(t)).toBe(false);
    }
  });
});

describe('describeWrite', () => {
  test('shows the literal payload, labelled for a patient', () => {
    const shown = describeWrite({
      tool: 'send_message',
      args: {
        recipient_name: 'Dr. Julius Hibbert',
        message_body: 'Please refill my Metformin.',
        instance: 'springfield',
      },
    });

    expect(shown.title).toBe('Send Message');
    expect(shown.verb).toBe('Send');
    expect(shown.fields).toEqual([
      { label: 'Recipient name', value: 'Dr. Julius Hibbert' },
      { label: 'Message body', value: 'Please refill my Metformin.' },
    ]);
  });

  test('hides instance — it is plumbing, not something to approve', () => {
    const shown = describeWrite({ tool: 'request_refill', args: { instance: 'springfield' } });
    expect(shown.fields).toEqual([]);
  });

  test('every write tool has patient-readable copy', () => {
    // A tool with no entry falls back to its raw name, which is a poor thing
    // to show someone being asked to approve it.
    for (const spec of TOOL_SPECS.filter((t: Any) => t.write)) {
      const shown = describeWrite({ tool: spec.name, args: {} });
      expect(shown.title).not.toBe(spec.name);
      expect(shown.description).not.toContain(spec.name);
    }
  });

  test('the dialog reads its copy off the tool spec', () => {
    // The gating is derived: `write` on the spec is what makes a tool stop
    // here, and the same block is what the dialog says. A second table of
    // titles beside the catalogue is how the two used to fall out of step.
    for (const spec of TOOL_SPECS) {
      const meta = spec.write;
      if (!meta) continue;
      const shown = describeWrite({ tool: spec.name, args: {} });
      expect(shown.title).toBe(meta.title);
      expect(shown.description).toBe(meta.description);
      expect(shown.verb).toBe(meta.verb);
    }
  });

  test('appends resolved details after the literal payload', () => {
    const shown = describeWrite({
      tool: 'book_appointment',
      args: { slot_id: 'slot-001', reason: 'Follow-up' },
      details: [{ label: 'Provider', value: 'Dr. Julius Hibbert' }],
    });
    expect(shown.fields).toEqual([
      { label: 'Slot id', value: 'slot-001' },
      { label: 'Reason', value: 'Follow-up' },
      { label: 'Provider', value: 'Dr. Julius Hibbert' },
    ]);
  });
});

describe('resolveWriteDetails', () => {
  test('a booking dialog says who, when and where — not just an opaque slot id', () => {
    const session = createSession();
    const offer = activeRecord(session).availableAppointments[0]!;
    const slot = offer.slots[0]!;

    const details = resolveWriteDetails(session, 'book_appointment', { slot_id: slot.slotId });
    expect(details).toEqual([
      { label: 'Provider', value: offer.provider },
      { label: 'Visit type', value: offer.visitType },
      { label: 'When', value: `${slot.date} at ${slot.time}` },
      { label: 'Location', value: offer.location },
    ]);
  });

  test('an invented slot id gets called out instead of shown bare', () => {
    // Observed live: the model passed slot_id "56789". The dialog should let
    // the user decline a booking that cannot succeed.
    const details = resolveWriteDetails(createSession(), 'book_appointment', { slot_id: '56789' });
    expect(details).toEqual([
      { label: 'Warning', value: '"56789" is not one of the open slot ids — this booking will fail.' },
    ]);
  });

  test('non-booking writes add nothing — their args are already readable', () => {
    const session = createSession();
    expect(resolveWriteDetails(session, 'send_message', { recipient_name: 'Dr. Hibbert' })).toEqual([]);
    expect(resolveWriteDetails(session, 'request_refill', { medication_name: 'Metformin' })).toEqual([]);
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

  test('every listed tool is tagged read or write', () => {
    // The model is told the category of each call, so it knows a write will
    // stop at a dialog before it makes one.
    const prompt = buildSystemPrompt();
    for (const spec of TOOL_SPECS.filter((t: Any) => t.group !== 'Account')) {
      expect(prompt).toContain(`- [${spec.write ? 'write' : 'read'}] ${spec.name}(`);
    }
  });

  test('the exclusivity rule names exactly the write tools', () => {
    // This sentence was a hand-typed list of seven names. It had drifted from
    // the catalogue, so the model was told a tool was exclusive that no longer
    // existed and not told about ones that did. Derive it, and it cannot.
    const prompt = buildSystemPrompt();
    const clause = /^Write tools \(([^)]+)\) and `respond` are EXCLUSIVE/m.exec(prompt);
    expect(clause).not.toBeNull();
    expect(clause![1]!.split(', ')).toEqual(WRITE_TOOL_NAMES);
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
  const base = () => ({
    session: createSession(),
    userText: 'what are my meds?',
    history: [],
    toolLatency: noLatency,
  });

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
    const secondTurn = model.seen[1]!.messages.at(-1).content;
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
    expect(activeRecord(session).medications[0]!.refillsRemaining).toBe(3);
    expect(model.seen[1]!.messages.at(-1).content).toContain('must be called alone');
  });

  test('respond batched with anything else is rejected and retried', async () => {
    const model = scriptedModel([
      `{"tool":"get_profile","args":{}}\n${respond('too early')}`,
      respond('after retry'),
    ]);
    const result = await runTurn({ ...base(), complete: model.complete });

    expect(result.text).toBe('after retry');
    expect(result.toolCalls).toHaveLength(0);
    expect(model.seen[1]!.messages.at(-1).content).toContain('`respond` is exclusive');
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
      complete: model.complete,
      callbacks: dialog(true),
    });

    expect(result.text).toBe('Refill submitted.');
    expect(activeRecord(session).medications[0]!.refillsRemaining).toBe(2);
  });

  test('a tool error is fed back so the model can recover', async () => {
    const args = { medication_name: 'Metformin' };
    const model = scriptedModel([
      JSON.stringify({ tool: 'request_refill', args }),
      respond('That one has no refills left.'),
    ]);
    const result = await runTurn({
      ...base(),
      complete: model.complete,
      callbacks: dialog(true),
    });

    expect(result.text).toBe('That one has no refills left.');
    expect(model.seen[1]!.messages.at(-1).content).toContain('no refills remaining');
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

  test('protocol chatter inside a respond call never reaches the user', async () => {
    // The leak that survived the first fix. A well-formed respond call skips
    // the prose path entirely, so the chatter filter has to run on it too.
    const chatter =
      'I understand. I will ensure all my responses are in JSON format, using the `respond` tool when I need to reply to you.';
    const model = scriptedModel([respond(chatter), respond(chatter), respond(chatter)]);
    const result = await runTurn({ ...base(), complete: model.complete });

    expect(result.text).not.toContain('JSON');
    expect(result.text).not.toContain('respond');
    expect(result.text).toBe("I couldn't put that together — try rephrasing?");
  });

  test('a chatter respond is re-prompted, and a real answer next turn wins', async () => {
    const model = scriptedModel([
      respond('Understood. I will use the correct JSON format from now on.'),
      respond('You take four medications.'),
    ]);
    const result = await runTurn({ ...base(), complete: model.complete });

    expect(result.text).toBe('You take four medications.');
    // The nudge must point at the question, not at the format — telling a weak
    // model "every turn must be JSON" is what produces the chatter.
    const nudge = model.seen[1]!.messages.at(-1).content;
    expect(nudge).toContain('did not answer the question');
    expect(nudge).not.toContain('every turn must be JSON');
  });

  test('chatter wrapped around a real answer keeps the answer', async () => {
    const model = scriptedModel([
      respond('I understand. I will ensure my responses are in JSON format. Your A1c is 7.2%.'),
    ]);
    const result = await runTurn({ ...base(), complete: model.complete });

    expect(result.text).toBe('Your A1c is 7.2%.');
  });

  test('an empty respond after a write is a sign-off, not chatter', async () => {
    const model = scriptedModel([respond('')]);
    const result = await runTurn({ ...base(), complete: model.complete });

    expect(result.text).toBe('Done.');
  });

  test('a write is put to the user and does not run until approved', async () => {
    // The reported failure: asked "what am i on?", the model fired a write.
    // The dialog must be shown the real payload and nothing may reach the
    // session before it is answered.
    const session = createSession();
    const before = structuredClone(activeRecord(session).messages);
    const args = {
      recipient_name: 'Dr. Julius Hibbert',
      subject: 'Refill',
      message_body: 'Please refill my Metformin.',
    };
    const d = dialog(false);
    const model = scriptedModel([
      JSON.stringify({ tool: 'send_message', args }),
      respond('Okay, I have not sent it.'),
    ]);
    const result = await runTurn({
      ...base(),
      session,
      userText: 'what am i on?',
      complete: model.complete,
      callbacks: d,
    });

    expect(d.shown).toEqual([{ tool: 'send_message', args, details: [] }]);
    expect(result.toolCalls).toHaveLength(0);
    expect(activeRecord(session).messages).toEqual(before);
    expect(result.text).toBe('Okay, I have not sent it.');
  });

  test('a decline is fed back so the model stops instead of retrying', async () => {
    const model = scriptedModel([
      JSON.stringify({ tool: 'request_refill', args: { medication_name: 'Atorvastatin' } }),
      respond('No problem, I left it alone.'),
    ]);
    const result = await runTurn({ ...base(), complete: model.complete, callbacks: dialog(false) });

    expect(result.toolCalls).toHaveLength(0);
    const fedBack = model.seen[1]!.messages.at(-1).content;
    expect(fedBack).toContain('User declined to run request_refill');
    expect(fedBack).toContain('Do not retry unless they ask again');
  });

  test('approving runs the write against the session', async () => {
    const session = createSession();
    const args = {
      recipient_name: 'Dr. Julius Hibbert',
      subject: 'Refill',
      message_body: 'Please refill my Metformin.',
    };
    const model = scriptedModel([JSON.stringify({ tool: 'send_message', args }), respond('Sent.')]);
    const result = await runTurn({
      ...base(),
      session,
      complete: model.complete,
      callbacks: dialog(true),
    });

    expect(result.text).toBe('Sent.');
    expect(result.toolCalls.map((c: Any) => c.tool)).toEqual(['send_message']);
    expect(activeRecord(session).messages.filter((m: Any) => m.subject === 'Refill')).toHaveLength(1);
  });

  test('every write is asked about separately — approval is never standing', async () => {
    // No "always allow". A second write in the same turn opens its own dialog.
    const session = createSession();
    const d = dialog(true);
    const model = scriptedModel([
      JSON.stringify({ tool: 'request_refill', args: { medication_name: 'Atorvastatin' } }),
      JSON.stringify({ tool: 'request_refill', args: { medication_name: 'Lisinopril' } }),
      respond('Both requested.'),
    ]);
    await runTurn({ ...base(), session, complete: model.complete, callbacks: d });

    expect(d.shown).toHaveLength(2);
    expect(d.shown.map((w: Any) => w.args.medication_name)).toEqual(['Atorvastatin', 'Lisinopril']);
  });

  test('a surface with no dialog wired runs no writes at all', async () => {
    // Fail shut. The alternative is silently executing unconfirmed writes,
    // which is the bug the dialog exists to prevent.
    const session = createSession();
    const model = scriptedModel([
      JSON.stringify({ tool: 'request_refill', args: { medication_name: 'Atorvastatin' } }),
      respond('I could not do that.'),
    ]);
    const result = await runTurn({ ...base(), session, complete: model.complete });

    expect(result.toolCalls).toHaveLength(0);
    expect(activeRecord(session).medications[0]!.refillsRemaining).toBe(3);
  });

  test('a draft request never sends, and never even offers to', async () => {
    // Both models sent when asked to draft — partly our fault, the prompt used
    // to say "draft a send_message". A sent message cannot be unsent, so the
    // send is refused outright rather than put to a dialog.
    const session = createSession();
    const inboxBefore = activeRecord(session).messages.length;
    const d = dialog(true);
    const model = scriptedModel([
      JSON.stringify({
        tool: 'send_message',
        args: {
          recipient_name: 'Patient Accounts',
          subject: 'Itemized statement',
          message_body: 'Please send an itemized statement for my ER visit.',
        },
      }),
      respond('Here is the draft — shall I send it?'),
    ]);
    const result = await runTurn({
      ...base(),
      session,
      userText: 'Draft a message asking billing for an itemized statement.',
      complete: model.complete,
      callbacks: d,
    });

    expect(d.shown).toHaveLength(0); // not even a dialog
    expect(result.toolCalls).toHaveLength(0);
    expect(activeRecord(session).messages).toHaveLength(inboxBefore); // nothing new in the thread list
    expect(result.text).toBe('Here is the draft — shall I send it?');

    const fedBack = model.seen[1]!.messages.at(-1).content;
    expect(fedBack).toContain('asked you to draft this, not to send it');
  });

  test('a draft-then-send request still sends', async () => {
    const session = createSession();
    const d = dialog(true);
    const args = {
      recipient_name: 'Patient Accounts',
      subject: 'Itemized statement',
      message_body: 'Please send an itemized statement.',
    };
    const model = scriptedModel([JSON.stringify({ tool: 'send_message', args }), respond('Sent.')]);
    const result = await runTurn({
      ...base(),
      session,
      userText: 'Draft a message to billing and send it.',
      complete: model.complete,
      callbacks: d,
    });

    expect(d.shown).toHaveLength(1);
    expect(result.toolCalls.map((c: Any) => c.tool)).toEqual(['send_message']);
  });

  test('a draft request does not block non-sending writes', async () => {
    // "Write down my daughter as an emergency contact" is a draft verb, but
    // add_emergency_contact puts no message in front of a human.
    const session = createSession();
    const d = dialog(true);
    const model = scriptedModel([
      JSON.stringify({
        tool: 'add_emergency_contact',
        args: { name: 'Lisa Simpson', relationship_type: 'Daughter', phone_number: '(555) 636-7666' },
      }),
      respond('Added.'),
    ]);
    await runTurn({
      ...base(),
      session,
      userText: 'Write down my daughter Lisa as an emergency contact at (555) 636-7666.',
      complete: model.complete,
      callbacks: d,
    });

    expect(d.shown.map((w: Any) => w.tool)).toEqual(['add_emergency_contact']);
  });

  test('reads are never gated', async () => {
    const d = dialog(true);
    const model = scriptedModel(['{"tool":"get_medications","args":{}}', respond('Four medications.')]);
    const result = await runTurn({ ...base(), complete: model.complete, callbacks: d });

    expect(result.toolCalls.map((c: Any) => c.tool)).toEqual(['get_medications']);
    expect(d.shown).toHaveLength(0);
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
        toolLatency: noLatency,
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
        toolLatency: noLatency,
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

describe('the switch-patient confirmation dialog', () => {
  test('names both ends of the move, not just the raw argument', () => {
    // `patient: "Bart"` on screen and every later read coming from a different
    // chart is the widest gap between payload and effect of any write here.
    const session = createSession();
    const details = resolveWriteDetails(session, 'switch_proxy_target', { patient: 'Bart' });
    const rows = Object.fromEntries(details.map((d: Any) => [d.label, d.value]));

    expect(rows['Currently reading']).toBe(session.activePatient);
    expect(rows['Will read']).toBe('Bart Simpson');
    expect(rows.Effect).toContain('switch back');
  });

  test('an unreachable patient is called out instead of promised', () => {
    const details = resolveWriteDetails(createSession(), 'switch_proxy_target', { patient: 'Milhouse' });
    const rows = Object.fromEntries(details.map((d: Any) => [d.label, d.value]));

    expect(rows.Warning).toContain('will fail');
    // No effect row: nothing is going to happen, so promising one would be a lie.
    expect(rows['Will read']).toBeUndefined();
    expect(rows.Effect).toBeUndefined();
  });

  test('the dialog resolves the same patient the tool will switch to', () => {
    // Two matchers would eventually disagree, and the disagreement would be a
    // dialog naming one patient and a switch landing on another.
    const session = createSession();
    const rows = Object.fromEntries(
      resolveWriteDetails(session, 'switch_proxy_target', { patient: 'bart' }).map((d: Any) => [d.label, d.value]),
    );
    const result = executeTool(session, 'switch_proxy_target', { patient: 'bart' }) as Any;

    expect(result.switched_to).toBe(rows['Will read']);
  });
});
