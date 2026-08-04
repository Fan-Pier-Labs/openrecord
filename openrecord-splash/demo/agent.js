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
 * Tool calls execute against the local fake record in `tools.js`. Nothing about
 * the fictional patient is ever sent anywhere; only the conversation text and
 * the tool results the model asked for go to the proxy.
 */

import { TOOL_SPECS, executeTool, isWriteTool, toolLatencyMs } from './tools.js';
import { scriptedTurn } from './scripted.js';

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
export function extractToolCalls(raw) {
  if (!raw) return [];

  const stripped = String(raw).replace(/```(?:json)?\s*/gi, '').replace(/```/g, '');

  const calls = [];
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

function tryParseToolCall(span) {
  let parsed;
  try {
    parsed = JSON.parse(span);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  if (typeof parsed.tool !== 'string') return null;
  const args = parsed.args && typeof parsed.args === 'object' && !Array.isArray(parsed.args) ? parsed.args : {};
  return { tool: parsed.tool, args };
}

/** `respond` and every write tool must be called alone, with no siblings. */
export function isExclusiveTool(name) {
  return name === RESPOND_TOOL || isWriteTool(name);
}

/* ------------------------------------------------------------------ *
 * System prompt
 * ------------------------------------------------------------------ */

export function buildSystemPrompt({ memoryDigest = null, skillAddition = null, surface = 'ios' } = {}) {
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

/**
 * Calls the OpenRecord demo proxy (see `openrecord-demo-lambda/`), which fronts
 * the cheapest, fastest model available and rate-limits by IP. Anything other
 * than a clean 200 raises, and the caller falls back to the scripted engine.
 */
export function createProxyCompleter(endpoint) {
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
        detail = (await res.json()).error ?? '';
      } catch {
        /* body wasn't JSON — the status alone is enough */
      }
      const err = new Error(detail || `Demo AI proxy returned ${res.status}`);
      err.status = res.status;
      throw err;
    }
    const body = await res.json();
    return String(body.text ?? '');
  };
}

/* ------------------------------------------------------------------ *
 * Agent loop
 * ------------------------------------------------------------------ */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run one user turn to completion.
 *
 * @param {object}   opts
 * @param {object}   opts.session    mutable record from tools.createSession()
 * @param {Array}    opts.history    prior [{role, content}] turns
 * @param {string}   opts.userText   what the user just said
 * @param {Function} opts.complete   (messages, system, signal) => Promise<string>, or null for scripted
 * @param {object}   opts.callbacks  { onToolStart, onToolEnd, onDone, onError, onFallback }
 * @param {string?}  opts.skillAddition
 * @param {string?}  opts.memoryDigest
 * @param {string}   opts.surface    'ios' | 'desktop'
 *
 * @returns {Promise<{text: string, toolCalls: Array, usedFallback: boolean}>}
 */
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
}) {
  const onToolStart = callbacks.onToolStart ?? (() => {});
  const onToolEnd = callbacks.onToolEnd ?? (() => {});
  const onFallback = callbacks.onFallback ?? (() => {});

  const executed = [];

  /** Run a batch of parsed calls against the local record, in parallel. */
  async function runBatch(calls) {
    const results = await Promise.all(
      calls.map(async (call) => {
        onToolStart(call);
        const started = Date.now();
        await sleep(toolLatencyMs(call.tool));
        const result = executeTool(session, call.tool, call.args);
        const record = { tool: call.tool, args: call.args, result, ms: Date.now() - started };
        executed.push(record);
        onToolEnd(record);
        return record;
      })
    );
    return results;
  }

  if (!complete) {
    const scripted = await scriptedTurn({ session, userText, history, runBatch, skillAddition });
    return { text: scripted, toolCalls: executed, usedFallback: true };
  }

  const system = buildSystemPrompt({ memoryDigest, skillAddition, surface });
  const messages = [...history, { role: 'user', content: userText }];
  let parseFailures = 0;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let raw;
    try {
      raw = await complete(messages, system, signal);
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      // The proxy is down, over quota, or rate-limiting this visitor. Rather
      // than showing an error, finish the turn on the scripted engine.
      onFallback(err);
      const scripted = await scriptedTurn({ session, userText, history, runBatch, skillAddition });
      return { text: scripted, toolCalls: executed, usedFallback: true };
    }

    const calls = extractToolCalls(raw);

    if (calls.length === 0) {
      parseFailures++;
      if (parseFailures >= MAX_CONSECUTIVE_PARSE_FAILURES) {
        // The model kept answering in prose. That prose is usually a perfectly
        // good answer, so surface it instead of erroring out.
        const prose = String(raw).trim();
        return {
          text: prose || "I couldn't put that together — try rephrasing?",
          toolCalls: executed,
          usedFallback: false,
        };
      }
      messages.push({ role: 'assistant', content: raw });
      messages.push({
        role: 'user',
        content:
          'That turn contained no valid tool call. Reply with ONLY JSON objects of the form {"tool": "...", "args": {...}}. To answer the user, emit {"tool": "respond", "args": {"text": "..."}}.',
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

  return {
    text: "That took more steps than I have room for. Try asking for one thing at a time — the demo caps each question at a handful of tool calls.",
    toolCalls: executed,
    usedFallback: false,
  };
}
