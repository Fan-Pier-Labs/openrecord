import { describe, it, expect } from 'bun:test';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { toBuffer, toText, withDatabaseCopy } from '../sqlite';

/**
 * `withDatabaseCopy` is the only thing standing between us and the user's live
 * password store, so the assertions that matter are: it reads a real SQLite
 * file, it never opens the original, and it does not leave a decryptable copy
 * behind in the temp directory.
 */

/** Build a real SQLite file, the same way a browser would have written one. */
async function makeDatabase(rows: { url: string; user: string; blob: Buffer }[]): Promise<string> {
  const { Database } = await import('node-sqlite3-wasm');
  const dir = mkdtempSync(path.join(tmpdir(), 'openrecord-sqlite-test-'));
  const file = path.join(dir, 'Login Data');

  const db = new Database(file);
  db.run('CREATE TABLE logins (origin_url TEXT, username_value TEXT, password_value BLOB)');
  for (const row of rows) {
    db.run('INSERT INTO logins VALUES (?, ?, ?)', [row.url, row.user, row.blob]);
  }
  db.close();
  return file;
}

describe('withDatabaseCopy', () => {
  it('reads every row of a real database', async () => {
    const file = await makeDatabase([
      { url: 'https://a.example/', user: 'homer', blob: Buffer.from('one') },
      { url: 'https://b.example/', user: 'marge', blob: Buffer.from('two') },
    ]);

    const rows = await withDatabaseCopy(file, db => db.all('SELECT origin_url, username_value, password_value FROM logins'));

    expect(rows).toHaveLength(2);
    expect(rows.map(r => toText(r.origin_url))).toEqual(['https://a.example/', 'https://b.example/']);
    expect(toBuffer(rows[1]!.password_value)?.toString()).toBe('two');

    rmSync(path.dirname(file), { recursive: true, force: true });
  });

  it('returns a blob large enough to have spilled onto overflow pages', async () => {
    // A long password is not exotic — a passphrase or a generated secret gets
    // there — and a truncated read would look like a wrong password.
    const big = Buffer.alloc(9000, 0xab);
    const file = await makeDatabase([{ url: 'https://a.example/', user: 'homer', blob: big }]);

    const rows = await withDatabaseCopy(file, db => db.all('SELECT password_value FROM logins'));

    expect(toBuffer(rows[0]!.password_value)?.length).toBe(9000);
    expect(toBuffer(rows[0]!.password_value)?.equals(big)).toBe(true);

    rmSync(path.dirname(file), { recursive: true, force: true });
  });

  it('leaves no copy of the database behind', async () => {
    const file = await makeDatabase([{ url: 'https://a.example/', user: 'homer', blob: Buffer.from('x') }]);
    const before = readdirSync(tmpdir()).filter(name => name.startsWith('openrecord-pwstore-'));

    await withDatabaseCopy(file, db => db.all('SELECT 1'));

    const after = readdirSync(tmpdir()).filter(name => name.startsWith('openrecord-pwstore-'));
    expect(after.length).toBe(before.length);

    rmSync(path.dirname(file), { recursive: true, force: true });
  });

  it('cleans up even when the read throws', async () => {
    const file = await makeDatabase([{ url: 'https://a.example/', user: 'homer', blob: Buffer.from('x') }]);
    const before = readdirSync(tmpdir()).filter(name => name.startsWith('openrecord-pwstore-'));

    await expect(
      withDatabaseCopy(file, () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    const after = readdirSync(tmpdir()).filter(name => name.startsWith('openrecord-pwstore-'));
    expect(after.length).toBe(before.length);

    rmSync(path.dirname(file), { recursive: true, force: true });
  });

  it('rejects a file that is not a database, rather than returning nothing', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'openrecord-sqlite-test-'));
    const file = path.join(dir, 'Login Data');
    writeFileSync(file, 'this is not a sqlite file');

    await expect(withDatabaseCopy(file, db => db.all('SELECT 1 FROM logins'))).rejects.toThrow();

    rmSync(dir, { recursive: true, force: true });
  });

  it('does not touch the original file', async () => {
    const file = await makeDatabase([{ url: 'https://a.example/', user: 'homer', blob: Buffer.from('x') }]);

    await withDatabaseCopy(file, db => db.all('SELECT 1'));

    // A write would have left SQLite's sidecar files next to the original.
    const siblings = readdirSync(path.dirname(file));
    expect(siblings).toEqual(['Login Data']);
    expect(existsSync(file)).toBe(true);

    rmSync(path.dirname(file), { recursive: true, force: true });
  });
});

describe('toText', () => {
  it('decodes a Buffer as UTF-8 rather than stringifying the object', () => {
    expect(toText(Buffer.from('homer', 'utf-8'))).toBe('homer');
  });

  it('passes a string through', () => {
    expect(toText('homer')).toBe('homer');
  });

  it('maps null and undefined to null', () => {
    expect(toText(null)).toBeNull();
    expect(toText(undefined)).toBeNull();
  });

  it('renders a numeric column as text', () => {
    expect(toText(42)).toBe('42');
  });
});

describe('toBuffer', () => {
  it('passes a Buffer through', () => {
    expect(toBuffer(Buffer.from([1, 2, 3]))?.equals(Buffer.from([1, 2, 3]))).toBe(true);
  });

  it('converts a Uint8Array', () => {
    expect(toBuffer(new Uint8Array([1, 2, 3]))?.equals(Buffer.from([1, 2, 3]))).toBe(true);
  });

  it('maps null to null', () => {
    expect(toBuffer(null)).toBeNull();
  });
});
