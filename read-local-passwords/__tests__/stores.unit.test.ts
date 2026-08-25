import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { createCipheriv, createHash, pbkdf2Sync, randomBytes } from 'crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import * as realOs from 'os';
import * as path from 'path';

/**
 * End-to-end reads of a *synthetic* browser profile.
 *
 * Everything is built in a temp directory that `homedir()` is redirected to,
 * and the Keychain lookup is stubbed. **Nothing here may reach the developer's
 * real password store.** Two earlier drafts of this file did exactly that:
 * `os.platform()` is a native call that cannot be stubbed, and Bun's
 * `os.homedir()` reads the passwd entry rather than `$HOME`. Hence the module
 * mock below — and the "not installed" cases, which fail loudly if the
 * redirection ever stops working.
 */

const tmpdir = realOs.tmpdir;

/** Redirected home directory; reassigned per test, read lazily by the mock. */
let home: string = tmpdir();

void mock.module('os', () => ({
  ...realOs,
  default: { ...realOs, homedir: () => home },
  homedir: () => home,
}));

const KEYCHAIN_SECRET = 'a-fake-safe-storage-secret';
const CHROME_KEY = pbkdf2Sync(KEYCHAIN_SECRET, Buffer.from('saltysalt', 'utf-8'), 1003, 16, 'sha1');

/** Stub `security find-generic-password` so no real Keychain item is read. */
void mock.module('child_process', () => ({
  execFile: (
    file: string,
    args: string[],
    optionsOrCallback: unknown,
    maybeCallback?: (e: Error | null, r: { stdout: string; stderr: string }) => void,
  ) => {
    const callback = (typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback) as
      | ((e: Error | null, r: { stdout: string; stderr: string }) => void)
      | undefined;
    if (file === 'security' && args[1] === '-wa' && args[2] === 'Chrome') {
      callback?.(null, { stdout: `${KEYCHAIN_SECRET}\n`, stderr: '' });
    } else {
      callback?.(new Error('no such keychain item'), { stdout: '', stderr: '' });
    }
    return undefined;
  },
}));

const { getChromiumLogins } = await import('../chromium');
const { getFirefoxLogins } = await import('../firefox');

const originalPlatform = process.platform;

beforeEach(() => {
  home = mkdtempSync(path.join(tmpdir(), 'openrecord-home-'));
  Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
});

// ── Chromium fixture ────────────────────────────────────────────────────────

function encryptChrome(plaintext: string): Buffer {
  const cipher = createCipheriv('aes-128-cbc', CHROME_KEY, Buffer.alloc(16, 32));
  return Buffer.concat([Buffer.from('v10', 'latin1'), cipher.update(plaintext, 'utf-8'), cipher.final()]);
}

async function writeChromeProfile(
  profile: string,
  rows: { url: string; user: string; password: string }[],
): Promise<void> {
  const { Database } = await import('node-sqlite3-wasm');
  const dir = path.join(home, 'Library', 'Application Support', 'Google', 'Chrome', profile);
  mkdirSync(dir, { recursive: true });

  const db = new Database(path.join(dir, 'Login Data'));
  db.run('CREATE TABLE logins (origin_url TEXT, username_value TEXT, password_value BLOB)');
  for (const row of rows) {
    db.run('INSERT INTO logins VALUES (?, ?, ?)', [row.url, row.user, encryptChrome(row.password)]);
  }
  db.close();
}

// ── Firefox fixture ─────────────────────────────────────────────────────────

const encodeLength = (length: number): Buffer => {
  if (length < 0x80) return Buffer.from([length]);
  const bytes: number[] = [];
  let remaining = length;
  while (remaining > 0) {
    bytes.unshift(remaining & 0xff);
    remaining = Math.floor(remaining / 256);
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
};
const node = (tag: number, content: Buffer): Buffer =>
  Buffer.concat([Buffer.from([tag]), encodeLength(content.length), content]);
const sequence = (...children: Buffer[]): Buffer => node(0x30, Buffer.concat(children));
const octet = (content: Buffer): Buffer => node(0x04, content);
const integer = (value: number): Buffer => {
  const bytes: number[] = [];
  let remaining = value;
  do {
    bytes.unshift(remaining & 0xff);
    remaining = Math.floor(remaining / 256);
  } while (remaining > 0);
  return node(0x02, Buffer.from(bytes));
};
const oid = (hex: string): Buffer => node(0x06, Buffer.from(hex, 'hex'));

const GLOBAL_SALT = randomBytes(32);
const NSS_KEY = randomBytes(32);
const ITERATIONS = 1000;

/** Wrap a secret exactly as NSS does: PBES2, with the 14-byte stored IV. */
function wrapPbes2(secret: Buffer): Buffer {
  const entrySalt = randomBytes(32);
  const storedIv = randomBytes(14);
  const key = pbkdf2Sync(
    createHash('sha1').update(GLOBAL_SALT).update(Buffer.alloc(0)).digest(),
    entrySalt,
    ITERATIONS,
    32,
    'sha256',
  );
  const cipher = createCipheriv('aes-256-cbc', key, Buffer.concat([Buffer.from([0x04, 0x0e]), storedIv]));
  const ciphertext = Buffer.concat([cipher.update(secret), cipher.final()]);

  return sequence(
    sequence(
      oid('2a864886f70d01050d'), // PBES2
      sequence(
        sequence(oid('2a864886f70d01050c'), sequence(octet(entrySalt), integer(ITERATIONS), integer(32))),
        sequence(oid('60864801650304012a'), octet(storedIv)), // aes-256-CBC
      ),
    ),
    octet(ciphertext),
  );
}

function encodeLoginField(plaintext: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', NSS_KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  return sequence(
    octet(Buffer.from('f8000000000000000000000000000001', 'hex')),
    sequence(oid('60864801650304012a'), octet(iv)),
    octet(ciphertext),
  ).toString('base64');
}

