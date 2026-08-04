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
 */

import { TOOL_SPECS, executeTool, isWriteTool, toolLatencyMs } from './tools';
import { scriptedTurn } from './scripted';
import type {
  ChatMessage,
  CompleteFn,
  ParsedToolCall,
  Session,
  Surface,
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
 * usually a perfectly good answer — but it often opens by apologising for the
 * format, which is addressed to the protocol, not to the patient. Strip those
 * leading lines so the user sees the answer rather than the machinery.
 *
 * Only leading, self-contained apologies about *format* are removed; an
 * apology in the middle of a reply, or one about the patient's actual
 * situation, is left alone.
 */
export function stripProtocolChatter(text: string): string {
  const APOLOGY =
    /^\s*(i (?:apologi[sz]e|'m sorry|am sorry)|sorry|my apologies)\b[^.!?\n]*(again|error|mistake|careful|format|instruction|tool call|json|request)[^.!?\n]*[.!?]?\s*/i;
  const FOLLOW_UP = /^\s*(i will|i'll) be more careful[^.!?\n]*[.!?]?\s*/i;

  let out = text;
  for (let i = 0; i < 3; i++) {
    const next = out.replace(APOLOGY, '').replace(FOLLOW_UP, '');
    if (next === out) break;
    out = next;
  }
  return out.trim() || text.trim();
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
 * than a clean 200 raises, and the caller falls back to the scripted engine.
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
  /** Model transport, or null to run entirely on the scripted engine. */
  complete: CompleteFn | null;
  callbacks?: TurnCallbacks;
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
  skillAddition = null,
  memoryDigest = null,
  surface = 'ios',
  signal,
}: RunTurnOptions): Promise<TurnResult> {
  const onToolStart = callbacks.onToolStart ?? (() => {});
  const onToolEnd = callbacks.onToolEnd ?? (() => {});
  const onFallback = callbacks.onFallback ?? (() => {});

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

  if (!complete) {
    const scripted = await scriptedTurn({ userText, runBatch, skillAddition });
    return { text: scripted, toolCalls: executed, usedFallback: true };
  }

  const system = buildSystemPrompt({ memoryDigest, skillAddition, surface });
  const messages: ChatMessage[] = [...history, { role: 'user', content: userText }];
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
      // The proxy is down, over quota, or rate-limiting this visitor. Rather
      // than showing an error, finish the turn on the scripted engine.
      onFallback(error);
      const scripted = await scriptedTurn({ userText, runBatch, skillAddition });
      return { text: scripted, toolCalls: executed, usedFallback: true };
    }

    const calls = extractToolCalls(raw);

    if (calls.length === 0) {
      parseFailures++;
      const prose = stripProtocolChatter(String(raw));
      if (prose.length > bestProse.length) bestProse = prose;

      if (parseFailures >= MAX_CONSECUTIVE_PARSE_FAILURES) {
        // The model kept answering in prose. Surface its best attempt rather
        // than erroring out.
        return {
          text: bestProse || "I couldn't put that together — try rephrasing?",
          toolCalls: executed,
          usedFallback: false,
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
      return { text: text || 'Done.', toolCalls: executed, usedFallback: false };
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
    usedFallback: false,
  };
}
