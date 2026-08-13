/**
 * Portable base64url — no `Buffer`, no `atob`.
 *
 * Tokens encoded here round-trip through a model's output, the CLI's argv and
 * React Native's Hermes runtime. `Buffer` exists in Node but not reliably
 * on-device, and `atob` is not in the Hermes standard library either, so the
 * UTF-8 and base64 steps are done by hand.
 *
 * Output is unpadded base64url — byte-for-byte what Node's
 * `Buffer.toString('base64url')` produces, which `__tests__/base64url.test.ts`
 * asserts. A token minted by any client has to decode in every other one.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** UTF-8 encode, combining surrogate pairs into one code point. */
export function utf8Bytes(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        i++;
      }
    }
    if (code < 0x80) out.push(code);
    else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000) out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    else out.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
  }
  return out;
}

/** UTF-8 decode, re-splitting astral code points into surrogate pairs. */
export function utf8String(bytes: number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; ) {
    // The loop condition guarantees bytes[i] exists; continuation bytes past a
    // truncated sequence read as 0, matching the previous implicit coercion.
    const b = bytes[i]!;
    let code: number;
    if (b < 0x80) { code = b; i += 1; }
    else if (b < 0xe0) { code = ((b & 0x1f) << 6) | ((bytes[i + 1] ?? 0) & 0x3f); i += 2; }
    else if (b < 0xf0) { code = ((b & 0x0f) << 12) | (((bytes[i + 1] ?? 0) & 0x3f) << 6) | ((bytes[i + 2] ?? 0) & 0x3f); i += 3; }
    else {
      code = ((b & 0x07) << 18) | (((bytes[i + 1] ?? 0) & 0x3f) << 12) | (((bytes[i + 2] ?? 0) & 0x3f) << 6) | ((bytes[i + 3] ?? 0) & 0x3f);
      i += 4;
    }
    if (code > 0xffff) {
      code -= 0x10000;
      out += String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff));
    } else {
      out += String.fromCharCode(code);
    }
  }
  return out;
}

/** Encode a string as unpadded base64url. */
export function base64UrlEncode(text: string): string {
  const bytes = utf8Bytes(text);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!; // loop condition guarantees i < bytes.length
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += ALPHABET[b0 >> 2];
    out += ALPHABET[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)];
    if (b1 === undefined) break;
    out += ALPHABET[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)];
    if (b2 === undefined) break;
    out += ALPHABET[b2 & 0x3f];
  }
  return out;
}

/**
 * Decode unpadded (or padded) base64url. Throws on a character outside the
 * alphabet rather than silently producing garbage.
 */
export function base64UrlDecode(encoded: string): string {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of encoded) {
    if (ch === '=') continue;
    const value = ALPHABET.indexOf(ch);
    if (value < 0) throw new Error(`Not base64url: unexpected character ${JSON.stringify(ch)}`);
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return utf8String(bytes);
}
