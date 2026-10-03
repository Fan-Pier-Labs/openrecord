/**
 * The whole schema, run by `initDatabase` on every cold start — so every
 * statement must be `CREATE TABLE IF NOT EXISTS`, and anything destructive
 * here destroys user data every time the app opens. `alerts` used to be a
 * `DROP TABLE IF EXISTS` plus a bare `CREATE`, which wiped `dismissed_at` on
 * launch and resurrected every alert the patient had dismissed. A real
 * migration goes in a versioned step after this, never a drop-and-recreate.
 *
 * Its own module so `__tests__/schema.unit.test.ts` can run it against
 * bun:sqlite without importing expo-sqlite.
 */
export const SCHEMA_SQL = `
    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'New Chat',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      tool_calls TEXT,
      tool_results TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      metadata TEXT NOT NULL DEFAULT '{}',
      cta_label TEXT NOT NULL,
      uses_ai INTEGER NOT NULL DEFAULT 0,
      action_kind TEXT NOT NULL,
      action_payload TEXT NOT NULL DEFAULT '{}',
      dedup_key TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      dismissed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS memory_summary (
      account_id TEXT PRIMARY KEY,
      summary_md TEXT NOT NULL,
      facts_json TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      generator_model TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS insights (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      title TEXT NOT NULL,
      body_md TEXT NOT NULL,
      severity TEXT NOT NULL,
      suggested_question TEXT,
      source_refs TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memory_sync_state (
      account_id TEXT NOT NULL,
      category TEXT NOT NULL,
      last_seen_at TEXT,
      last_synced_at TEXT NOT NULL,
      PRIMARY KEY (account_id, category)
    );

    CREATE TABLE IF NOT EXISTS mychart_directory (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      instances_json TEXT NOT NULL,
      refreshed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mychart_logos (
      logo_url TEXT PRIMARY KEY,
      data_uri TEXT NOT NULL,
      fetched_at TEXT NOT NULL
    );
`;

/**
 * How many provider logos to keep on disk.
 *
 * They are ~30KB each and there are ~1400 of them, so an unbounded cache is
 * 45MB of a patient's phone spent on hospital branding. 300 is far more than
 * anyone scrolls past, and a few MB.
 */
export const MAX_CACHED_LOGOS = 300;

/**
 * Drop everything but the most recently fetched {@link MAX_CACHED_LOGOS}
 * logos. Lives here rather than in `database.ts` so it can be exercised
 * against bun:sqlite — the eviction, not a copy of it, is what the test runs.
 * Takes the limit as its one parameter.
 */
export const PRUNE_LOGOS_SQL = `
    DELETE FROM mychart_logos WHERE logo_url NOT IN (
      SELECT logo_url FROM mychart_logos ORDER BY fetched_at DESC LIMIT ?
    )
`;
