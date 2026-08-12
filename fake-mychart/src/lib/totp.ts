/**
 * RFC 6238 TOTP, server side.
 *
 * Real MyChart validates the code submitted to
 * /api/secondary-validation/VerifyCode against the secret it issued from
 * TotpQrCode — a client that derives the code wrongly is rejected. The fake
 * has to do the same, or the setup flow's one cryptographic step is untested:
 * a scraper returning a hardcoded "000000" would pass a check that only looks
 * for six digits.
 *
 * Zero-dependency on purpose — fake-mychart ships no crypto libraries.
 */

import crypto from 'crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Decode a Base32 (RFC 4648) secret, tolerating lowercase, spaces and padding. */
export function base32Decode(input: string): Buffer {
  const clean = input.replace(/\s+/g, '').replace(/=+$/, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error(`Invalid base32 character: ${char}`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 0xff);
    }
  }
  return Buffer.from(out);
}

/** Encode bytes as Base32 (RFC 4648), unpadded — the form MyChart hands out. */
export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += BASE32_ALPHABET[(value >>> bits) & 31];
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** A fresh 20-byte (160-bit) secret, the size RFC 4226 recommends for HMAC-SHA1. */
export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

/** The 6-digit TOTP for a Base32 secret at a given moment. */
export function generateTotpCode(secret: string, timestampMs: number = Date.now()): string {
  const counter = Math.floor(timestampMs / 1000 / 30);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuf.writeUInt32BE(counter >>> 0, 4);

  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(counterBuf).digest();
  // Dynamic truncation (RFC 4226 §5.3)
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(binary % 1_000_000).padStart(6, '0');
}

/**
 * Is `code` valid for `secret`?
 *
 * Accepts the adjacent time steps as well as the current one. Real MyChart
 * allows the same slack — without it, a code generated a second before a
 * 30-second boundary would be rejected on arrival.
 */
export function verifyTotpCode(secret: string, code: string, timestampMs: number = Date.now()): boolean {
  const submitted = code.trim();
  if (!/^\d{6}$/.test(submitted)) return false;
  for (const step of [-1, 0, 1]) {
    if (generateTotpCode(secret, timestampMs + step * 30_000) === submitted) return true;
  }
  return false;
}
