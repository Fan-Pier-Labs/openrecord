import { beforeEach, describe, expect, test, mock } from "bun:test";
import { Database } from "bun:sqlite";

/**
 * Back the expo-sqlite API with bun:sqlite so the real SQL in
 * database.ts runs against a real SQLite engine in memory.
 */
let raw: Database;

mock.module("expo-sqlite", () => ({
  openDatabaseAsync: async () => ({
    execAsync: async (sql: string) => {
      for (const stmt of sql.split(";")) {
        if (stmt.trim()) raw.prepare(stmt).run();
      }
    },
    runAsync: async (sql: string, ...params: unknown[]) => {
      raw.prepare(sql).run(...(params as never[]));
    },
    getAllAsync: async (sql: string, ...params: unknown[]) =>
      raw.prepare(sql).all(...(params as never[])),
    getFirstAsync: async (sql: string, ...params: unknown[]) =>
      raw.prepare(sql).get(...(params as never[])) ?? null,
  }),
}));

const db = await import("@/lib/storage/database");

const tick = () => new Promise((r) => setTimeout(r, 2));

beforeEach(async () => {
  raw = new Database(":memory:");
  await db.initDatabase();
});

describe("chats", () => {
  test("createChat returns a persisted chat with defaults", async () => {
    const chat = await db.createChat();
    expect(chat.title).toBe("New Chat");
    const fetched = await db.getChat(chat.id);
    expect(fetched?.id).toBe(chat.id);
  });

  test("getChats orders by most recently updated", async () => {
    const a = await db.createChat("First");
    await tick();
    const b = await db.createChat("Second");
    await tick();

    let chats = await db.getChats();
    expect(chats.map((c) => c.title)).toEqual(["Second", "First"]);

    await db.touchChat(a.id);
    chats = await db.getChats();
    expect(chats.map((c) => c.title)).toEqual(["First", "Second"]);
    void b;
  });

  test("updateChatTitle renames and bumps updated_at", async () => {
    const chat = await db.createChat("Old");
    await tick();
    await db.updateChatTitle(chat.id, "New Title");
    const fetched = await db.getChat(chat.id);
    expect(fetched?.title).toBe("New Title");
    expect(fetched!.updated_at > chat.updated_at).toBe(true);
  });

  test("deleteChat removes the chat and its messages", async () => {
    const chat = await db.createChat();
    await db.addMessage(chat.id, "user", "hello");
    await db.deleteChat(chat.id);
    expect(await db.getChat(chat.id)).toBeNull();
    expect(await db.getMessages(chat.id)).toEqual([]);
  });

  test("getChat returns null for unknown ids", async () => {
    expect(await db.getChat("missing")).toBeNull();
  });
});

describe("messages", () => {
  test("addMessage stores content and optional tool payloads", async () => {
    const chat = await db.createChat();
    await db.addMessage(chat.id, "user", "What meds am I on?");
    await tick();
    await db.addMessage(chat.id, "assistant", "Lisinopril.", '[{"tool":"get_medications"}]', '["ok"]');

    const messages = await db.getMessages(chat.id);
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("user");
    expect(messages[1].tool_calls).toBe('[{"tool":"get_medications"}]');
    expect(messages[1].tool_results).toBe('["ok"]');
  });

  test("messages come back in chronological order", async () => {
    const chat = await db.createChat();
    for (const text of ["one", "two", "three"]) {
      await db.addMessage(chat.id, "user", text);
      await tick();
    }
    const messages = await db.getMessages(chat.id);
    expect(messages.map((m) => m.content)).toEqual(["one", "two", "three"]);
  });

  test("addMessage touches the parent chat so it sorts to the top", async () => {
    const a = await db.createChat("A");
    await tick();
    await db.createChat("B");
    await tick();
    await db.addMessage(a.id, "user", "bump");
    const chats = await db.getChats();
    expect(chats[0].title).toBe("A");
  });
});

describe("searchChats", () => {
  test("matches on title and message content", async () => {
    const a = await db.createChat("Cholesterol Questions");
    await tick();
    const b = await db.createChat("Random");
    await db.addMessage(b.id, "user", "tell me about my cholesterol");
    await tick();
    await db.createChat("Unrelated");

    const hits = await db.searchChats("cholesterol");
    const ids = hits.map((c) => c.id);
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
    expect(hits).toHaveLength(2);
  });
});

function makeAlert(overrides: Partial<db.AlertInput> = {}): db.AlertInput {
  return {
    type: "bill",
    title: "Outstanding bill",
    description: "$125.00 for Annual physical",
    metadata: { amount: "$125.00" },
    cta_label: "Pay bill",
    uses_ai: false,
    action_kind: "open_url",
    action_payload: { url: "https://example.org/pay" },
    dedup_key: "bill:G123:1",
    ...overrides,
  };
}

