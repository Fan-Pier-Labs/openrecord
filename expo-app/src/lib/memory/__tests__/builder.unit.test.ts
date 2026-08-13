import { beforeEach, describe, expect, test, mock } from "bun:test";
import type { MemorySummaryRow, SyncStateRow, InsightInput } from "@/lib/storage/database";
import { MEMORY_CATEGORIES } from "@/lib/memory/types";

/** Scraper data per category. Categories not present throw (fetch failure). */
let scraperData = new Map<string, unknown>();

mock.module("@/lib/scrapers/session-manager", () => ({
  executeScraperTool: async (tool: string) => {
    if (!scraperData.has(tool)) throw new Error(`${tool} unavailable`);
    return scraperData.get(tool);
  },
}));

let aiResponse: string | Error = "";
let aiPrompts: string[] = [];

mock.module("@/lib/ai/claude-client", () => ({
  oneShotComplete: async (messages: Array<{ content: string }>) => {
    aiPrompts.push(messages[0].content);
    if (aiResponse instanceof Error) throw aiResponse;
    return aiResponse;
  },
}));

let memoryRow: MemorySummaryRow | null = null;
let savedRow: MemorySummaryRow | null = null;
let savedInsights: InsightInput[] | null = null;
let syncStates = new Map<string, string | null>();

mock.module("@/lib/storage/database", () => ({
  getMemorySummary: async () => memoryRow,
  setMemorySummary: async (row: MemorySummaryRow) => {
    savedRow = row;
  },
  upsertInsightsForAccount: async (_accountId: string, insights: InsightInput[]) => {
    savedInsights = insights;
  },
  getAllSyncStates: async (accountId: string): Promise<SyncStateRow[]> =>
    [...syncStates.entries()].map(([category, hash]) => ({
      account_id: accountId,
      category,
      last_seen_at: hash,
      last_synced_at: "2026-01-01T00:00:00.000Z",
    })),
  setSyncState: async (_accountId: string, category: string, lastSeenAt: string | null) => {
    syncStates.set(category, lastSeenAt);
  },
}));

mock.module("@/lib/storage/secure-store", () => ({
  getMyChartAccounts: async () => [{ id: "acct1", hostname: "localhost:4000" }],
}));

const { buildInitialMemory, refreshMemory, loadDigestForChat } = await import(
  "@/lib/memory/builder"
);

const GOOD_AI_RESPONSE = JSON.stringify({
  summary_md: "## Demographics\nHomer Simpson, 39",
  facts: [{ category: "condition", text: "Hypertension", source: "mychart" }],
  insights: [
    {
      title: "Persistently elevated LDL",
      body_md: "LDL has been above range on the last three draws.",
      severity: "discuss",
      suggested_question: "Should I adjust my statin?",
      source_refs: ["LDL 162, 158, 165 mg/dL"],
    },
  ],
});

beforeEach(() => {
  scraperData = new Map<string, unknown>([
    ["get_medications", { medications: [{ name: "Lisinopril" }] }],
    ["get_allergies", []],
  ]);
  aiResponse = GOOD_AI_RESPONSE;
  aiPrompts = [];
  memoryRow = null;
  savedRow = null;
  savedInsights = null;
  syncStates = new Map();
});

describe("buildInitialMemory", () => {
  test("ingests scraped data, persists summary, insights, and sync hashes", async () => {
    await buildInitialMemory("acct1");

    expect(aiPrompts).toHaveLength(1);
    expect(aiPrompts[0]).toContain("get_medications");
    expect(aiPrompts[0]).toContain("Lisinopril");

    expect(savedRow?.account_id).toBe("acct1");
    expect(savedRow?.summary_md).toContain("Homer Simpson");
    expect(JSON.parse(savedRow!.facts_json)).toHaveLength(1);

    expect(savedInsights).toHaveLength(1);
    expect(savedInsights![0].title).toBe("Persistently elevated LDL");

    // One hash per successfully fetched category.
    expect(syncStates.size).toBe(2);
    expect(syncStates.has("get_medications")).toBe(true);
  });

  test("does nothing for an unknown account", async () => {
    await buildInitialMemory("missing");
    expect(aiPrompts).toHaveLength(0);
    expect(savedRow).toBeNull();
  });

  test("does nothing when every category fails to fetch", async () => {
    scraperData.clear();
    await buildInitialMemory("acct1");
    expect(aiPrompts).toHaveLength(0);
    expect(savedRow).toBeNull();
  });

  test("bails without writing when the AI response is unparseable", async () => {
    aiResponse = "I'm sorry, I can't produce JSON today.";
    await buildInitialMemory("acct1");
    expect(savedRow).toBeNull();
    expect(syncStates.size).toBe(0);
  });

  test("sanitizes insights: invalid severity falls back to info, oversize fields clamp", async () => {
    aiResponse = JSON.stringify({
      summary_md: "s",
      facts: [],
      insights: [
        { title: "T".repeat(300), body_md: "b", severity: "urgent" },
        { title: "ok", body_md: "fine", severity: "discuss_soon" },
        { title: 42, body_md: "dropped — title not a string" },
      ],
    });
    await buildInitialMemory("acct1");

    expect(savedInsights).toHaveLength(2);
    expect(savedInsights![0].title).toHaveLength(200);
    expect(savedInsights![0].severity).toBe("info");
    expect(savedInsights![1].severity).toBe("discuss_soon");
  });
});

