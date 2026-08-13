/**
 * Model-agnostic chat client.
 *
 * The free tier sends user messages to the public OpenRecord AI Lambda
 * (see `openrecord-demo-lambda/` — currently Gemini, swappable
 * server-side). Tool use is expressed by prompting
 * the model to emit JSON objects — instead of using any provider-native
 * tool schema. That lets us point this client at any reasonable chat
 * model without code changes.
 *
 * Protocol:
 *   • Every model turn is one or more JSON objects of the shape
 *     `{"tool": "<name>", "args": { ... }}`. Anything else (prose,
 *     malformed JSON) is ignored.
 *   • Read tools batch in parallel — emit N read calls in one turn and
 *     they all run via Promise.allSettled, with results fed back as a
 *     single user turn in emission order.
 *   • Write tools (see WRITE_TOOL_META in tool-catalog.ts — derived from
 *     the shared capability registry's `kind: 'write'` entries) and
 *     `respond` are exclusive: they must be called alone with no other
 *     tool calls in the same turn. Batched exclusive calls are rejected
 *     and the model is asked to retry.
 *   • `respond({ text })` terminates the loop and surfaces `text` to
 *     the user. It is the only way to reply.
 *   • If a turn yields zero parseable tool calls we re-prompt the model.
 *     Three consecutive failures abort with an error.
 */

import {
  getClaudeApiKey,
  getOpenAiApiKey,
  getGeminiApiKey,
  getAiProvider,
} from "@/lib/storage/secure-store";
import { backendUrl } from "@/lib/backend/client";
import { getBackendSession } from "@/lib/backend/session";
import { getFreshIdToken } from "@/lib/backend/google-signin";
import { extractToolCalls } from "./tool-call-parser";
import { WRITE_TOOLS, RESPOND_TOOL, isExclusiveTool, renderToolList } from "./tool-catalog";

