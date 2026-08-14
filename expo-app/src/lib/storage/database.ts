import * as SQLite from "expo-sqlite";
import { MAX_CACHED_LOGOS, PRUNE_LOGOS_SQL, SCHEMA_SQL } from "./schema";

let db: SQLite.SQLiteDatabase;

export async function initDatabase(): Promise<void> {
  db = await SQLite.openDatabaseAsync("openrecord.db");
  await db.execAsync(SCHEMA_SQL);
}

function getDb(): SQLite.SQLiteDatabase {
  if (!db) throw new Error("Database not initialized. Call initDatabase() first.");
  return db;
}

// ─── Chats ───

export type Chat = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export async function createChat(title = "New Chat"): Promise<Chat> {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const now = new Date().toISOString();
  await getDb().runAsync(
    "INSERT INTO chats (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
    id, title, now, now
  );
  return { id, title, created_at: now, updated_at: now };
}

export async function getChats(): Promise<Chat[]> {
  return getDb().getAllAsync<Chat>("SELECT * FROM chats ORDER BY updated_at DESC");
}

export async function getChat(id: string): Promise<Chat | null> {
  return getDb().getFirstAsync<Chat>("SELECT * FROM chats WHERE id = ?", id);
}

export async function updateChatTitle(id: string, title: string): Promise<void> {
  const now = new Date().toISOString();
  await getDb().runAsync(
    "UPDATE chats SET title = ?, updated_at = ? WHERE id = ?",
    title, now, id
  );
}

export async function deleteChat(id: string): Promise<void> {
  await getDb().runAsync("DELETE FROM messages WHERE chat_id = ?", id);
  await getDb().runAsync("DELETE FROM chats WHERE id = ?", id);
}

export async function touchChat(id: string): Promise<void> {
  const now = new Date().toISOString();
  await getDb().runAsync("UPDATE chats SET updated_at = ? WHERE id = ?", now, id);
}

// ─── Messages ───

export type Message = {
  id: string;
  chat_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  tool_calls: string | null;
  tool_results: string | null;
  created_at: string;
};

export async function addMessage(
  chatId: string,
  role: Message["role"],
  content: string,
  toolCalls?: string,
  toolResults?: string,
): Promise<Message> {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const now = new Date().toISOString();
  await getDb().runAsync(
    "INSERT INTO messages (id, chat_id, role, content, tool_calls, tool_results, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    id, chatId, role, content, toolCalls ?? null, toolResults ?? null, now
  );
  await touchChat(chatId);
  return { id, chat_id: chatId, role, content, tool_calls: toolCalls ?? null, tool_results: toolResults ?? null, created_at: now };
}

export async function getMessages(chatId: string): Promise<Message[]> {
  return getDb().getAllAsync<Message>(
    "SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC",
    chatId
  );
}

// ─── Alerts ───

export type AlertType = "bill" | "refill" | "message" | "lab" | "appointment";
export type AlertActionKind = "open_url" | "request_refill" | "ai_chat";

export type Alert = {
  id: string;
  type: AlertType;
  title: string;
  description: string;
  metadata: string;
  cta_label: string;
  uses_ai: number;
  action_kind: AlertActionKind;
  action_payload: string;
  dedup_key: string;
  created_at: string;
  dismissed_at: string | null;
};

export type AlertInput = {
  type: AlertType;
  title: string;
  description: string;
  metadata: Record<string, unknown>;
  cta_label: string;
  uses_ai: boolean;
  action_kind: AlertActionKind;
  action_payload: Record<string, unknown>;
  dedup_key: string;
};

export async function getActiveAlerts(): Promise<Alert[]> {
  return getDb().getAllAsync<Alert>(
    "SELECT * FROM alerts WHERE dismissed_at IS NULL ORDER BY created_at DESC"
  );
}

export async function dismissAlert(id: string): Promise<void> {
  const now = new Date().toISOString();
  await getDb().runAsync(
    "UPDATE alerts SET dismissed_at = ? WHERE id = ?",
    now, id
  );
}

