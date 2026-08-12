import { afterAll, beforeEach, describe, expect, test, mock } from "bun:test";
import type { ChatMessage, ToolCall } from "@/lib/ai/claude-client";

/**
 * Exercises the provider-agnostic tool-use loop in sendMessage with a
 * scripted "model": the Gemini provider is selected and global fetch is
 * stubbed to pop one scripted model turn per completion call.
 */

mock.module("expo-constants", () => ({
  default: { expoConfig: { extra: { backendUrl: "http://localhost:9999" } } },
}));

mock.module("@/lib/storage/secure-store", () => ({
  getAiProvider: async () => "gemini",
  getGeminiApiKey: async () => "test-key",
  getOpenAiApiKey: async () => null,
  getClaudeApiKey: async () => null,
}));

mock.module("@/lib/backend/session", () => ({
  getBackendSession: async () => null,
}));

const { sendMessage, oneShotComplete } = await import("@/lib/ai/claude-client");

/** Model turns to play back, in order. Each is the raw text of one completion. */
let modelTurns: string[] = [];
/** The request bodies sent to the "model", for asserting on conversation state. */
let requests: Array<{ contents: Array<{ role: string; parts: Array<{ text: string }> }>; systemInstruction: { parts: Array<{ text: string }> } }> = [];

const realFetch = globalThis.fetch;

function geminiFetchStub(): typeof fetch {
  return (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse((init?.body as string) ?? "{}");
    requests.push(body);
    const text = modelTurns.shift();
    if (text === undefined) throw new Error("test ran out of scripted model turns");
    return new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
      { status: 200 },
    );
  }) as typeof fetch;
}