export type ToolCall = {
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

// TOOLS, WRITE_TOOLS, and the exclusivity rules live in ./tool-catalog, which
// derives them from the shared capability registry — so the prompt-side
// declarations, tool-executor's confirmation gating, and what the other three
// clients support cannot drift apart.

function buildSystemPrompt(
  memoryDigest?: string | null,
  skillAddition?: string | null,
): string {
  const toolList = renderToolList();
  const memorySection = memoryDigest?.trim()
    ? [
        "Patient digest from prior sessions and MyChart records (use this so you don't have to refetch obvious info; verify with tools when the user asks for current data):",
        memoryDigest.length > 4000 ? memoryDigest.slice(0, 4000) + "\n…(digest truncated)…" : memoryDigest,
        "",
      ].join("\n")
    : "";
  const skillSection = skillAddition?.trim()
    ? [
        "The user invoked a specific skill. Follow this playbook for the rest of the conversation — it overrides the generic guidance above when there's a conflict, but the JSON output protocol and write-confirmation rules still apply:",
        skillAddition,
        "",
      ].join("\n")
    : "";
  return [
    "You are a health assistant with access to the user's MyChart medical records.",
    "Be genuinely helpful: explain the user's records in plain language, summarize information, and offer general educational guidance about conditions, medications, diet, exercise, and lifestyle when asked.",
    "You may discuss what their data shows, what conditions mean, what medications are for, and general management approaches (e.g. diet, exercise, sleep, common over-the-counter options).",
    "Do not diagnose new conditions, prescribe or change prescription medications, or give advice that would replace an in-person evaluation. For anything urgent, decisions about prescription changes, or symptoms that could be serious, recommend they contact their care team — but still answer the question first.",
    "",
    "You communicate with the system by emitting JSON objects. Each tool call is its own JSON object of the form:",
    '  { "tool": "<tool_name>", "args": { ... } }',
    "",
    "You may emit MULTIPLE READ tool calls in a single turn (one JSON object per call, separated by whitespace). They will run in parallel and their results will be fed back together. Example:",
    '  { "tool": "get_billing", "args": {} }',
    '  { "tool": "get_messages", "args": { "limit": 50 } }',
    "",
    `Write tools (${[...WRITE_TOOLS].join(", ")}) and \`respond\` are EXCLUSIVE — they must be the only tool call in the turn. Batching them with anything else will be rejected.`,
    "",
    "To reply to the user, call the `respond` tool — this is the ONLY way to surface text to the user and ends your turn:",
    '  { "tool": "respond", "args": { "text": "<your reply>" } }',
    "",
    "Tools:",
    toolList,
    "- respond(text) — Send your final reply to the user. Must be called alone. This is how you end your turn.",
    "",
    "Handling common requests:",
    "- Insurance / billing updates, payment plans, charge questions: you CAN help by sending a message to the billing department. Call get_message_recipients to list available recipients, pick the one that looks like billing (e.g. 'Billing', 'Billing Department', 'Customer Service', 'Patient Accounts'), then draft a send_message and confirm with the user before sending.",
    "- Booking / scheduling / rescheduling / cancelling appointments: you CAN help by messaging the right provider. Call get_message_recipients to find candidate providers (get_care_team is not supported yet). If the user already named a specialty or doctor, pick that one; otherwise ask the user which provider they want to see. Then draft a send_message to that provider describing what they're asking for (visit type, preferred dates/times, reason) and confirm before sending.",
    "- Showing X-ray / imaging pictures: if the user asks to SEE an X-ray (not just the report), call get_imaging_results first to pick the right study, then call download_imaging_study with its `image_id`. The tool returns { image_id, caption }. In your `respond` text, include the literal token [image:IMAGE_ID] on its own line where you want the picture to appear (the UI will swap it for the actual image).",
    "- Prescription refills: use request_refill.",
    "- Family members' records (proxy access): if the user asks about a child's or family member's chart, call list_proxy_targets to see which records this account can access and which is active, then switch_proxy_target to that patient (confirm with the user first — every data tool reads the newly active record afterwards). Data tools refuse, with instructions, if the active record doesn't match the patient they're about. Switch back with patient 'me' once the family member's request is done.",
    "- General questions for a provider: use send_message (look up recipients first if you're unsure of the name).",
    "- Replying to an existing thread: use send_reply with the conversation_id from get_messages.",
    `- For any write action (${[...WRITE_TOOLS].join(", ")}), always show the user the exact payload and get explicit confirmation before calling the tool.`,
    "",
    "Formatting (for the text inside `respond`):",
    "- Render on a narrow mobile screen — never use markdown tables. They wrap badly and become unreadable.",
    "- For lists of items (medications, lab results, appointments, providers, allergies, conditions, etc.), use a row-per-item layout: bold the item name on its own line, then put each detail on the next line. Separate items with a blank line.",
    "  Example for medications:",
    "    **Lisinopril** — 10mg",
    "    1 tablet daily for blood pressure",
    "    Prescriber: Dr. Hibbert",
    "",
    "    **Atorvastatin** — 20mg",
    "    1 tablet at bedtime for cholesterol",
    "    Prescriber: Dr. Hibbert",
    "- Use short labels (Dose, Instructions, Prescriber, Date, Provider, Status, Result) sparingly — only when the value isn't self-evident from context.",
    "- Use ## headings to group sections (e.g. ## Current Medications, ## Allergies, ## Recent Visits).",
    "- Use plain bullets (- ) only for short flat lists with no sub-details.",
    "- Keep paragraphs short. Prefer line breaks over commas when listing details.",
    "",
    "Rules:",
    "- Output ONLY JSON objects, nothing else — no prose, no prefix, no suffix, no code fences. Anything that isn't a JSON tool call is ignored.",
    "- Reading data is cheap: when you need several pieces of data, batch the read calls in one turn so they run in parallel.",
    "- If the user's question needs data, call the appropriate tool(s) first, then `respond` on a later turn.",
    '- Omit "instance" unless the user specifies a particular hostname.',
    "- After receiving tool results, decide whether to call more tools or call `respond` to reply.",
    "- Don't refuse a request just because you don't immediately know how — check the tools above first.",
    "",
    memorySection,
    skillSection,
  ].join("\n");
}

export type StreamCallbacks = {
  onText: (text: string) => void;
  onToolCall: (toolCall: ToolCall) => void;
  // May be async: callers persist the finished turn. The loop fires it and
  // returns without awaiting — completion handlers own their errors.
  onDone: (fullText: string, toolCalls: ToolCall[]) => void | Promise<void>;
  onError: (error: Error) => void;
};

export type ToolExecutor = (toolName: string, input: Record<string, unknown>) => Promise<string>;

const TOOL_LOOP_DEADLINE_MS = 10 * 60 * 1000;
const MAX_CONSECUTIVE_PARSE_FAILURES = 3;

type CompleteFn = (messages: ChatMessage[], system: string, model: string) => Promise<string>;

function backendCompleter(): CompleteFn {
  // The free tier talks to the OpenRecord AI Lambda with the user's Google
  // ID token attached. The Lambda verifies the token server-side and meters
  // the $50/month included credit against the Google account.
  // Contract: { system, messages, model? } → { text }.
  return async (messages, system, model) => {
    const token = await getFreshIdToken();
    if (!token) {
      throw new Error("Your Google sign-in expired. Sign in again in Settings → Account.");
    }
    const res = await fetch(backendUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ messages, system, model }),
    });
    if (!res.ok) {
      if (res.status === 401) {
        throw new Error("Your Google sign-in expired. Sign in again in Settings → Account.");
      }
      if (res.status === 402) {
        throw new Error(
          "Your $50 monthly AI credit is used up. It resets next month, or add your own API key in Settings → AI Provider.",
        );
      }
      const body = await res.text();
      throw new Error(`Backend AI error ${res.status}: ${body}`);
    }
    const data = await res.json();
    return data.text as string;
  };
}

