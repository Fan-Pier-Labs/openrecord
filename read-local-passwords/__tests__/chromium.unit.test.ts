import { describe, it, expect } from 'bun:test';
import { createCipheriv, pbkdf2Sync, randomBytes } from 'crypto';
import { decryptPassword } from '../chromium';
import { getChromiumLogins } from '../chromium';

/**
 * Chromium's blob format, exercised against ciphertext built the same way
 * Chromium builds it. A wrong key or IV here does not throw — it yields
 * plausible-looking garbage, or a password that is silently truncated — so the
 * assertions are on the recovered plaintext, not on "it did not throw".
 */

/** The key Chromium derives from its Keychain secret. */
function macKey(secret: string): Buffer {
  return pbkdf2Sync(secret, Buffer.from('saltysalt', 'utf-8'), 1003, 16, 'sha1');
}

/** Encrypt exactly as Chromium does on macOS: AES-128-CBC, IV of sixteen 0x20. */
function encryptMac(key: Buffer, plaintext: string, version = 'v10'): Buffer {
  const cipher = createCipheriv('aes-128-cbc', key, Buffer.alloc(16, 32));
  return Buffer.concat([Buffer.from(version, 'latin1'), cipher.update(plaintext, 'utf-8'), cipher.final()]);
}

/** Encrypt as Chromium does on Windows: AES-256-GCM, 12-byte nonce, tag appended. */
function encryptWindows(key: Buffer, plaintext: string): Buffer {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const body = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  return Buffer.concat([Buffer.from('v10', 'latin1'), nonce, body, cipher.getAuthTag()]);
}

describe('decryptPassword — macOS', () => {
  const key = macKey('c2VjcmV0LWtleQ==');

  it('round-trips a password', () => {
    expect(decryptPassword(key, encryptMac(key, 'donuts123'), 'mac').text).toBe('donuts123');
  });

  it('round-trips a password whose length is an exact block multiple', () => {
    // 16 chars: CBC appends a whole extra block of padding, which a naive
    // unpad would strip from the plaintext instead.
    const password = 'sixteencharacter';
    expect(decryptPassword(key, encryptMac(key, password), 'mac').text).toBe(password);
  });

  it('round-trips non-ASCII, which must survive as UTF-8 not latin1', () => {
    const password = 'pässwörd–✓';
    expect(decryptPassword(key, encryptMac(key, password), 'mac').text).toBe(password);
  });

  it('accepts the v11 prefix as well as v10', () => {
    expect(decryptPassword(key, encryptMac(key, 'hunter2', 'v11'), 'mac').text).toBe('hunter2');
  });

  it('does not return the right password under the wrong key', () => {
    const wrong = macKey('a-different-secret');
    expect(decryptPassword(wrong, encryptMac(key, 'donuts123'), 'mac').text).not.toBe('donuts123');
  });

  it('reports a truncated blob instead of returning partial plaintext', () => {
    const blob = encryptMac(key, 'donuts123').subarray(0, 10);
    expect(decryptPassword(key, blob, 'mac').reason).toBeTruthy();
  });
});

describe('decryptPassword — Windows', () => {
  const key = randomBytes(32);

  it('round-trips a password through AES-256-GCM', () => {
    expect(decryptPassword(key, encryptWindows(key, 'donuts123'), 'windows').text).toBe('donuts123');
  });

  it('rejects a blob whose authentication tag has been altered', () => {
    const blob = encryptWindows(key, 'donuts123');
    blob[blob.length - 1] = (blob[blob.length - 1] ?? 0) ^ 0xff;
    expect(decryptPassword(key, blob, 'windows').text).toBeUndefined();
  });
});

describe('decryptPassword — schemes we do not handle', () => {
  const key = randomBytes(32);

  it('names app-bound encryption rather than calling the row corrupt', () => {
    const blob = Buffer.concat([Buffer.from('v20', 'latin1'), randomBytes(32)]);
    const { text, reason } = decryptPassword(key, blob, 'windows');

    expect(text).toBeUndefined();
    expect(reason).toMatch(/app-bound/i);
  });

  it('passes through a pre-encryption plaintext row', () => {
    // Very old profiles stored the password with no version prefix at all.
    expect(decryptPassword(key, Buffer.from('plaintext-password', 'utf-8'), 'mac').text).toBe('plaintext-password');
  });

  it('treats an empty blob as an empty password, not a failure', () => {
    expect(decryptPassword(key, Buffer.alloc(0), 'mac')).toEqual({ text: '' });
  });
});

describe('getChromiumLogins', () => {
  it('returns nothing on a platform with no supported store', async () => {
    // Linux: Chromium there uses kwallet/gnome-keyring, which this does not
    // read. The guard must be checked against `process.platform` rather than
    // `os.platform()` — the latter is a native call that a test cannot stub, so
    // this assertion would silently run against the developer's real store.
    const original = process.platform;
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    try {
      expect(await getChromiumLogins()).toEqual([]);
    } finally {
      Object.defineProperty(process, 'platform', { value: original, configurable: true });
    }
  });
});