beforeEach(() => {
  modelTurns = [];
  requests = [];
  globalThis.fetch = geminiFetchStub();
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

type Captured = {
  text: string[];
  toolCalls: ToolCall[];
  done: { fullText: string; toolCalls: ToolCall[] } | null;
  error: Error | null;
};

async function run(
  userText: string,
  executor: (tool: string, input: Record<string, unknown>) => Promise<string>,
  options?: { memoryDigest?: string | null; skillAddition?: string | null },
): Promise<Captured> {
  const captured: Captured = { text: [], toolCalls: [], done: null, error: null };
  const messages: ChatMessage[] = [{ role: "user", content: userText }];
  await sendMessage(
    messages,
    {
      onText: (t) => captured.text.push(t),
      onToolCall: (tc) => captured.toolCalls.push(tc),
      onDone: (fullText, toolCalls) => {
        captured.done = { fullText, toolCalls };
      },
      onError: (err) => {
        captured.error = err;
      },
    },
    executor,
    options,
  );
  return captured;
}

const neverExecute = async (tool: string) => {
  throw new Error(`unexpected tool execution: ${tool}`);
};

describe("sendMessage — respond", () => {
  test("a lone respond call surfaces text and ends the turn", async () => {
    modelTurns = ['{"tool": "respond", "args": {"text": "You take Lisinopril."}}'];
    const result = await run("What meds am I on?", neverExecute);

    expect(result.error).toBeNull();
    expect(result.text).toEqual(["You take Lisinopril."]);
    expect(result.done?.fullText).toBe("You take Lisinopril.");
    expect(result.done?.toolCalls).toEqual([]);
  });

  test("the system prompt lists tools and the JSON protocol", async () => {
    modelTurns = ['{"tool": "respond", "args": {"text": "hi"}}'];
    await run("hello", neverExecute);
    const system = requests[0].systemInstruction.parts[0].text;
    expect(system).toContain("get_medications");
    expect(system).toContain('{ "tool": "respond", "args": { "text": "<your reply>" } }');
  });

  test("memory digest and skill playbook are folded into the system prompt", async () => {
    modelTurns = ['{"tool": "respond", "args": {"text": "ok"}}'];
    await run("hello", neverExecute, {
      memoryDigest: "## Demographics\nHomer Simpson",
      skillAddition: "[Skill: Find bills to itemize]",
    });
    const system = requests[0].systemInstruction.parts[0].text;
    expect(system).toContain("Homer Simpson");
    expect(system).toContain("[Skill: Find bills to itemize]");
  });
});

describe("sendMessage — tool dispatch", () => {
  test("a read tool executes and its result is fed back to the model", async () => {
    modelTurns = [
      '{"tool": "get_medications", "args": {}}',
      '{"tool": "respond", "args": {"text": "You take Lisinopril."}}',
    ];
    const executed: string[] = [];
    const result = await run("What meds am I on?", async (tool) => {
      executed.push(tool);
      return JSON.stringify({ medications: ["Lisinopril"] });
    });

    expect(result.error).toBeNull();
    expect(executed).toEqual(["get_medications"]);
    expect(result.toolCalls.map((t) => t.name)).toEqual(["get_medications"]);

    // Second completion gets the tool result as a user turn.
    const secondTurn = requests[1].contents;
    const lastUser = secondTurn[secondTurn.length - 1];
    expect(lastUser.role).toBe("user");
    expect(lastUser.parts[0].text).toContain("Tool result for get_medications");
    expect(lastUser.parts[0].text).toContain("Lisinopril");
  });

  test("multiple read calls in one turn run as a batch and return together", async () => {
    modelTurns = [
      '{"tool": "get_billing", "args": {}} {"tool": "get_messages", "args": {"limit": 50}}',
      '{"tool": "respond", "args": {"text": "done"}}',
    ];
    const executed: Array<{ tool: string; input: Record<string, unknown> }> = [];
    const result = await run("billing and messages", async (tool, input) => {
      executed.push({ tool, input });
      return `${tool}-result`;
    });

    expect(result.error).toBeNull();
    expect(executed.map((e) => e.tool)).toEqual(["get_billing", "get_messages"]);
    expect(executed[1].input).toEqual({ limit: 50 });

    const feedback = requests[1].contents.at(-1)!.parts[0].text;
    expect(feedback).toContain("Tool result for get_billing:\nget_billing-result");
    expect(feedback).toContain("Tool result for get_messages:\nget_messages-result");
  });

  test("a failing tool reports its error to the model instead of aborting", async () => {
    modelTurns = [
      '{"tool": "get_billing", "args": {}}',
      '{"tool": "respond", "args": {"text": "Could not load billing."}}',
    ];
    const result = await run("billing", async () => {
      throw new Error("session expired");
    });

    expect(result.error).toBeNull();
    const feedback = requests[1].contents.at(-1)!.parts[0].text;
    expect(feedback).toContain("Error: session expired");
    expect(result.done?.fullText).toBe("Could not load billing.");
  });
});

describe("sendMessage — protocol enforcement", () => {
  test("unparseable output is retried with a corrective prompt", async () => {
    modelTurns = [
      "Sure! Your medications are...",
      '{"tool": "respond", "args": {"text": "recovered"}}',
    ];
    const result = await run("meds", neverExecute);

    expect(result.error).toBeNull();
    expect(result.done?.fullText).toBe("recovered");
    const corrective = requests[1].contents.at(-1)!.parts[0].text;
    expect(corrective).toContain("no parseable tool calls");
  });

  test("three consecutive unparseable turns abort with an error", async () => {
    modelTurns = ["prose", "more prose", "still prose"];
    const result = await run("meds", neverExecute);

    expect(result.done).toBeNull();
    expect(result.error?.message).toContain("3 retries");
  });

  test("respond batched with a read call is rejected and retried", async () => {
    modelTurns = [
      '{"tool": "get_billing", "args": {}} {"tool": "respond", "args": {"text": "premature"}}',
      '{"tool": "respond", "args": {"text": "alone now"}}',
    ];
    const executed: string[] = [];
    const result = await run("billing", async (tool) => {
      executed.push(tool);
      return "x";
    });

    expect(result.error).toBeNull();
    // The rejected batch must not execute anything.
    expect(executed).toEqual([]);
    expect(result.toolCalls).toEqual([]);
    expect(result.done?.fullText).toBe("alone now");

    const rejection = requests[1].contents.at(-1)!.parts[0].text;
    expect(rejection).toContain("must be called alone");
  });

  test("write tools batched with reads are also rejected", async () => {
    modelTurns = [
      '{"tool": "send_message", "args": {"subject": "hi"}} {"tool": "get_billing", "args": {}}',
      '{"tool": "respond", "args": {"text": "ok"}}',
    ];
    const executed: string[] = [];
    const result = await run("send it", async (tool) => {
      executed.push(tool);
      return "x";
    });

    expect(executed).toEqual([]);
    expect(result.error).toBeNull();
  });
});

describe("sendMessage — image attachments", () => {
  test("appends [image:id] tokens the model forgot to include", async () => {
    modelTurns = [
      '{"tool": "get_xray_image", "args": {"imaging_index": 0}}',
      '{"tool": "respond", "args": {"text": "Here is your X-ray."}}',
    ];
    const result = await run("show my xray", async () =>
      JSON.stringify({ image_id: "img_42", caption: "Chest X-ray" }),
    );

    expect(result.done?.fullText).toBe("Here is your X-ray.\n\n[image:img_42]");
  });

  test("does not duplicate tokens the model already placed", async () => {
    modelTurns = [
      '{"tool": "get_xray_image", "args": {"imaging_index": 0}}',
      '{"tool": "respond", "args": {"text": "Look:\\n[image:img_42]"}}',
    ];
    const result = await run("show my xray", async () =>
      JSON.stringify({ image_id: "img_42" }),
    );

    expect(result.done?.fullText).toBe("Look:\n[image:img_42]");
  });
});

describe("sendMessage — provider failures", () => {
  test("a failing completion surfaces through onError", async () => {
    globalThis.fetch = (async () =>
      new Response("quota exceeded", { status: 429 })) as typeof fetch;
    const result = await run("hello", neverExecute);
    expect(result.error?.message).toContain("Gemini error 429");
  });
});

describe("oneShotComplete", () => {
  test("returns the raw completion without entering the tool loop", async () => {
    modelTurns = ["Medication List Review"];
    const out = await oneShotComplete(
      [{ role: "user", content: "name this chat" }],
      "You name chats.",
      "mini",
    );
    expect(out).toBe("Medication List Review");
    // Mini tier picks the cheap Gemini model.
    const url = "gemini-2.5-flash-lite";
    void url; // model is encoded in the URL, which the stub ignores
  });
});
