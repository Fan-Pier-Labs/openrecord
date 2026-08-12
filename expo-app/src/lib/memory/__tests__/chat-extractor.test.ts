import { beforeEach, describe, expect, test, mock } from "bun:test";
import type { MemorySummaryRow } from "@/lib/storage/database";

let aiResponse: string | Error = "[]";
let aiCalls = 0;

mock.module("@/lib/ai/claude-client", () => ({
  oneShotComplete: async () => {
    aiCalls++;
    if (aiResponse instanceof Error) throw aiResponse;
    return aiResponse;
  },
}));

let memoryRow: MemorySummaryRow | null = null;
let savedRow: MemorySummaryRow | null = null;

mock.module("@/lib/storage/database", () => ({
  getMemorySummary: async () => memoryRow,
  setMemorySummary: async (row: MemorySummaryRow) => {
    savedRow = row;
  },
}));

let accounts: Array<{ id: string }> = [{ id: "acct1" }];

mock.module("@/lib/storage/secure-store", () => ({
  getMyChartAccounts: async () => accounts,
}));

const { extractFactsFromTurn } = await import("@/lib/memory/chat-extractor");

function baseRow(factsJson = "[]"): MemorySummaryRow {
  return {
    account_id: "acct1",
    summary_md: "## Demographics",
    facts_json: factsJson,
    generated_at: "2026-01-01T00:00:00.000Z",
    generator_model: "test",
  };
}

beforeEach(() => {
  aiResponse = "[]";
  aiCalls = 0;
  memoryRow = baseRow();
  savedRow = null;
  accounts = [{ id: "acct1" }];
});

describe("extractFactsFromTurn", () => {
  test("skips blank turns without calling the AI", async () => {
    expect(await extractFactsFromTurn("", "answer")).toEqual({ added: 0 });
    expect(await extractFactsFromTurn("question", "  ")).toEqual({ added: 0 });
    expect(aiCalls).toBe(0);
  });

  test("does nothing when no account is connected", async () => {
    accounts = [];
    expect(await extractFactsFromTurn("q", "a")).toEqual({ added: 0 });
    expect(aiCalls).toBe(0);
  });

  test("does nothing when there is no baseline memory yet", async () => {
    memoryRow = null;
    expect(await extractFactsFromTurn("q", "a")).toEqual({ added: 0 });
    expect(aiCalls).toBe(0);
  });

  test("appends new facts tagged as user-reported", async () => {
    aiResponse = JSON.stringify([
      { category: "lifestyle", text: "Runs three times a week" },
    ]);
    const result = await extractFactsFromTurn("I run 3x a week", "Great!");
    expect(result).toEqual({ added: 1 });

    const facts = JSON.parse(savedRow!.facts_json);
    expect(facts).toEqual([
      { category: "lifestyle", text: "Runs three times a week", source: "user" },
    ]);
  });

  test("dedupes case-insensitively against existing facts", async () => {
    memoryRow = baseRow(
      JSON.stringify([{ category: "lifestyle", text: "Runs Three Times a Week" }]),
    );
    aiResponse = JSON.stringify([
      { category: "lifestyle", text: "runs three times a week" },
      { category: "diet", text: "Vegetarian" },
    ]);

    const result = await extractFactsFromTurn("q", "a");
    expect(result).toEqual({ added: 1 });
    const facts = JSON.parse(savedRow!.facts_json);
    expect(facts).toHaveLength(2);
    expect(facts[1].text).toBe("Vegetarian");
  });

  test("does not write when every fact is a duplicate", async () => {
    memoryRow = baseRow(JSON.stringify([{ category: "diet", text: "Vegetarian" }]));
    aiResponse = JSON.stringify([{ category: "diet", text: "vegetarian" }]);
    expect(await extractFactsFromTurn("q", "a")).toEqual({ added: 0 });
    expect(savedRow).toBeNull();
  });

  test("caps the stored list at 200 facts, dropping the oldest", async () => {
    const existing = Array.from({ length: 199 }, (_, i) => ({
      category: "fact",
      text: `fact number ${i}`,
    }));
    memoryRow = baseRow(JSON.stringify(existing));
    aiResponse = JSON.stringify([
      { category: "fact", text: "newest fact A" },
      { category: "fact", text: "newest fact B" },
    ]);

    const result = await extractFactsFromTurn("q", "a");
    expect(result).toEqual({ added: 2 });

    const facts = JSON.parse(savedRow!.facts_json) as Array<{ text: string }>;
    expect(facts).toHaveLength(200);
    expect(facts[0].text).toBe("fact number 1"); // oldest dropped
    expect(facts.at(-1)!.text).toBe("newest fact B");
  });

  test("recovers from a corrupt facts_json blob", async () => {
    memoryRow = baseRow("{corrupt");
    aiResponse = JSON.stringify([{ category: "diet", text: "Vegetarian" }]);
    expect(await extractFactsFromTurn("q", "a")).toEqual({ added: 1 });
    expect(JSON.parse(savedRow!.facts_json)).toHaveLength(1);
  });

  test("swallows AI failures", async () => {
    aiResponse = new Error("model down");
    expect(await extractFactsFromTurn("q", "a")).toEqual({ added: 0 });
    expect(savedRow).toBeNull();
  });
});
