import { describe, it, expect } from 'bun:test';
import { createCipheriv, createHash, pbkdf2Sync, randomBytes } from 'crypto';
import { parseDer } from '../der';
import { decryptField, pbeDecrypt } from '../firefox';

/**
 * NSS blob handling, exercised against blobs encoded exactly the way Firefox
 * encodes them. These paths fail *quietly* when they are wrong — a bad key or a
 * mis-sized IV yields garbage rather than an exception — so every assertion is
 * on recovered plaintext.
 *
 * The three subtleties each get a test of their own: the 14-byte PBES2 IV, the
 * per-field cipher, and picking a key by the length its cipher needs when
 * several keys share one CKA_ID.
 */

// ── Minimal DER encoder (the mirror of der.ts) ──────────────────────────────

function encodeLength(length: number): Buffer {
  if (length < 0x80) return Buffer.from([length]);
  const bytes: number[] = [];
  let remaining = length;
  while (remaining > 0) {
    bytes.unshift(remaining & 0xff);
    remaining = Math.floor(remaining / 256);
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

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

const OID_PBES2 = '2a864886f70d01050d';
const OID_PBKDF2 = '2a864886f70d01050c';
const OID_AES256_CBC = '60864801650304012a';
const OID_3DES_CBC = '2a864886f70d0307';

// ── Builders that reproduce Firefox's own encoding ──────────────────────────

const GLOBAL_SALT = Buffer.from('0123456789abcdef0123456789abcdef', 'hex');
const ITERATIONS = 10_000;

/**
 * Wrap `secret` the way NSS wraps `nssPrivate.a11` and the password-check.
 *
 * Note the IV handling: only 14 bytes go into the blob, while AES is given
 * `04 0e` + those 14. That asymmetry is the format, and the whole point of the
 * test — an implementation that uses the stored 14 bytes directly cannot
 * decrypt this.
 */
function wrapPbes2(secret: Buffer, globalSalt = GLOBAL_SALT, masterPassword = Buffer.alloc(0)): {
  algorithm: Buffer;
  ciphertext: Buffer;
} {
  const entrySalt = randomBytes(32);
  const storedIv = randomBytes(14);
  const realIv = Buffer.concat([Buffer.from([0x04, 0x0e]), storedIv]);

  const seed = createHash('sha1').update(globalSalt).update(masterPassword).digest();
  const key = pbkdf2Sync(seed, entrySalt, ITERATIONS, 32, 'sha256');

  const cipher = createCipheriv('aes-256-cbc', key, realIv);
  const ciphertext = Buffer.concat([cipher.update(secret), cipher.final()]);

  const algorithm = sequence(
    oid(OID_PBES2),
    sequence(
      sequence(oid(OID_PBKDF2), sequence(octet(entrySalt), integer(ITERATIONS), integer(32))),
      sequence(oid(OID_AES256_CBC), octet(storedIv)),
    ),
  );
  return { algorithm, ciphertext };
}

/** Encode one logins.json field the way Firefox does. */
function encodeField(
  plaintext: string,
  key: Buffer,
  cipherOid: string,
  keyId = Buffer.from('f8000000000000000000000000000001', 'hex'),
): string {
  const isAes = cipherOid === OID_AES256_CBC;
  const iv = randomBytes(isAes ? 16 : 8);
  const cipher = createCipheriv(isAes ? 'aes-256-cbc' : 'des-ede3-cbc', key.subarray(0, isAes ? 32 : 24), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);

  return sequence(octet(keyId), sequence(oid(cipherOid), octet(iv)), octet(ciphertext)).toString('base64');
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('pbeDecrypt (PBES2)', () => {
  it('recovers the password-check marker', () => {
    const { algorithm, ciphertext } = wrapPbes2(Buffer.from('password-check', 'utf-8'));
    const decrypted = pbeDecrypt(parseDer(algorithm), ciphertext, GLOBAL_SALT, Buffer.alloc(0));

    expect(decrypted.toString('utf-8')).toBe('password-check');
  });

  it('recovers a 24-byte key without eating the padding block', () => {
    // 24 bytes pads to 32 with eight 0x08s; stripping too much or too little
    // would leave a key that decrypts to garbage rather than throwing.
    const secret = randomBytes(24);
    const { algorithm, ciphertext } = wrapPbes2(secret);

    expect(pbeDecrypt(parseDer(algorithm), ciphertext, GLOBAL_SALT, Buffer.alloc(0)).equals(secret)).toBe(true);
  });

  it('recovers a 32-byte key', () => {
    const secret = randomBytes(32);
    const { algorithm, ciphertext } = wrapPbes2(secret);

    expect(pbeDecrypt(parseDer(algorithm), ciphertext, GLOBAL_SALT, Buffer.alloc(0)).equals(secret)).toBe(true);
  });

  it('does not recover the secret under a different global salt', () => {
    const secret = randomBytes(24);
    const { algorithm, ciphertext } = wrapPbes2(secret);
    const wrongSalt = Buffer.alloc(32, 9);

    // A wrong salt is a wrong key: either it throws, or it yields other bytes.
    let recovered: Buffer | null = null;
    try {
      recovered = pbeDecrypt(parseDer(algorithm), ciphertext, wrongSalt, Buffer.alloc(0));
    } catch {
      recovered = null;
    }
    expect(recovered?.equals(secret) ?? false).toBe(false);
  });
});

describe('decryptField', () => {
  const aesKey = randomBytes(32);
  const tripleDesKey = randomBytes(24);

  it('decrypts an AES-256-CBC field, which is what current Firefox writes', () => {
    const encoded = encodeField('donuts123', aesKey, OID_AES256_CBC);
    expect(decryptField(encoded, [aesKey])).toBe('donuts123');
  });

  it('decrypts a legacy 3DES field, which old profiles still contain', () => {
    const encoded = encodeField('donuts123', tripleDesKey, OID_3DES_CBC);
    expect(decryptField(encoded, [tripleDesKey])).toBe('donuts123');
  });

  it('picks the key by the length the cipher needs, not by CKA_ID', () => {
    // The real trap: a long-lived key4.db holds a 24-byte 3DES key and a
    // 32-byte AES key under the SAME CKA_ID, so the id cannot discriminate.
    // Both fields are encoded with the same id and must still resolve.
    const keys = [aesKey, tripleDesKey]; // sorted longest-first, as unwrapKeys returns

    expect(decryptField(encodeField('aes-secret', aesKey, OID_AES256_CBC), keys)).toBe('aes-secret');
    expect(decryptField(encodeField('des-secret', tripleDesKey, OID_3DES_CBC), keys)).toBe('des-secret');
  });

  it('round-trips a value that is an exact block multiple', () => {
    const value = 'sixteencharacter';
    expect(decryptField(encodeField(value, aesKey, OID_AES256_CBC), [aesKey])).toBe(value);
  });

  it('round-trips non-ASCII as UTF-8', () => {
    const value = 'pässwörd–✓';
    expect(decryptField(encodeField(value, aesKey, OID_AES256_CBC), [aesKey])).toBe(value);
  });

  it('refuses a cipher it does not implement instead of guessing', () => {
    const encoded = sequence(
      octet(Buffer.alloc(16)),
      sequence(oid('2a864886f70d0302'), octet(randomBytes(8))), // rc2-cbc
      octet(randomBytes(16)),
    ).toString('base64');

    expect(() => decryptField(encoded, [aesKey])).toThrow(/unsupported field cipher/);
  });

  it('says so when no key is long enough for the field', () => {
    expect(() => decryptField(encodeField('x', aesKey, OID_AES256_CBC), [tripleDesKey])).toThrow(/at least 32/);
  });
});
