/**
 * The demo's agent loop.
 *
 * This is a faithful port of `expo-app/src/lib/ai/claude-client.ts`: the model
 * never gets a provider-native tool schema. It is prompted to emit JSON objects
 * of the shape `{"tool": "<name>", "args": {...}}`, we parse them out of the raw
 * text, run them, and feed the results back as a user turn. `respond` ends the
 * turn. That protocol is what lets the real app point at any chat model — and
 * it's why the demo can run on the cheapest, fastest model available.
 *
 * Tool calls execute against the local fake record in `tools.ts`. Nothing about
 * the fictional patient is ever sent anywhere; only the conversation text and
 * the tool results the model asked for go to the proxy.
 *
 * Every reply comes from a real model call. There is no canned-response path:
 * a demo that quietly answers from a keyword table produces confident non
 * sequiturs the moment a visitor asks something it didn't anticipate, which is
 * worse than showing an honest error.
 */

import {
  AGENT_TOOL_SPECS,
  AGENT_WRITE_TOOL_NAMES,
  executeTool,
  findPatient,
  getToolSpec,
  isWriteTool,
  toolLatencyMs,
} from './tools';
import type {
  ChatMessage,
  CompleteFn,
  ParsedToolCall,
  PendingWrite,
  Session,
  Surface,
  ToolArgs,
  ToolRecord,
  TurnCallbacks,
  TurnResult,
} from './types';

const RESPOND_TOOL = 'respond';

/** Shown when the model never produced an answer worth surfacing. */
const GAVE_UP = "I couldn't put that together — try rephrasing?";

/**
 * The nudge sent when a turn was protocol chatter rather than an answer.
 *
 * Deliberately not phrased as "every turn must be JSON". That reminder is what
 * induces the failure in the first place: told to use JSON, a cheap model
 * replies "I understand, I will ensure all my responses are in JSON format"
 * — and if it wraps that in a respond call, it is a well-formed turn that
 * says nothing. Point it back at the question instead of at the format.
 */
const ANSWER_THE_QUESTION =
  'That did not answer the question. Do not acknowledge, apologise, or describe how you will reply — the user never sees those. Emit one JSON object that answers what was asked: {"tool": "respond", "args": {"text": "<your answer>"}}, or a read tool call if you need data first.';
const MAX_TURNS = 8;
const MAX_CONSECUTIVE_PARSE_FAILURES = 3;

/* ------------------------------------------------------------------ *
 * Tool-call parsing — ported from expo-app/src/lib/ai/tool-call-parser.ts
 * ------------------------------------------------------------------ */

/**
 * Scan a raw model response for every balanced top-level `{...}` span and keep
 * the ones that parse as a tool call. Prose, malformed JSON, and JSON without a
 * `tool` field are ignored rather than failing the whole turn.
 */
export function extractToolCalls(raw: string | null | undefined): ParsedToolCall[] {
  if (!raw) return [];

  const stripped = String(raw).replace(/```(?:json)?\s*/gi, '').replace(/```/g, '');

  const calls: ParsedToolCall[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;

  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i];

    if (inString) {
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        const call = tryParseToolCall(stripped.slice(start, i + 1));
        if (call) calls.push(call);
        start = -1;
      }
      if (depth < 0) depth = 0;
    }
  }

  return calls;
}

function tryParseToolCall(span: string): ParsedToolCall | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(span);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.tool !== 'string') return null;
  const args =
    obj.args && typeof obj.args === 'object' && !Array.isArray(obj.args)
      ? (obj.args as Record<string, unknown>)
      : {};
  return { tool: obj.tool, args };
}

/** `respond` and every write tool must be called alone, with no siblings. */
export function isExclusiveTool(name: string): boolean {
  return name === RESPOND_TOOL || isWriteTool(name);
}

/**
 * When a model answers in prose instead of calling `respond`, that prose is
 * usually a perfectly good answer — but it often opens by talking to the
 * protocol rather than to the patient: apologising for the format, or
 * acknowledging the JSON instruction ("I understand. I will ensure all my
 * responses are in JSON format."). Strip those leading sentences so the user
 * sees the answer rather than the machinery.
 *
 * Only *leading* sentences are considered, and only ones that pair a
 * protocol-facing opener with a protocol-facing topic. An apology about the
 * patient's actual situation, or one in the middle of a reply, is left alone.
 *
 * Returns '' when the message is nothing but chatter. Callers must treat that
 * as "no answer here" — surfacing the machinery to a patient is worse than
 * falling back to an honest "I couldn't put that together".
 */