function openaiCompleter(apiKey: string): CompleteFn {
  return async (messages, system, model) => {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: system }, ...messages],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenAI error ${res.status}: ${body}`);
    }
    const data = await res.json();
    return (data.choices?.[0]?.message?.content as string) ?? "";
  };
}

function geminiCompleter(apiKey: string): CompleteFn {
  return async (messages, system, model) => {
    const contents = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { role: "system", parts: [{ text: system }] },
          contents,
        }),
      },
    );
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Gemini error ${res.status}: ${body}`);
    }
    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    return parts.map((p: { text?: string }) => p.text ?? "").join("");
  };
}

function anthropicCompleter(apiKey: string): CompleteFn {
  return async (messages, system, model) => {
    // BYO-key fallback still uses the same JSON-schema protocol so the
    // surrounding tool loop stays provider-agnostic.
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Anthropic error ${res.status}: ${body}`);
    }
    const data = await res.json();
    const textBlock = (data.content ?? []).find((b: { type: string }) => b.type === "text");
    return (textBlock?.text as string) ?? "";
  };
}

type ResolvedCompleter = { complete: CompleteFn; model: string };

type ModelTier = "default" | "mini";

const MINI_MODELS: Record<"openai" | "anthropic" | "gemini" | "free", string> = {
  openai: "gpt-5.4-mini",
  anthropic: "claude-haiku-4-5-20251001",
  gemini: "gemini-2.5-flash-lite",
  free: "gemini-2.5-flash-lite",
};

async function resolveCompleter(tier: ModelTier = "default"): Promise<ResolvedCompleter> {
  // AI is gated behind Google sign-in across ALL providers — including
  // BYO keys — so there is one consistent rule: no sign-in, no AI.
  const session = await getBackendSession();
  if (!session) {
    throw new Error("Sign in with Google to use AI. You can sign in from Settings.");
  }

  const provider = await getAiProvider();
  if (provider === "openai") {
    const key = await getOpenAiApiKey();
    if (!key) throw new Error("OpenAI API key not set. Add it in Settings → AI Provider.");
    const model = tier === "mini" ? MINI_MODELS.openai : "gpt-4o";
    return { complete: openaiCompleter(key), model };
  }
  if (provider === "anthropic") {
    const key = await getClaudeApiKey();
    if (!key) throw new Error("Anthropic API key not set. Add it in Settings → AI Provider.");
    const model = tier === "mini" ? MINI_MODELS.anthropic : "claude-sonnet-4-6";
    return { complete: anthropicCompleter(key), model };
  }
  if (provider === "gemini") {
    const key = await getGeminiApiKey();
    if (!key) throw new Error("Gemini API key not set. Add it in Settings → AI Provider.");
    const model = tier === "mini" ? MINI_MODELS.gemini : "gemini-2.5-flash";
    return { complete: geminiCompleter(key), model };
  }
  const model = tier === "mini" ? MINI_MODELS.free : "gemini-2.5-flash";
  return { complete: backendCompleter(), model };
}

/**
 * One-shot completion that bypasses the tool-use loop. Used for
 * lightweight side calls like generating chat titles. Pass tier:"mini"
 * to use the cheapest model the active provider offers.
 */
export async function oneShotComplete(
  messages: ChatMessage[],
  system: string,
  tier: ModelTier = "default",
): Promise<string> {
  const { complete, model } = await resolveCompleter(tier);
  return complete(messages, system, model);
}

export async function sendMessage(
  messages: ChatMessage[],
  callbacks: StreamCallbacks,
  executeLocalTool: ToolExecutor,
  options?: { memoryDigest?: string | null; skillAddition?: string | null },
): Promise<void> {
  const system = buildSystemPrompt(
    options?.memoryDigest ?? null,
    options?.skillAddition ?? null,
  );

  let complete: CompleteFn;
  let model: string;
  try {
    const resolved = await resolveCompleter();
    complete = resolved.complete;
    model = resolved.model;
  } catch (err) {
    callbacks.onError(err as Error);
    return;
  }

  const conversation: ChatMessage[] = [...messages];
  const toolCalls: ToolCall[] = [];
  const pendingImageIds: string[] = [];
  let parseFailures = 0;

  const deadline = Date.now() + TOOL_LOOP_DEADLINE_MS;
  for (let i = 0; ; i++) {
    if (Date.now() > deadline) {
      callbacks.onError(new Error("AI tool-use loop exceeded 10 minute time limit."));
      return;
    }
    let content: string;
    try {
      content = await complete(conversation, system, model);
    } catch (err) {
      callbacks.onError(err as Error);
      return;
    }

    const calls = extractToolCalls(content);

    if (calls.length === 0) {
      parseFailures++;
      if (parseFailures >= MAX_CONSECUTIVE_PARSE_FAILURES) {
        callbacks.onError(
          new Error(
            `AI didn't respond in a parseable format after ${MAX_CONSECUTIVE_PARSE_FAILURES} retries. Please try again.`,
          ),
        );
        return;
      }
      conversation.push({ role: "assistant", content });
      conversation.push({
        role: "user",
        content:
          "Your previous response had no parseable tool calls. Respond with one or more JSON objects, one per tool call. To reply to the user, call the `respond` tool: " +
          '{"tool": "respond", "args": {"text": "your reply here"}}',
      });
      continue;
    }
    parseFailures = 0;

    // Exclusive tools (respond + writes) must be alone in the turn.
    const exclusive = calls.filter((c) => isExclusiveTool(c.tool));
    if (exclusive.length > 0 && calls.length > 1) {
      const names = exclusive.map((c) => c.tool).join(", ");
      conversation.push({ role: "assistant", content });
      conversation.push({
        role: "user",
        content:
          `Tool batch rejected: ${names} must be called alone, but you emitted ${calls.length} tool calls in this turn. ` +
          "Re-emit just the exclusive call by itself. Read tools can still be batched in a separate turn.",
      });
      continue;
    }

    // `respond` terminates the loop and surfaces text to the user.
    const soleCall = calls.length === 1 ? calls[0] : undefined;
    if (soleCall?.tool === RESPOND_TOOL) {
      const text = typeof soleCall.args.text === "string" ? (soleCall.args.text) : "";
      let finalText = text;
      for (const id of pendingImageIds) {
        if (!finalText.includes(`[image:${id}]`)) {
          finalText = `${finalText.trim()}\n\n[image:${id}]`;
        }
      }
      callbacks.onText(finalText);
      void callbacks.onDone(finalText, toolCalls);
      return;
    }

    // Otherwise: dispatch. Either a single write, or N reads in parallel.
    conversation.push({ role: "assistant", content });

    const dispatched: ToolCall[] = calls.map((c, j) => ({
      id: `tc_${Date.now()}_${i}_${j}`,
      name: c.tool,
      input: c.args,
    }));
    for (const tc of dispatched) {
      toolCalls.push(tc);
      callbacks.onToolCall(tc);
    }

    // Each promise settles into { call, result } so results stay paired with
    // their call without index bookkeeping (allSettled semantics preserved:
    // nothing here rejects, order matches `calls`).
    const settled = await Promise.all(
      calls.map(async (call) => {
        try {
          return { call, result: await executeLocalTool(call.tool, call.args) };
        } catch (reason) {
          return { call, result: `Error: ${(reason as Error)?.message ?? String(reason)}` };
        }
      }),
    );

    const resultParts: string[] = [];
    for (const { call, result } of settled) {
      const name = call.tool;
      // If a tool returned an image_id, remember it so we can ensure the
      // final respond includes the [image:id] token even if the model forgets.
      try {
        const parsedResult = JSON.parse(result);
        if (parsedResult && typeof parsedResult.image_id === "string") {
          pendingImageIds.push(parsedResult.image_id);
        }
      } catch {
        /* tool result wasn't JSON */
      }
      resultParts.push(`Tool result for ${name}:\n${result}`);
    }

    conversation.push({
      role: "user",
      content: resultParts.join("\n\n"),
    });
  }
}