async function writeFirefoxProfile(
  name: string,
  logins: { hostname: string; user: string; password: string }[],
): Promise<void> {
  const { Database } = await import('node-sqlite3-wasm');
  const dir = path.join(home, 'Library', 'Application Support', 'Firefox', 'Profiles', name);
  mkdirSync(dir, { recursive: true });

  const db = new Database(path.join(dir, 'key4.db'));
  db.run('CREATE TABLE metaData (id TEXT PRIMARY KEY, item1 BLOB, item2 BLOB)');
  db.run('INSERT INTO metaData VALUES (?, ?, ?)', [
    'password',
    GLOBAL_SALT,
    wrapPbes2(Buffer.from('password-check', 'utf-8')),
  ]);
  db.run('CREATE TABLE nssPrivate (a11 BLOB, a102 BLOB)');
  db.run('INSERT INTO nssPrivate VALUES (?, ?)', [
    wrapPbes2(NSS_KEY),
    Buffer.from('f8000000000000000000000000000001', 'hex'),
  ]);
  db.close();

  writeFileSync(
    path.join(dir, 'logins.json'),
    JSON.stringify({
      logins: logins.map(l => ({
        hostname: l.hostname,
        encryptedUsername: encodeLoginField(l.user),
        encryptedPassword: encodeLoginField(l.password),
      })),
    }),
  );
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('getChromiumLogins', () => {
  it('decrypts every row of a profile', async () => {
    await writeChromeProfile('Default', [
      { url: 'https://mychart.example.org/MyChart/', user: 'homer', password: 'donuts123' },
      { url: 'https://other.example/', user: 'marge', password: 'pretzels456' },
    ]);

    const logins = await getChromiumLogins();

    expect(logins).toHaveLength(2);
    expect(logins.every(l => l.success)).toBe(true);
    expect(logins[0]).toMatchObject({ url: 'https://mychart.example.org/MyChart/', user: 'homer', pass: 'donuts123', source: 'Chrome' });
    expect(logins[1]!.pass).toBe('pretzels456');
  });

  it('reads every profile, not just Default', async () => {
    // A household on one machine keeps separate Chrome profiles, and the
    // health login is as likely to be in the second one.
    await writeChromeProfile('Default', [{ url: 'https://a.example/', user: 'homer', password: 'one' }]);
    await writeChromeProfile('Profile 1', [{ url: 'https://b.example/', user: 'marge', password: 'two' }]);

    const logins = await getChromiumLogins();

    expect(logins.map(l => l.pass ?? '').sort((a, b) => a.localeCompare(b))).toEqual(['one', 'two']);
  });

  it('returns nothing when the keychain lookup is refused', async () => {
    // The Edge entry is present, but the stub only answers for Chrome — the
    // same shape as a user clicking Deny on the OS prompt.
    const dir = path.join(home, 'Library', 'Application Support', 'Microsoft Edge', 'Default');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'Login Data'), 'not read — no key');

    expect(await getChromiumLogins()).toEqual([]);
  });

  it('returns nothing when no browser is installed', async () => {
    expect(await getChromiumLogins()).toEqual([]);
  });
});

describe('getFirefoxLogins', () => {
  it('decrypts every login in a profile', async () => {
    await writeFirefoxProfile('abc123.default-release', [
      { hostname: 'https://mychart.example.org', user: 'homer', password: 'donuts123' },
      { hostname: 'https://other.example', user: 'marge', password: 'pretzels456' },
    ]);

    const logins = await getFirefoxLogins();

    expect(logins).toHaveLength(2);
    expect(logins.every(l => l.success)).toBe(true);
    expect(logins[0]).toMatchObject({ url: 'https://mychart.example.org', user: 'homer', pass: 'donuts123', source: 'Firefox' });
  });

  it('reads every profile directory', async () => {
    await writeFirefoxProfile('one.default', [{ hostname: 'https://a.example', user: 'homer', password: 'one' }]);
    await writeFirefoxProfile('two.dev-edition', [{ hostname: 'https://b.example', user: 'marge', password: 'two' }]);

    expect((await getFirefoxLogins()).map(l => l.pass ?? '').sort((a, b) => a.localeCompare(b))).toEqual(['one', 'two']);
  });

  it('skips a profile directory with no saved logins', async () => {
    const dir = path.join(home, 'Library', 'Application Support', 'Firefox', 'Profiles', 'empty.default');
    mkdirSync(dir, { recursive: true });

    expect(await getFirefoxLogins()).toEqual([]);
  });

  it('returns nothing when Firefox is not installed', async () => {
    expect(await getFirefoxLogins()).toEqual([]);
  });
});
