
/**
 * Web shim for expo-sqlite — uses in-memory storage backed by localStorage.
 * Implements just enough of the SQLiteDatabase API to support our usage.
 *
 * The work is synchronous; the public methods mirror expo-sqlite's async
 * signatures and hand back an already-resolved promise.
 */

type Row = Record<string, unknown>;

// Simple in-memory table storage backed by localStorage
const tables: Record<string, Row[]> = {};

function loadTable(name: string): Row[] {
  const existing = tables[name];
  if (existing) return existing;
  let rows: Row[];
  try {
    const stored = localStorage.getItem(`sqlite_${name}`);
    rows = stored ? JSON.parse(stored) : [];
  } catch {
    rows = [];
  }
  tables[name] = rows;
  return rows;
}

function saveTable(name: string) {
  localStorage.setItem(`sqlite_${name}`, JSON.stringify(tables[name] || []));
}

class WebSQLiteDatabase {
  execAsync(sql: string): Promise<void> {
    this.execNow(sql);
    return Promise.resolve();
  }

  runAsync(sql: string, ...params: unknown[]): Promise<{ changes: number }> {
    return Promise.resolve(this.runNow(sql, ...params));
  }

  getAllAsync<T>(sql: string, ...params: unknown[]): Promise<T[]> {
    return Promise.resolve(this.getAllNow<T>(sql, ...params));
  }

  async getFirstAsync<T>(sql: string, ...params: unknown[]): Promise<T | null> {
    const results = await this.getAllAsync<T>(sql, ...params);
    return results[0] || null;
  }

  private execNow(sql: string): void {
    // CREATE TABLE statements — just ensure tables exist
    const createMatch = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/gi);
    if (createMatch) {
      for (const match of createMatch) {
        const tableName = match.replace(/CREATE TABLE IF NOT EXISTS /i, "").trim();
        loadTable(tableName);
      }
    }
  }

  private runNow(sql: string, ...params: unknown[]): { changes: number } {
    const sqlLower = sql.trim().toLowerCase();

    if (sqlLower.startsWith("insert into")) {
      const table = /INSERT INTO (\w+)/i.exec(sql)?.[1];
      if (!table) return { changes: 0 };
      const rows = loadTable(table);

      // Extract column names from the SQL
      const colList = /\(([^)]+)\)\s*VALUES/i.exec(sql)?.[1];
      if (!colList) return { changes: 0 };
      const cols = colList.split(",").map((c) => c.trim());

      const row: Row = {};
      cols.forEach((col, i) => {
        // Replace datetime('now') placeholder values with actual ISO dates
        const val = params[i];
        row[col] = val ?? null;
      });
      rows.push(row);
      saveTable(table);
      return { changes: 1 };
    }

    if (sqlLower.startsWith("update")) {
      const table = /UPDATE (\w+)/i.exec(sql)?.[1];
      if (!table) return { changes: 0 };
      const rows = loadTable(table);

      // Extract SET column names (only those with ? placeholders)
      const setClause = /SET (.+?) WHERE/i.exec(sql)?.[1];
      if (!setClause) return { changes: 0 };
      const setCols: string[] = [];
      for (const part of setClause.split(",")) {
        const colName = (part.split("=")[0] ?? "").trim();
        // Only include columns bound to ? params, skip SQL expressions
        if (part.includes("?")) {
          setCols.push(colName);
        }
      }

      // WHERE value is the last param
      const idValue = params[params.length - 1];
      let changes = 0;
      for (const row of rows) {
        if (row.id === idValue) {
          setCols.forEach((col, i) => {
            row[col] = params[i] ?? null;
          });
          changes++;
        }
      }
      if (changes > 0) saveTable(table);
      return { changes };
    }

    if (sqlLower.startsWith("delete from")) {
      const table = /DELETE FROM (\w+)/i.exec(sql)?.[1];
      if (!table) return { changes: 0 };
      const rows = loadTable(table);
      const idValue = params[params.length - 1];
      const before = rows.length;
      const remaining = rows.filter((r) => r.id !== idValue && r.chat_id !== idValue);
      tables[table] = remaining;
      saveTable(table);
      return { changes: before - remaining.length };
    }

    return { changes: 0 };
  }

  private getAllNow<T>(sql: string, ...params: unknown[]): T[] {
    const table = /FROM (\w+)/i.exec(sql)?.[1];
    if (!table) return [];
    const rows = loadTable(table);

    let filtered = [...rows];

    // Simple WHERE clause handling
    if (sql.toLowerCase().includes("where")) {
      const conditions = /WHERE\s+(.+?)(?:\s+ORDER|\s*$)/i.exec(sql)?.[1];
      if (conditions) {
        if (conditions.includes("chat_id = ?")) {
          filtered = filtered.filter((r) => r.chat_id === params[0]);
        } else if (conditions.includes("id = ?")) {
          filtered = filtered.filter((r) => r.id === params[0]);
        } else if (conditions.includes("LIKE")) {
          const pattern = String(params[0] || "").replace(/%/g, "").toLowerCase();
          if (pattern) {
            filtered = filtered.filter(
              (r) =>
                String(r.title || "").toLowerCase().includes(pattern) ||
                String(r.content || "").toLowerCase().includes(pattern)
            );
          }
        }
      }
    }

    // ORDER BY
    if (sql.toLowerCase().includes("order by")) {
      const orderMatch = /ORDER BY (\w+)\s*(ASC|DESC)?/i.exec(sql);
      const col = orderMatch?.[1];
      if (orderMatch && col) {
        const desc = orderMatch[2]?.toUpperCase() === "DESC";
        filtered.sort((a, b) => {
          const va = String(a[col] || "");
          const vb = String(b[col] || "");
          return desc ? vb.localeCompare(va) : va.localeCompare(vb);
        });
      }
    }

    return filtered as T[];
  }
}

export function openDatabaseAsync(_name: string): Promise<WebSQLiteDatabase> {
  return Promise.resolve(new WebSQLiteDatabase());
}