/**
 * Openers split into two tiers, because they tolerate very different topics.
 *
 * An apology may be about a generic "error" or "mistake" and still be aimed at
 * the protocol. An acknowledgement may not: "I will send that request to your
 * doctor" and "I see an error in your lab report" are answers, not machinery,
 * so acknowledgements are only chatter when paired with an explicitly
 * protocol-facing word.
 */
const APOLOGY_OPENER = /^(?:i\s+(?:apologi[sz]e|'m\s+sorry|am\s+sorry)|sorry|my\s+apologies)\b/i;
const ACK_OPENER =
  /^(?:i\s+(?:understand|see|will|'ll)|understood|got\s+it|noted|acknowledged|sure|of\s+course|thank\s+you\s+for\s+the\s+(?:reminder|correction|clarification))\b/i;

/** Anything that names the machinery itself. Safe for either opener. */
const PROTOCOL_TOPIC =
  /\b(json|formats?|formatted|formatting|instructions?|protocol|tool\s*calls?|wrapper|schema|syntax|code\s*fence)\b/i;
/** Vaguer, and only trustworthy after an apology. */
const APOLOGY_TOPIC = /\b(again|error|mistake|careful|request)\b/i;

/**
 * Promises about how it will conduct itself, rather than an answer.
 *
 * These are echoes of our own nudge — told "that did not answer the
 * question", a weak model replies "I will focus on answering your question
 * directly." Matched as whole phrases, not loose keywords: "I understand your
 * question about the cholesterol result" is a real reply and must survive.
 */
const META_PROMISE =
  /\b(focus on (?:answering|your question)|answer(?:ing)? (?:you|your question|it) directly|be (?:more )?direct|get (?:straight|right) to|from now on|going forward|in future)\b/i;

/** The stock promise that trails a format apology. */
const FOLLOW_UP = /^(?:i\s+will|i'll)\s+be\s+more\s+careful\b/i;

/** Leading run up to and including its terminator (or newline, or end). */
const LEADING_SENTENCE = /^\s*[^.!?\n]+(?:[.!?]+|\n|$)\s*/;

function isChatterSentence(sentence: string): boolean {
  const s = sentence.trim();
  if (FOLLOW_UP.test(s)) return true;

  const apology = APOLOGY_OPENER.test(s);
  const ack = ACK_OPENER.test(s);
  if (!apology && !ack) return false;

  if (PROTOCOL_TOPIC.test(s)) return true;
  if (META_PROMISE.test(s)) return true;
  if (apology && APOLOGY_TOPIC.test(s)) return true;

  // A bare acknowledgement carries no topic at all — "Understood.", "Got it."
  return s.replace(/[^\w\s']/g, '').split(/\s+/).filter(Boolean).length <= 4;
}

export function stripProtocolChatter(text: string): string {
  let rest = text;
  // Bounded: a model rarely stacks more than a couple of these.
  for (let i = 0; i < 4; i++) {
    const match = LEADING_SENTENCE.exec(rest);
    if (!match || !isChatterSentence(match[0])) break;
    rest = rest.slice(match[0].length);
  }
  return rest.trim();
}

/* ------------------------------------------------------------------ *
 * Write confirmation
 * ------------------------------------------------------------------ */

/** Tools that put a message in front of a human at the other end. */
const SENDING_TOOLS = new Set(['send_message', 'send_reply']);

const DRAFT_VERB = /\b(draft|compose|prepare|write(?:\s+up)?|put\s+together)\b/i;
const SEND_VERB = /\b(send|submit|fire\s+off|deliver|email|mail\s+it|go\s+ahead\s+and\s+send)\b/i;

/**
 * Did the user ask to *see* a message rather than to send one?
 *
 * "Draft a message asking billing for an itemized statement" is a request for
 * text on screen. Both models read it as an instruction to send, partly
 * because the prompt used to say "draft a send_message" — and a sent message
 * cannot be unsent. Asking for a draft and asking to send are separate steps,
 * so when only the first is present the send is refused.
 */
export function isDraftRequest(userText: string): boolean {
  const t = String(userText ?? '');
  return DRAFT_VERB.test(t) && !SEND_VERB.test(t);
}

export type WriteConfirmation = {
  title: string;
  description: string;
  /** Label for the approve button. */
  verb: string;
  /** The literal payload that will run, as label/value pairs. */
  fields: { label: string; value: string }[];
};

/** Turns an arg key into something a patient can read: message_body → Message body. */
function fieldLabel(key: string): string {
  const spaced = key.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Argument names whose value must never be rendered back to the screen. */
const SECRET_ARGS = new Set(['password', 'code']);

/**
 * What the dialog shows. Built by code from the actual payload, never from the
 * model's description of it — the point of the dialog is that the user sees
 * what will really run.
 *
 * The copy comes off the tool spec's `write` block, so it exists for every
 * write by construction. The fallbacks are for a tool that isn't a write at
 * all: nothing routes one here, and a bare name beats an empty dialog if
 * something ever does.
 *
 * Secrets are the one exception to showing the payload: `setup_account`
 * carries a MyChart password, and a dialog that prints it puts the patient's
 * portal password on screen (and into any screenshot of the demo). The row
 * still appears, so the user can see a password is part of the call.
 */
export function describeWrite({ tool, args, details }: PendingWrite): WriteConfirmation {
  const meta = getToolSpec(tool)?.write;
  return {
    title: meta?.title ?? tool,
    description: meta?.description ?? `Runs ${tool}.`,
    verb: meta?.verb ?? 'Confirm',
    fields: [
      ...Object.entries(args ?? {})
        .filter(([key]) => key !== 'instance')
        .map(([key, value]) => ({
          label: fieldLabel(key),
          value: SECRET_ARGS.has(key)
            ? '••••••••'
            : typeof value === 'string'
              ? value
              : JSON.stringify(value),
        })),
      ...(details ?? []),
    ],
  };
}

/**
 * Rows the raw args can't provide, resolved from session state. A
 * book_appointment payload is just `slot_id: slot-002` — the patient being
 * asked to approve it deserves to see who, when and where that is. And when
 * the model invents a slot id (observed: "56789"), saying so in the dialog
 * lets the user decline instead of approving a call that must fail.
 */
export function resolveWriteDetails(
  session: Session,
  tool: string,
  args: ToolArgs,
): { label: string; value: string }[] {
  // A conversation id says nothing about what is being deleted, and a deleted
  // conversation does not come back.
  if (tool === 'delete_message') {
    const id = typeof args.conversation_id === 'string' ? args.conversation_id : '';
    const thread = session.messages.find((m) => m.id === id);
    if (!thread) {
      return [{ label: 'Warning', value: `"${id}" is not one of the conversation ids — this delete will fail.` }];
    }
    return [
      { label: 'Subject', value: thread.subject },
      { label: 'With', value: thread.from },
      { label: 'Messages', value: `${thread.messages.length} in this thread` },
      { label: 'Note', value: 'Deleting removes the conversation from the inbox for good.' },
    ];
  }

  // Switching is not a read: everything the assistant looks at afterwards is
  // somebody else's chart, so the dialog says whose.
  if (tool === 'switch_proxy_target') {
    const query = typeof args.patient === 'string' ? args.patient : '';
    const wanted = findPatient(session, query);
    if (!wanted) {
      const names = session.patients.map((p) => p.name).join(', ');
      return [{ label: 'Warning', value: `"${query}" is not a record this account can reach. Available: ${names}.` }];
    }
    return [
      { label: 'Record', value: wanted.name },
      { label: 'Relationship', value: wanted.relationship },
      { label: 'Date of birth', value: wanted.record.profile.dateOfBirth },
      { label: 'Effect', value: 'Every tool reads this record until you switch back.' },
    ];
  }

  if (tool !== 'book_appointment') return [];
  // args is ToolArgs (Record<string, unknown>) — model-emitted JSON, so the
  // type is unknown by construction. A non-string slot_id matches no slot;
  // treating it as absent is the same outcome without a String() coercion
  // that would render "[object Object]" into the confirmation row.
  const slotId = typeof args.slot_id === 'string' ? args.slot_id : '';
  for (const offer of session.availableAppointments) {
    const slot = offer.slots.find((s) => s.slotId === slotId);
    if (!slot) continue;
    return [
      { label: 'Provider', value: offer.provider },
      { label: 'Visit type', value: offer.visitType },
      { label: 'When', value: `${slot.date} at ${slot.time}` },
      { label: 'Location', value: offer.location },
    ];
  }
  return [{ label: 'Warning', value: `"${slotId}" is not one of the open slot ids — this booking will fail.` }];
}

/* ------------------------------------------------------------------ *
 * System prompt
 * ------------------------------------------------------------------ */

export type SystemPromptOptions = {
  memoryDigest?: string | null;
  skillAddition?: string | null;
  surface?: Surface;
};

export function buildSystemPrompt({
  memoryDigest = null,
  skillAddition = null,
  surface = 'ios',
}: SystemPromptOptions = {}): string {
  // Every line says which kind of call it is. The model batches reads freely
  // and knows before it calls that a write will stop at a dialog, so it can
  // put the payload to the user first instead of being surprised by a decline.
  const toolList = AGENT_TOOL_SPECS
    .map(
      (t) =>
        `- [${t.write ? 'write' : 'read'}] ${t.name}(${Object.keys(t.args).join(', ')}) — ${t.description}`,
    )
    .join('\n');

  const formatting =
    surface === 'ios'
      ? [
          'Formatting (for the text inside `respond`):',
          '- You render on a narrow phone screen — never use markdown tables.',
          '- For lists of items, bold the item name on its own line and put each detail on the next line. Separate items with a blank line.',
          '- Use ## headings to group sections. Use plain bullets only for short flat lists.',
          '- Keep paragraphs short.',
        ].join('\n')
      : [
          'Formatting (for the text inside `respond`):',
          '- You render in a desktop chat window. Markdown headings, bullets, and bold all work.',
          '- Lead with the answer, then the supporting detail. Keep it tight.',
          '- Never invent a value you did not read from a tool result.',
        ].join('\n');

  const memorySection =
    memoryDigest?.trim()
      ? [
          "Patient digest from prior sessions and MyChart records (use it so you don't refetch the obvious; verify with tools when the user asks for current data):",
          memoryDigest,
          '',
        ].join('\n')
      : '';

  const skillSection =
    skillAddition?.trim()
      ? [
          'The user invoked a specific skill. Follow this playbook for the rest of the conversation — it overrides the generic guidance above on conflict, but the JSON output protocol and write-confirmation rules still apply:',
          skillAddition,
          '',
        ].join('\n')
      : '';

  return [
    "You are a health assistant with access to the user's MyChart medical records.",
    'Be genuinely helpful: explain the records in plain language, summarize information, and offer general educational guidance about conditions, medications, diet, exercise, and lifestyle when asked.',
    'Do not diagnose new conditions, prescribe or change prescription medications, or give advice that would replace an in-person evaluation. For anything urgent or any prescription change, recommend contacting the care team — but still answer the question first.',
    '',
    'You communicate with the system by emitting JSON objects. Each tool call is its own JSON object:',
    '  { "tool": "<tool_name>", "args": { ... } }',
    '',
    'Every tool below is tagged [read] or [write]. A [read] call just runs. A [write] call changes something in the portal, so it stops at a confirmation dialog and only runs if the user approves it there.',
    '',
    'You may emit MULTIPLE READ tool calls in a single turn (one JSON object each, separated by whitespace). They run in parallel and come back together. Example:',
    '  { "tool": "get_billing", "args": {} }',
    '  { "tool": "get_messages", "args": { "limit": 50 } }',
    '',
    `Write tools (${AGENT_WRITE_TOOL_NAMES.join(', ')}) and \`respond\` are EXCLUSIVE — each must be the only tool call in its turn. Batching them with anything else is rejected.`,
    '',
    'To reply to the user, call `respond`. This is the ONLY way to surface text, and it ends your turn:',
    '  { "tool": "respond", "args": { "text": "<your reply>" } }',
    '',
    'Tools:',
    toolList,
    '- respond(text) — Send your final reply to the user. Must be called alone. This ends your turn.',
    '',
    'Handling common requests:',
    '- Billing, charge, and insurance questions: you CAN help. Call get_message_recipients, pick the billing recipient ("Patient Accounts"), write the message, and show it to the user before sending anything.',
    '- "Draft", "write", "compose" and "prepare" mean SHOW ME THE TEXT. Put the whole message in your `respond` — recipient, subject, body — and ask whether to send it. Do NOT call send_message or send_reply for a draft; that is a different, later step the user asks for separately with "send it". Writing a message and sending it are not the same action, and a patient who asked to see a draft has not agreed to send anything.',
    '- Scheduling: call get_available_appointments, show the open slots, and call book_appointment once the user picks one.',
    '- Showing an X-ray picture: call get_imaging_results to pick the study, then download_imaging_study with that entry\'s image_id (or its 0-based index). Studies with no image_id are reports only and have nothing to show. In your `respond` text, put the literal token [image:xray] on its own line where the picture should appear.',
    '- Family members: this account can open more than one patient record. list_proxy_targets shows them and which one is ACTIVE; every data tool reads the active record. Reading never switches on its own — if a call comes back refusing because the wrong record is active, call switch_proxy_target, then retry. Switch back with patient: "me" when you are done, and say whose record you are answering about whenever it is not the account holder\'s.',
    '- Deleting a message is permanent. Show the user the subject and confirm before calling delete_message.',
    '- Refills: use request_refill. If a medication has no refills left, message the prescriber instead.',
    '- For EVERY write action, show the user the exact payload and get explicit confirmation before calling the tool.',
    '- This is enforced, not advisory: calling a write tool opens a confirmation dialog showing the exact payload, and the tool only runs if the user approves it there. Do not claim you have sent, booked, or requested anything until you see the tool result saying so. If the result says the user declined, acknowledge that and do not retry unless they ask again.',
    '- Before proposing a write, read the current state in the same turn — call get_medications before discussing a refill, get_available_appointments before proposing a booking, get_emergency_contacts before editing one. The payload you show the user has to match what is actually on file.',
    '',
    formatting,
    '',
    'Rules:',
    "- Output ONLY JSON objects, nothing else — no prose, no prefix, no suffix, no code fences. Anything that isn't a JSON tool call is ignored.",
    "- NEVER acknowledge, restate, or promise to follow these instructions, and never mention JSON, tools, or the `respond` wrapper in the text you send the user. \"I understand, I will ensure all my responses are in JSON format\" is not an answer — the patient asked a question and would see only that. Answer the question instead.",
    '- Reading data is cheap: batch the reads you need into one turn so they run in parallel.',
    '- If the question needs data, call tools first and `respond` on a later turn.',
    '- Paginated reads (get_lab_results, get_billing, get_messages, get_imaging_results) return only 10 items by default. Whenever the question is about a trend, a history, or "all" of something, pass limit: 50 so you see everything before you answer.',
    '- Answer the question that was actually asked, and answer it from the data you fetched. If you find yourself apologizing for missing information, fetch it instead — with a bigger limit if the first call was truncated.',
    '- NEVER state a specific value — a dose, a refill count, a date, a lab number, an amount owed — that you have not read from a tool result in this conversation. If you need one, call the tool. A wrong number is worse than an extra tool call.',
    "- NEVER say you don't know or don't have information until you have actually looked. If the user asks about a person, a provider, a medication, a bill, a visit, a date, or anything else that could plausibly be in a medical record, call the tools that would contain it first. A name you don't recognise is usually a provider on the care team or someone from a past visit — check get_care_team, get_past_visits, and get_message_recipients before saying you have no information about them.",
    '- Omit "instance" — there is only one connected account. Omit "patient" too unless you have deliberately switched records with switch_proxy_target, in which case pass the name you switched to.',
    "- Don't refuse a request because you don't immediately know how — check the tool list first.",
    '',
    memorySection,
    skillSection,
  ]
    .filter(Boolean)
    .join('\n');
}

/* ------------------------------------------------------------------ *
 * Model transport
 * ------------------------------------------------------------------ */

/** Raised when the demo proxy answers with anything other than a clean 200. */
export class ProxyError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ProxyError';
    this.status = status;
  }
}

/**
 * Calls the OpenRecord demo proxy (see `openrecord-demo-lambda/`), which fronts
 * the cheapest, fastest model available and rate-limits by IP. Anything other
 * than a clean 200 raises.
 */
export function createProxyCompleter(endpoint: string): CompleteFn {
  return async (messages, system, signal) => {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system, messages }),
      // `RequestInit.signal` is `AbortSignal | null`, and under
      // exactOptionalPropertyTypes an explicit `undefined` no longer satisfies
      // it. `null` is what the fetch spec means by "no signal".
      signal: signal ?? null,
    });
    if (!res.ok) {
      let detail = '';
      try {
        const body = (await res.json()) as { error?: string };
        detail = body.error ?? '';
      } catch {
        /* body wasn't JSON — the status alone is enough */
      }
      throw new ProxyError(detail || `Demo AI proxy returned ${res.status}`, res.status);
    }
    const body = (await res.json()) as { text?: string };
    return String(body.text ?? '');
  };
}

/* ------------------------------------------------------------------ *
 * Agent loop
 * ------------------------------------------------------------------ */

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export type RunTurnOptions = {
  /** Mutable record from `createSession()`. */
  session: Session;
  /** Prior turns in this conversation. */
  history?: ChatMessage[];
  /** What the user just said. */
  userText: string;
  /** Model transport. Required — there is no offline path. */
  complete: CompleteFn;
  callbacks?: TurnCallbacks;
  /** Active skill playbook, appended to the system prompt. */
  skillAddition?: string | null;
  memoryDigest?: string | null;
  surface?: Surface;
  signal?: AbortSignal;
  /**
   * How long to pretend each tool call took, in milliseconds.
   *
   * The delay is cosmetic — it exists so the tool-call indicator is visible —
   * so it is the one thing in the loop a caller can turn off. Tests pass
   * `() => 0`; without that, a suite that only cares about the loop's control
   * flow spends ten real seconds asleep and gets slower with every test added.
   */
  toolLatency?: (tool: string) => number;
};

/** Runs a batch of parsed calls against the local record, in parallel. */
export type BatchRunner = (calls: ParsedToolCall[]) => Promise<ToolRecord[]>;

/** Run one user turn to completion. */
export async function runTurn({
  session,
  history = [],
  userText,
  complete,
  callbacks = {},
  skillAddition = null,
  memoryDigest = null,
  surface = 'ios',
  signal,
  toolLatency = toolLatencyMs,
}: RunTurnOptions): Promise<TurnResult> {
  const onToolStart = callbacks.onToolStart ?? (() => {});
  const onToolEnd = callbacks.onToolEnd ?? (() => {});
  const onError = callbacks.onError ?? (() => {});
  // No dialog wired means no writes. Fail shut: the alternative is a surface
  // that silently runs them unconfirmed, which is the bug this exists to stop.
  const onConfirmWrite = callbacks.onConfirmWrite ?? (() => Promise.resolve(false));

  const executed: ToolRecord[] = [];

  const runBatch: BatchRunner = async (calls) => {
    return Promise.all(
      calls.map(async (call) => {
        onToolStart(call);
        const started = Date.now();
        await sleep(toolLatency(call.tool));
        const result = executeTool(session, call.tool, call.args);
        const record: ToolRecord = { tool: call.tool, args: call.args, result, ms: Date.now() - started };
        executed.push(record);
        onToolEnd(record);
        return record;
      }),
    );
  };

  const system = buildSystemPrompt({ memoryDigest, skillAddition, surface });
  const messages: ChatMessage[] = [...history, { role: 'user', content: userText }];
  const draftOnly = isDraftRequest(userText);
  let parseFailures = 0;
  /** Well-formed respond calls whose text was nothing but protocol chatter. */
  let chatterResponds = 0;
  /**
   * The best un-parseable prose we've seen this turn.
   *
   * A model that answers in prose instead of calling `respond` has usually
   * written a perfectly good answer. Re-prompting it for the JSON wrapper often
   * yields something *shorter and worse* ("I can help with that — what would
   * you like to know?"), so keep the fullest attempt rather than whichever one
   * happened to come last.
   */
  let bestProse = '';

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let raw: string;
    try {
      raw = await complete(messages, system, signal);
    } catch (err) {
      const error = err as Error;
      if (error.name === 'AbortError') throw error;
      // Down, over quota, or rate-limiting this visitor. Say so plainly — the
      // alternative is inventing an answer, which is worse.
      onError(error);
      throw error;
    }

    const calls = extractToolCalls(raw);

    if (calls.length === 0) {
      parseFailures++;
      // '' means the turn was pure protocol chatter — no answer to keep. Let
      // the retry below try again rather than banking the machinery as prose.
      const prose = stripProtocolChatter(String(raw));
      if (prose.length > bestProse.length) bestProse = prose;

      if (parseFailures >= MAX_CONSECUTIVE_PARSE_FAILURES) {
        // The model kept answering in prose. Surface its best attempt rather
        // than erroring out.
        return {
          text: bestProse || GAVE_UP,
          toolCalls: executed,
            };
      }
      messages.push({ role: 'assistant', content: raw });
      messages.push({
        role: 'user',
        content:
          ANSWER_THE_QUESTION,
      });
      continue;
    }

    parseFailures = 0;

    const respondCall = calls.find((c) => c.tool === RESPOND_TOOL);
    if (respondCall) {
      if (calls.length > 1) {
        messages.push({ role: 'assistant', content: raw });
        messages.push({
          role: 'user',
          content: '`respond` is exclusive — it must be the only tool call in the turn. Retry.',
        });
        continue;
      }
      // Only a string is a reply. Anything else is a malformed respond and is
      // treated as empty — the old String() coercion would have shown the
      // patient "[object Object]" as the assistant's answer.
      const spokenValue = respondCall.args.text;
      const spoken = typeof spokenValue === 'string' ? spokenValue.trim() : '';
      // An empty respond after a write is the model signing off, not chatter.
      if (!spoken) return { text: 'Done.', toolCalls: executed };

      const text = stripProtocolChatter(spoken);
      if (!text) {
        // The model wrapped protocol chatter in a valid respond call — it
        // answered the machinery instead of the patient. This is the common
        // shape of the leak, because a well-formed call skips the prose path
        // entirely. Re-prompt rather than surface it.
        // Its own counter: `parseFailures` is reset by any well-formed turn,
        // and a chatter respond is well-formed.
        chatterResponds++;
        if (chatterResponds >= MAX_CONSECUTIVE_PARSE_FAILURES) {
          return { text: bestProse || GAVE_UP, toolCalls: executed };
        }
        messages.push({ role: 'assistant', content: raw });
        messages.push({ role: 'user', content: ANSWER_THE_QUESTION });
        continue;
      }
      return { text, toolCalls: executed };
    }

    const exclusive = calls.filter((c) => isExclusiveTool(c.tool));
    if (exclusive.length > 0 && calls.length > 1) {
      messages.push({ role: 'assistant', content: raw });
      messages.push({
        role: 'user',
        content: `${exclusive.map((c) => c.tool).join(', ')} must be called alone with no other tool calls in the same turn. Retry.`,
      });
      continue;
    }

    // The gate. The system prompt asks the model to confirm every write, but
    // asking is not enforcing: the model that prompted this check fired
    // request_refill and send_message off the back of "what am i on?", a plain
    // question. Put the real payload to the user and block until they answer.
    const writeCall = calls.find((c) => isWriteTool(c.tool));
    if (writeCall) {
      // The user asked to see a draft. Don't even offer to send it — put the
      // text back to them instead. Not a dialog: a dialog asks the wrong
      // question when the answer to "send this?" was never solicited.
      if (draftOnly && SENDING_TOOLS.has(writeCall.tool)) {
        messages.push({ role: 'assistant', content: raw });
        messages.push({
          role: 'user',
          content: JSON.stringify({
            error: `The user asked you to draft this, not to send it. ${writeCall.tool} was not run. Show the full message — recipient, subject and body — in your \`respond\` text, then ask whether to send it.`,
          }),
        });
        continue;
      }

      const approved = await onConfirmWrite({
        tool: writeCall.tool,
        args: writeCall.args,
        details: resolveWriteDetails(session, writeCall.tool, writeCall.args),
      });
      if (!approved) {
        // Same shape and wording as the real iOS client, so the model reacts
        // to a decline the same way in both.
        messages.push({ role: 'assistant', content: raw });
        messages.push({
          role: 'user',
          content: JSON.stringify({
            cancelled: true,
            message: `User declined to run ${writeCall.tool}. Do not retry unless they ask again.`,
          }),
        });
        continue;
      }
    }

    const batch = await runBatch(calls);

    messages.push({ role: 'assistant', content: raw });
    messages.push({
      role: 'user',
      content: batch
        .map((r) => `Result of ${r.tool}:\n${JSON.stringify(r.result)}`)
        .join('\n\n'),
    });
  }

  // Out of turns. If the model wrote a real answer somewhere along the way and
  // simply never wrapped it in `respond`, that beats a housekeeping message.
  return {
    text:
      bestProse ||
      'That took more steps than I have room for. Try asking for one thing at a time — the demo caps each question at a handful of tool calls.',
    toolCalls: executed,
  };
}