export async function upsertAlerts(inputs: AlertInput[]): Promise<{
  added: number;
  skipped: number;
}> {
  let added = 0;
  let skipped = 0;
  for (const a of inputs) {
    const existing = await getDb().getFirstAsync<{ id: string }>(
      "SELECT id FROM alerts WHERE dedup_key = ?",
      a.dedup_key,
    );
    if (existing) {
      skipped += 1;
      continue;
    }
    const id = `alert_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    await getDb().runAsync(
      `INSERT INTO alerts (id, type, title, description, metadata, cta_label, uses_ai, action_kind, action_payload, dedup_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      a.type,
      a.title,
      a.description,
      JSON.stringify(a.metadata),
      a.cta_label,
      a.uses_ai ? 1 : 0,
      a.action_kind,
      JSON.stringify(a.action_payload),
      a.dedup_key,
    );
    added += 1;
  }
  return { added, skipped };
}

export async function searchChats(query: string): Promise<Chat[]> {
  const pattern = `%${query}%`;
  return getDb().getAllAsync<Chat>(
    `SELECT DISTINCT c.* FROM chats c
     LEFT JOIN messages m ON c.id = m.chat_id
     WHERE c.title LIKE ? OR m.content LIKE ?
     ORDER BY c.updated_at DESC`,
    pattern, pattern
  );
}

// ─── Memory Summary ───

export type MemorySummaryRow = {
  account_id: string;
  summary_md: string;
  facts_json: string;
  generated_at: string;
  generator_model: string;
};

export async function getMemorySummary(accountId: string): Promise<MemorySummaryRow | null> {
  return getDb().getFirstAsync<MemorySummaryRow>(
    "SELECT * FROM memory_summary WHERE account_id = ?",
    accountId,
  );
}

export async function setMemorySummary(row: MemorySummaryRow): Promise<void> {
  await getDb().runAsync(
    `INSERT INTO memory_summary (account_id, summary_md, facts_json, generated_at, generator_model)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(account_id) DO UPDATE SET
       summary_md = excluded.summary_md,
       facts_json = excluded.facts_json,
       generated_at = excluded.generated_at,
       generator_model = excluded.generator_model`,
    row.account_id, row.summary_md, row.facts_json, row.generated_at, row.generator_model,
  );
}

export async function deleteMemoryForAccount(accountId: string): Promise<void> {
  await getDb().runAsync("DELETE FROM memory_summary WHERE account_id = ?", accountId);
  await getDb().runAsync("DELETE FROM insights WHERE account_id = ?", accountId);
  await getDb().runAsync("DELETE FROM memory_sync_state WHERE account_id = ?", accountId);
}

// ─── Insights ───

export type InsightRow = {
  id: string;
  account_id: string;
  title: string;
  body_md: string;
  severity: "info" | "discuss" | "discuss_soon";
  suggested_question: string | null;
  source_refs: string | null;
  status: "active" | "dismissed" | "snoozed";
  created_at: string;
  updated_at: string;
};

export async function listInsights(
  accountId: string,
  status: InsightRow["status"] | "all" = "active",
): Promise<InsightRow[]> {
  if (status === "all") {
    return getDb().getAllAsync<InsightRow>(
      "SELECT * FROM insights WHERE account_id = ? ORDER BY created_at DESC",
      accountId,
    );
  }
  return getDb().getAllAsync<InsightRow>(
    "SELECT * FROM insights WHERE account_id = ? AND status = ? ORDER BY created_at DESC",
    accountId, status,
  );
}

export type InsightInput = {
  title: string;
  body_md: string;
  severity: InsightRow["severity"];
  suggested_question?: string | null;
  source_refs?: string | null;
};