describe("refreshMemory", () => {
  test("falls through to a full build when no memory exists", async () => {
    const result = await refreshMemory("acct1");
    expect(result).toEqual({ updated: true, reason: "no_prior_memory" });
    expect(savedRow).not.toBeNull();
  });

  test("skips the AI entirely when no category content changed", async () => {
    // Build once to record content hashes.
    await buildInitialMemory("acct1");
    memoryRow = savedRow;
    aiPrompts = [];
    savedRow = null;

    const result = await refreshMemory("acct1");
    expect(result).toEqual({ updated: false, reason: "no_changes" });
    expect(aiPrompts).toHaveLength(0);
    expect(savedRow).toBeNull();
  });

  test("feeds only the changed categories to the AI", async () => {
    await buildInitialMemory("acct1");
    memoryRow = savedRow;
    aiPrompts = [];

    scraperData.set("get_medications", {
      medications: [{ name: "Lisinopril" }, { name: "Atorvastatin" }],
    });

    const result = await refreshMemory("acct1");
    expect(result).toEqual({ updated: true });
    expect(aiPrompts).toHaveLength(1);
    expect(aiPrompts[0]).toContain("get_medications");
    expect(aiPrompts[0]).toContain("Atorvastatin");
    // Unchanged category is not re-sent.
    expect(aiPrompts[0]).not.toContain("get_allergies");
  });

  test("reports no_data when every fetch fails", async () => {
    memoryRow = {
      account_id: "acct1",
      summary_md: "s",
      facts_json: "[]",
      generated_at: "2026-01-01T00:00:00.000Z",
      generator_model: "test",
    };
    scraperData.clear();
    expect(await refreshMemory("acct1")).toEqual({ updated: false, reason: "no_data" });
  });

  test("reports ai_error when the refresh completion fails", async () => {
    await buildInitialMemory("acct1");
    memoryRow = savedRow;
    scraperData.set("get_medications", { medications: [] });
    aiResponse = new Error("503");

    expect(await refreshMemory("acct1")).toEqual({ updated: false, reason: "ai_error" });
  });

  test("reports parse_error when the refresh response is garbage", async () => {
    await buildInitialMemory("acct1");
    memoryRow = savedRow;
    scraperData.set("get_medications", { medications: [] });
    aiResponse = "not json";

    expect(await refreshMemory("acct1")).toEqual({ updated: false, reason: "parse_error" });
  });

  test("reports no_account for unknown accounts", async () => {
    expect(await refreshMemory("missing")).toEqual({ updated: false, reason: "no_account" });
  });
});

describe("loadDigestForChat", () => {
  test("returns null when no memory exists", async () => {
    expect(await loadDigestForChat("acct1")).toBeNull();
  });

  test("combines the summary with the trailing user-reported facts", async () => {
    const facts = Array.from({ length: 35 }, (_, i) => ({ text: `fact ${i}` }));
    memoryRow = {
      account_id: "acct1",
      summary_md: "## Demographics\nHomer",
      facts_json: JSON.stringify(facts),
      generated_at: "2026-01-01T00:00:00.000Z",
      generator_model: "test",
    };

    const digest = await loadDigestForChat("acct1");
    expect(digest).toContain("## Demographics");
    expect(digest).toContain("## User-Reported Facts");
    // Only the last 30 facts make the digest.
    expect(digest).not.toContain("- fact 4\n");
    expect(digest).toContain("- fact 34");
  });

  test("ignores a corrupt facts blob and still returns the summary", async () => {
    memoryRow = {
      account_id: "acct1",
      summary_md: "## Summary",
      facts_json: "{nope",
      generated_at: "2026-01-01T00:00:00.000Z",
      generator_model: "test",
    };
    expect(await loadDigestForChat("acct1")).toBe("## Summary");
  });
});

describe("category coverage", () => {
  test("the ingest list covers the clinically useful categories", () => {
    expect(MEMORY_CATEGORIES).toContain("get_medications");
    expect(MEMORY_CATEGORIES).toContain("get_lab_results");
    expect(MEMORY_CATEGORIES.length).toBeGreaterThanOrEqual(10);
  });
});