describe("alerts", () => {
  test("upsertAlerts inserts new alerts and dedupes by dedup_key", async () => {
    const first = await db.upsertAlerts([makeAlert()]);
    expect(first).toEqual({ added: 1, skipped: 0 });

    const second = await db.upsertAlerts([
      makeAlert(),
      makeAlert({ dedup_key: "refill:lisinopril", type: "refill" }),
    ]);
    expect(second).toEqual({ added: 1, skipped: 1 });

    const active = await db.getActiveAlerts();
    expect(active).toHaveLength(2);
  });

  test("metadata and payload are serialized to JSON", async () => {
    await db.upsertAlerts([makeAlert()]);
    const [alert] = await db.getActiveAlerts();
    expect(JSON.parse(alert.metadata)).toEqual({ amount: "$125.00" });
    expect(JSON.parse(alert.action_payload)).toEqual({ url: "https://example.org/pay" });
    expect(alert.uses_ai).toBe(0);
  });

  test("dismissAlert hides the alert from getActiveAlerts", async () => {
    await db.upsertAlerts([makeAlert()]);
    const [alert] = await db.getActiveAlerts();
    await db.dismissAlert(alert.id);
    expect(await db.getActiveAlerts()).toEqual([]);
  });

  test("dismissed alerts stay dismissed after re-upsert", async () => {
    await db.upsertAlerts([makeAlert()]);
    const [alert] = await db.getActiveAlerts();
    await db.dismissAlert(alert.id);
    const result = await db.upsertAlerts([makeAlert()]);
    expect(result).toEqual({ added: 0, skipped: 1 });
    expect(await db.getActiveAlerts()).toEqual([]);
  });
});

describe("memory summary", () => {
  const row = {
    account_id: "acct1",
    summary_md: "## Demographics\nHomer",
    facts_json: "[]",
    generated_at: "2026-01-01T00:00:00.000Z",
    generator_model: "test-v1",
  };

  test("set + get round-trip", async () => {
    await db.setMemorySummary(row);
    const fetched = await db.getMemorySummary("acct1");
    expect(fetched?.summary_md).toContain("Homer");
  });

  test("set overwrites on conflict", async () => {
    await db.setMemorySummary(row);
    await db.setMemorySummary({ ...row, summary_md: "updated" });
    expect((await db.getMemorySummary("acct1"))?.summary_md).toBe("updated");
  });

  test("deleteMemoryForAccount wipes summary, insights, and sync state", async () => {
    await db.setMemorySummary(row);
    await db.upsertInsightsForAccount("acct1", [
      { title: "T", body_md: "B", severity: "info" },
    ]);
    await db.setSyncState("acct1", "get_medications", "hash1");

    await db.deleteMemoryForAccount("acct1");

    expect(await db.getMemorySummary("acct1")).toBeNull();
    expect(await db.listInsights("acct1", "all")).toEqual([]);
    expect(await db.getAllSyncStates("acct1")).toEqual([]);
  });
});

describe("insights", () => {
  test("upsert inserts new insights as active", async () => {
    await db.upsertInsightsForAccount("acct1", [
      { title: "Elevated ferritin", body_md: "Trend up", severity: "discuss" },
    ]);
    const insights = await db.listInsights("acct1");
    expect(insights).toHaveLength(1);
    expect(insights[0].status).toBe("active");
  });

  test("upsert dedupes by title and reactivates dismissed insights", async () => {
    await db.upsertInsightsForAccount("acct1", [
      { title: "Elevated ferritin", body_md: "v1", severity: "info" },
    ]);
    const [insight] = await db.listInsights("acct1");
    await db.setInsightStatus(insight.id, "dismissed");
    expect(await db.listInsights("acct1")).toEqual([]);

    await db.upsertInsightsForAccount("acct1", [
      { title: "Elevated ferritin", body_md: "v2", severity: "discuss_soon" },
    ]);

    const active = await db.listInsights("acct1");
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(insight.id);
    expect(active[0].body_md).toBe("v2");
    expect(active[0].severity).toBe("discuss_soon");
  });

  test("listInsights filters by status and scopes by account", async () => {
    await db.upsertInsightsForAccount("acct1", [
      { title: "A", body_md: "a", severity: "info" },
    ]);
    await db.upsertInsightsForAccount("acct2", [
      { title: "B", body_md: "b", severity: "info" },
    ]);
    expect(await db.listInsights("acct1")).toHaveLength(1);
    expect(await db.listInsights("acct2")).toHaveLength(1);
    expect(await db.listInsights("acct1", "dismissed")).toEqual([]);
  });
});

describe("memory sync state", () => {
  test("setSyncState inserts then updates on conflict", async () => {
    await db.setSyncState("acct1", "get_medications", "hash1");
    await db.setSyncState("acct1", "get_medications", "hash2");
    await db.setSyncState("acct1", "get_allergies", null);

    const states = await db.getAllSyncStates("acct1");
    expect(states).toHaveLength(2);
    const meds = await db.getSyncState("acct1", "get_medications");
    expect(meds?.last_seen_at).toBe("hash2");
    const allergies = await db.getSyncState("acct1", "get_allergies");
    expect(allergies?.last_seen_at).toBeNull();
  });
});