export async function upsertInsightsForAccount(
  accountId: string,
  insights: InsightInput[],
): Promise<void> {
  // Title-based dedupe: if an insight with the same title exists for this
  // account, update it (and reactivate if dismissed). Otherwise insert.
  const now = new Date().toISOString();
  for (const ins of insights) {
    const existing = await getDb().getFirstAsync<InsightRow>(
      "SELECT * FROM insights WHERE account_id = ? AND title = ? LIMIT 1",
      accountId, ins.title,
    );
    if (existing) {
      await getDb().runAsync(
        `UPDATE insights SET body_md = ?, severity = ?, suggested_question = ?, source_refs = ?, status = 'active', updated_at = ?
         WHERE id = ?`,
        ins.body_md, ins.severity, ins.suggested_question ?? null, ins.source_refs ?? null, now, existing.id,
      );
    } else {
      const id = `ins_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      await getDb().runAsync(
        `INSERT INTO insights (id, account_id, title, body_md, severity, suggested_question, source_refs, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
        id, accountId, ins.title, ins.body_md, ins.severity, ins.suggested_question ?? null, ins.source_refs ?? null, now, now,
      );
    }
  }
}

export async function setInsightStatus(
  insightId: string,
  status: InsightRow["status"],
): Promise<void> {
  const now = new Date().toISOString();
  await getDb().runAsync(
    "UPDATE insights SET status = ?, updated_at = ? WHERE id = ?",
    status, now, insightId,
  );
}

// ─── Memory Sync State ───

export type SyncStateRow = {
  account_id: string;
  category: string;
  last_seen_at: string | null;
  last_synced_at: string;
};

export async function getSyncState(
  accountId: string,
  category: string,
): Promise<SyncStateRow | null> {
  return getDb().getFirstAsync<SyncStateRow>(
    "SELECT * FROM memory_sync_state WHERE account_id = ? AND category = ?",
    accountId, category,
  );
}

export async function getAllSyncStates(accountId: string): Promise<SyncStateRow[]> {
  return getDb().getAllAsync<SyncStateRow>(
    "SELECT * FROM memory_sync_state WHERE account_id = ?",
    accountId,
  );
}

export async function setSyncState(
  accountId: string,
  category: string,
  lastSeenAt: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  await getDb().runAsync(
    `INSERT INTO memory_sync_state (account_id, category, last_seen_at, last_synced_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(account_id, category) DO UPDATE SET
       last_seen_at = excluded.last_seen_at,
       last_synced_at = excluded.last_synced_at`,
    accountId, category, lastSeenAt, now,
  );
}

// ─── MyChart directory (the instance list and its logos) ───

/**
 * The whole instance list as one row, not 1400 of them.
 *
 * Nothing queries it in SQL — the picker filters the list in memory, because
 * it re-filters on every keystroke — so rows would buy nothing and cost a
 * 1400-statement write on every refresh. It is stored purely so a cold start
 * with no network shows the list the last one fetched.
 */
export async function getCachedDirectory(): Promise<{ json: string; refreshedAt: string } | null> {
  const row = await getDb().getFirstAsync<{ instances_json: string; refreshed_at: string }>(
    "SELECT instances_json, refreshed_at FROM mychart_directory WHERE id = 1",
  );
  return row ? { json: row.instances_json, refreshedAt: row.refreshed_at } : null;
}

export async function setCachedDirectory(json: string): Promise<void> {
  await getDb().runAsync(
    `INSERT INTO mychart_directory (id, instances_json, refreshed_at) VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       instances_json = excluded.instances_json,
       refreshed_at = excluded.refreshed_at`,
    json, new Date().toISOString(),
  );
}

/** A logo already fetched, as a data URI ready for an `<Image source>`. */
export async function getCachedLogo(logoUrl: string): Promise<string | null> {
  const row = await getDb().getFirstAsync<{ data_uri: string }>(
    "SELECT data_uri FROM mychart_logos WHERE logo_url = ?",
    logoUrl,
  );
  return row?.data_uri ?? null;
}

export async function setCachedLogo(logoUrl: string, dataUri: string): Promise<void> {
  await getDb().runAsync(
    `INSERT INTO mychart_logos (logo_url, data_uri, fetched_at) VALUES (?, ?, ?)
     ON CONFLICT(logo_url) DO UPDATE SET
       data_uri = excluded.data_uri,
       fetched_at = excluded.fetched_at`,
    logoUrl, dataUri, new Date().toISOString(),
  );
  await getDb().runAsync(PRUNE_LOGOS_SQL, MAX_CACHED_LOGOS);
}
