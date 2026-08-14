import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { MAX_CACHED_LOGOS, PRUNE_LOGOS_SQL, SCHEMA_SQL } from "../schema";

/**
 * `initDatabase` runs `SCHEMA_SQL` on every cold start, so it has to be
 * idempotent. It wasn't: `alerts` was a `DROP TABLE IF EXISTS` plus a bare
 * `CREATE`, so every launch rebuilt the table empty and dismissed alerts came
 * back. The SQL is what's under test; bun:sqlite stands in for expo-sqlite.
 */

/** A launch: open the database and apply the schema, as initDatabase does. */
function applySchema(db: Database): void {
  db.run(SCHEMA_SQL);
}

function seedDismissedAlert(db: Database): void {
  db.run(`
    INSERT INTO alerts (id, type, title, description, cta_label, action_kind, dedup_key, dismissed_at)
    VALUES ('a1', 'bill', 'A bill is due', 'Pay it', 'Pay', 'open_url', 'bill:1', '2026-01-01T00:00:00Z');
  `);
}

describe("SCHEMA_SQL", () => {
  it("is idempotent — a second launch keeps dismissed alerts dismissed", () => {
    const db = new Database(":memory:");
    applySchema(db);
    seedDismissedAlert(db);

    applySchema(db); // the next cold start

    const rows = db
      .query<{ id: string; dismissed_at: string | null }, []>("SELECT id, dismissed_at FROM alerts")
      .all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.dismissed_at).toBe("2026-01-01T00:00:00Z");

    // What the home screen actually asks for.
    const active = db.query("SELECT * FROM alerts WHERE dismissed_at IS NULL").all();
    expect(active).toEqual([]);
    db.close();
  });

  it("keeps every other table's rows across a relaunch too", () => {
    const db = new Database(":memory:");
    applySchema(db);
    db.run(`INSERT INTO chats (id, title) VALUES ('c1', 'Kept');`);
    db.run(`
      INSERT INTO memory_summary (account_id, summary_md, facts_json, generated_at, generator_model)
      VALUES ('acct', '# notes', '[]', '2026-01-01', 'test-model');
    `);

    applySchema(db);

    expect(db.query("SELECT id FROM chats").all()).toEqual([{ id: "c1" }]);
    expect(db.query("SELECT account_id FROM memory_summary").all()).toEqual([{ account_id: "acct" }]);
    db.close();
  });

  it("contains no destructive statement at all", () => {
    // The schema runs unconditionally on launch, so a DROP, DELETE or TRUNCATE
    // here is a data-loss bug by construction, whichever table it names.
    // Matched on the verb that OPENS each statement — `ON DELETE CASCADE` is a
    // foreign-key clause, not a deletion.
    const verbs = SCHEMA_SQL.split(';')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.split(/\s+/)[0]!.toUpperCase());

    expect(verbs.length).toBeGreaterThan(0);
    expect(verbs).not.toContain('DROP');
    expect(verbs).not.toContain('DELETE');
    expect(verbs).not.toContain('TRUNCATE');
  });

  it("creates every table with IF NOT EXISTS", () => {
    const creates = SCHEMA_SQL.match(/CREATE TABLE[^(]*/gi) ?? [];
    expect(creates.length).toBeGreaterThan(0);
    for (const statement of creates) {
      expect(statement).toMatch(/CREATE TABLE IF NOT EXISTS/i);
    }
  });

  it("evicts the oldest logos and keeps the newest", () => {
    const db = new Database(":memory:");
    applySchema(db);

    // Fetched in order, oldest first. Distinct timestamps, since the eviction
    // orders on them.
    const total = MAX_CACHED_LOGOS + 5;
    for (let i = 0; i < total; i++) {
      db.run(
        "INSERT INTO mychart_logos (logo_url, data_uri, fetched_at) VALUES (?, 'data:,', ?)",
        [`https://media.epic.com/${i}.png`, new Date(1_700_000_000_000 + i * 1000).toISOString()],
      );
    }

    db.run(PRUNE_LOGOS_SQL, [MAX_CACHED_LOGOS]);

    const kept = db
      .query<{ logo_url: string }, []>("SELECT logo_url FROM mychart_logos")
      .all()
      .map((r) => r.logo_url);
    expect(kept).toHaveLength(MAX_CACHED_LOGOS);
    expect(kept).toContain(`https://media.epic.com/${total - 1}.png`);
    expect(kept).not.toContain("https://media.epic.com/0.png");
    db.close();
  });

  it("still declares the alerts columns the app reads", () => {
    const db = new Database(":memory:");
    applySchema(db);
    const columns = db
      .query<{ name: string }, []>("SELECT name FROM pragma_table_info('alerts')")
      .all()
      .map((c) => c.name);

    expect(columns).toContain("dismissed_at");
    expect(columns).toContain("dedup_key");
    expect(columns).toContain("action_payload");
    db.close();
  });
});
