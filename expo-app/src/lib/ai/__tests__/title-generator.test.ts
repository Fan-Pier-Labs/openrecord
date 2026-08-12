import { beforeEach, describe, expect, test, mock } from "bun:test";
import type { ChatMessage } from "@/lib/ai/claude-client";

let aiResponse: string | Error = "SKIP";
let lastCall: { messages: ChatMessage[]; system: string; tier?: string } | null = null;

mock.module("@/lib/ai/claude-client", () => ({
  oneShotComplete: async (messages: ChatMessage[], system: string, tier?: string) => {
    lastCall = { messages, system, tier };
    if (aiResponse instanceof Error) throw aiResponse;
    return aiResponse;
  },
}));

const { generateChatTitle } = await import("@/lib/ai/title-generator");

const conversation: ChatMessage[] = [
  { role: "user", content: "What medications am I on?" },
  { role: "assistant", content: "You are on Lisinopril and Atorvastatin." },
];

beforeEach(() => {
  aiResponse = "SKIP";
  lastCall = null;
});

describe("generateChatTitle", () => {
  test("returns null for empty conversations without calling the AI", async () => {
    expect(await generateChatTitle([])).toBeNull();
    expect(lastCall).toBeNull();
  });

  test("returns a clean title", async () => {
    aiResponse = "Medication List Review";
    expect(await generateChatTitle(conversation)).toBe("Medication List Review");
  });

  test("uses the cheap model tier", async () => {
    aiResponse = "Title";
    await generateChatTitle(conversation);
    expect(lastCall?.tier).toBe("mini");
  });

  test("returns null when the model says SKIP (any case)", async () => {
    aiResponse = "SKIP";
    expect(await generateChatTitle(conversation)).toBeNull();
    aiResponse = "skip";
    expect(await generateChatTitle(conversation)).toBeNull();
  });

  test("strips wrapping quotes and trailing punctuation", async () => {
    aiResponse = "\"Refill Lisinopril Question!\"";
    expect(await generateChatTitle(conversation)).toBe("Refill Lisinopril Question");
  });

  test("keeps only the first line of a multi-line response", async () => {
    aiResponse = "MRI Results Review\nHere is why I chose this title...";
    expect(await generateChatTitle(conversation)).toBe("MRI Results Review");
  });

  test("caps runaway titles at 8 words", async () => {
    aiResponse = "One Two Three Four Five Six Seven Eight Nine Ten";
    expect(await generateChatTitle(conversation)).toBe(
      "One Two Three Four Five Six Seven Eight",
    );
  });

  test("returns null when the model returns quoted SKIP or whitespace", async () => {
    aiResponse = "  \"SKIP\"  ";
    expect(await generateChatTitle(conversation)).toBeNull();
    aiResponse = "   ";
    expect(await generateChatTitle(conversation)).toBeNull();
  });

  test("returns null when the AI call fails", async () => {
    aiResponse = new Error("rate limited");
    expect(await generateChatTitle(conversation)).toBeNull();
  });

  test("truncates long message bodies in the transcript", async () => {
    aiResponse = "Title";
    const longMsg: ChatMessage[] = [{ role: "user", content: "x".repeat(2000) }];
    await generateChatTitle(longMsg);
    const transcript = lastCall!.messages[0].content;
    // 600-char slice per message plus the "User: " prefix and wrapper.
    expect(transcript.length).toBeLessThan(700);
  });
});
