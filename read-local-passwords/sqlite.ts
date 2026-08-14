/**
 * Read-only access to the SQLite files browsers keep their passwords in
 * (Chromium's `Login Data`, Firefox's `key4.db`).
 *
 * Backed by `node-sqlite3-wasm`: real SQLite, compiled to WebAssembly, so there
 * is no `.node` binary to build or ship per platform. That matters twice over —
 * the MCPB bundles to a single `dist/server.cjs`, and `node:sqlite` is not an
 * option because tsup targets node20 while that module needs Node 22.5+.
 *
 * The build copies `node-sqlite3-wasm.wasm` next to the bundle, because the
 * package resolves it as `__dirname + "/node-sqlite3-wasm.wasm"` at load time.
 */

import { copyFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';

/**
 * Run `read` against a private copy of a browser database.
 *
 * Always a copy, never the original: the browser may be running, and SQLite
 * takes locks and writes `-wal`/`-journal` siblings. Opening the live file
 * risks `SQLITE_BUSY` at best and touching the user's real password store at
 * worst — and this whole package is strictly read-only by policy.
 */
export async function withDatabaseCopy<T>(
  databasePath: string,
  read: (db: { all(sql: string): Record<string, unknown>[] }) => T,
): Promise<T> {
  // Load-bearing dynamic import: node-sqlite3-wasm instantiates a 1.2 MB
  // WebAssembly module at require time. A static import would make every
  // consumer of this package — including the capability registry, which is
  // imported by all four clients — pay that cost on startup even when nobody
  // ever reads a password store.
  // eslint-disable-next-line no-restricted-syntax
  const { Database } = await import('node-sqlite3-wasm');

  const scratch = mkdtempSync(path.join(tmpdir(), 'openrecord-pwstore-'));
  const copy = path.join(scratch, path.basename(databasePath));
  try {
    copyFileSync(databasePath, copy);
    const db = new Database(copy, { readOnly: true });
    try {
      return read({ all: (sql: string) => db.all(sql) });
    } finally {
      db.close();
    }
  } finally {
    // The copy holds decryptable credentials; do not leave it in the temp dir.
    rmSync(scratch, { recursive: true, force: true });
  }
}

/**
 * Coerce a column that should be text into a string.
 *
 * Written out rather than using `String(value)` because a driver may hand back
 * a Buffer for a TEXT column, and `String(buffer)` would stringify the object
 * rather than decode it.
 */
export function toText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') return String(value);
  if (Buffer.isBuffer(value)) return value.toString('utf-8');
  if (value instanceof Uint8Array) return Buffer.from(value).toString('utf-8');
  return null;
}

/** Coerce a column that should be binary into a Buffer, whatever the driver hands back. */
export function toBuffer(value: unknown): Buffer | null {
  if (value == null) return null;
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === 'string') return Buffer.from(value, 'binary');
  return null;
}
