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

import { TOOL_SPECS, executeTool, isWriteTool, toolLatencyMs } from './tools';
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

/**
 * Whether the user's message approves the write that was put to them.
 *
 * Deliberately narrow and fail-closed: anything that isn't a recognisable yes
 * is a no. A missed "yes" costs one extra turn; a false positive sends a real
 * message to a real doctor.
 */
const AFFIRMATIVE =
  /^\s*(?:yes|yeah|yep|yup|ok|okay|sure|confirm(?:ed|ing)?|do it|send it|book it|go ahead|please do|sounds good|approve[ds]?|affirmative|looks good|lgtm)\b/i;
/** Any hint of a brake anywhere in the message vetoes the whole thing. */
const NEGATIVE = /\b(?:no|not|don'?t|do not|cancel|stop|wait|hold off|never ?mind|instead|change|edit|different)\b/i;

export function isAffirmative(text: string): boolean {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return false;
  if (NEGATIVE.test(trimmed)) return false;
  return AFFIRMATIVE.test(trimmed);
}

/** Key-order-independent identity for a proposed write. */
function writeIdentity(tool: string, args: ToolArgs): string {
  const entries = Object.entries(args ?? {})
    .filter(([key]) => key !== 'instance')
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify([tool, entries]);
}

export function isSameWrite(a: PendingWrite | null | undefined, b: PendingWrite | null | undefined): boolean {
  if (!a || !b) return false;
  return writeIdentity(a.tool, a.args) === writeIdentity(b.tool, b.args);
}

/**
 * The confirmation put to the user. Written by code, not by the model: the
 * whole point is to show the payload that will actually run, so it cannot be
 * a paraphrase of it.
 */
export function describePendingWrite({ tool, args }: PendingWrite): string {
  const fields = Object.entries(args ?? {})
    .filter(([key]) => key !== 'instance')
    .map(([key, value]) => `- **${key}:** ${typeof value === 'string' ? value : JSON.stringify(value)}`);

  return [
    `Just to confirm before I do it — this will run \`${tool}\`:`,
    '',
    ...(fields.length > 0 ? fields : ['- _(no details)_']),
    '',
    'Reply **yes** to go ahead, or tell me what to change.',
  ].join('\n');
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
  const toolList = TOOL_SPECS.filter((t) => t.group !== 'Account')
    .map((t) => `- ${t.name}(${Object.keys(t.args).join(', ')}) — ${t.description}`)
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
    memoryDigest && memoryDigest.trim()
      ? [
          "Patient digest from prior sessions and MyChart records (use it so you don't refetch the obvious; verify with tools when the user asks for current data):",
          memoryDigest,
          '',
        ].join('\n')
      : '';

  const skillSection =
    skillAddition && skillAddition.trim()
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
    'You may emit MULTIPLE READ tool calls in a single turn (one JSON object each, separated by whitespace). They run in parallel and come back together. Example:',
    '  { "tool": "get_billing", "args": {} }',
    '  { "tool": "get_messages", "args": { "limit": 50 } }',
    '',
    'Write tools (send_message, send_reply, request_refill, book_appointment, add_emergency_contact, update_emergency_contact, remove_emergency_contact) and `respond` are EXCLUSIVE — each must be the only tool call in its turn. Batching them with anything else is rejected.',
    '',
    'To reply to the user, call `respond`. This is the ONLY way to surface text, and it ends your turn:',
    '  { "tool": "respond", "args": { "text": "<your reply>" } }',
    '',
    'Tools:',
    toolList,
    '- respond(text) — Send your final reply to the user. Must be called alone. This ends your turn.',
    '',
    'Handling common requests:',
    '- Billing, charge, and insurance questions: you CAN help. Call get_message_recipients, pick the billing recipient ("Patient Accounts"), draft a send_message, and confirm with the user before sending.',
    '- Scheduling: call get_available_appointments, show the open slots, and call book_appointment once the user picks one.',
    '- Showing an X-ray picture: call get_imaging_results to pick the study, then get_xray_image with its 0-based index. In your `respond` text, put the literal token [image:xray] on its own line where the picture should appear.',
    '- Refills: use request_refill. If a medication has no refills left, message the prescriber instead.',
    '- For EVERY write action, show the user the exact payload and get explicit confirmation before calling the tool.',
    '- This is enforced, not advisory: a write tool you call without the user having agreed to that exact payload does not run. The user is shown the payload and asked. Do not claim you have sent, booked, or requested anything until you see the tool result saying so.',
    '- Before proposing a write, read the current state in the same turn — call get_medications before discussing a refill, get_available_appointments before proposing a booking, get_emergency_contacts before editing one. The payload you show the user has to match what is actually on file.',
    '',
    formatting,
    '',
    'Rules:',
    "- Output ONLY JSON objects, nothing else — no prose, no prefix, no suffix, no code fences. Anything that isn't a JSON tool call is ignored.",
    '- Reading data is cheap: batch the reads you need into one turn so they run in parallel.',
    '- If the question needs data, call tools first and `respond` on a later turn.',
    '- Paginated reads (get_lab_results, get_billing, get_messages, get_imaging_results) return only 10 items by default. Whenever the question is about a trend, a history, or "all" of something, pass limit: 50 so you see everything before you answer.',
    '- Answer the question that was actually asked, and answer it from the data you fetched. If you find yourself apologizing for missing information, fetch it instead — with a bigger limit if the first call was truncated.',
    '- NEVER state a specific value — a dose, a refill count, a date, a lab number, an amount owed — that you have not read from a tool result in this conversation. If you need one, call the tool. A wrong number is worse than an extra tool call.',
    "- NEVER say you don't know or don't have information until you have actually looked. If the user asks about a person, a provider, a medication, a bill, a visit, a date, or anything else that could plausibly be in a medical record, call the tools that would contain it first. A name you don't recognise is usually a provider on the care team or someone from a past visit — check get_care_team, get_past_visits, and get_message_recipients before saying you have no information about them.",
    '- Omit "instance" — there is only one connected account.',
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
      signal,
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

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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
  /** The write this turn's message may be confirming, from the previous turn. */
  pendingWrite?: PendingWrite | null;
  /** Active skill playbook, appended to the system prompt. */
  skillAddition?: string | null;
  memoryDigest?: string | null;
  surface?: Surface;
  signal?: AbortSignal;
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
  pendingWrite = null,
  skillAddition = null,
  memoryDigest = null,
  surface = 'ios',
  signal,
}: RunTurnOptions): Promise<TurnResult> {
  // Approval is granted by this message, for that exact payload, and nothing
  // else. It is spent on the first write it authorises.
  let approved = pendingWrite && isAffirmative(userText) ? pendingWrite : null;

  const onToolStart = callbacks.onToolStart ?? (() => {});
  const onToolEnd = callbacks.onToolEnd ?? (() => {});
  const onError = callbacks.onError ?? (() => {});

  const executed: ToolRecord[] = [];

  const runBatch: BatchRunner = async (calls) => {
    return Promise.all(
      calls.map(async (call) => {
        onToolStart(call);
        const started = Date.now();
        await sleep(toolLatencyMs(call.tool));
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

  // The user approved a held write, so run it here rather than asking the
  // model to reproduce the payload verbatim — a cheap model rewords it, the
  // reworded call fails the identity check, and the user gets asked forever.
  // Running it from the stored payload also guarantees that what executes is
  // exactly what was shown.
  let approvedRecord: ToolRecord | null = null;
  if (approved) {
    [approvedRecord] = await runBatch([{ tool: approved.tool, args: approved.args }]);
    messages.push({
      role: 'user',
      content: `Result of ${approvedRecord.tool}:\n${JSON.stringify(approvedRecord.result)}`,
    });
    approved = null;
  }

  let parseFailures = 0;
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
          text: bestProse || "I couldn't put that together — try rephrasing?",
          toolCalls: executed,
            };
      }
      messages.push({ role: 'assistant', content: raw });
      messages.push({
        role: 'user',
        content:
          'Reminder: every turn must be JSON. To answer the user, wrap your reply: {"tool": "respond", "args": {"text": "<your reply>"}}. Send only that object — no apology, no preamble.',
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
      const text = String(respondCall.args.text ?? '').trim();
      return { text: text || 'Done.', toolCalls: executed };
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
    // question. Hold the write and put the real payload to the user instead.
    const writeCall = calls.find((c) => isWriteTool(c.tool));
    if (writeCall) {
      const proposed: PendingWrite = { tool: writeCall.tool, args: writeCall.args };
      // The approved write already ran at the top of this turn, and the model
      // has no way to know that — its first move is usually to emit the call
      // again, often reworded. Match on the tool alone, and only on the first
      // model turn: past that, a write is a genuinely new one and gets gated
      // like any other.
      const isReemit = approvedRecord !== null && turn === 0 && proposed.tool === approvedRecord.tool;
      if (isReemit && approvedRecord) {
        messages.push({ role: 'assistant', content: raw });
        messages.push({
          role: 'user',
          content: `Result of ${approvedRecord.tool}:\n${JSON.stringify(approvedRecord.result)}`,
        });
        continue;
      }
      return {
        text: describePendingWrite(proposed),
        toolCalls: executed,
        pendingWrite: proposed,
      };
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
