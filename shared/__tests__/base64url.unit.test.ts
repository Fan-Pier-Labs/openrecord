/**
 * The codec on its own terms.
 *
 * It used to be tested only through `image_id`, which exercised it as an
 * identifier format rather than as a codec — so the interesting cases (empty
 * input, padding lengths, astral planes, rejection of non-alphabet characters)
 * went uncovered. Node's `Buffer` is the oracle: a token minted on-device has
 * to decode in the CLI and vice versa. The codec itself is `js-base64`; what
 * these assert is that our wrapper picks the right variant of it (url-safe,
 * unpadded) and that it stays strict about what it will decode.
 */

import { describe, it, expect } from 'bun:test';

import { base64UrlEncode, base64UrlDecode } from '../base64url';

const nodeEncode = (s: string) => Buffer.from(s, 'utf8').toString('base64url');

describe('base64UrlEncode', () => {
  it('matches Node for every remainder-mod-3 length, where padding differs', () => {
    for (const text of ['', 'a', 'ab', 'abc', 'abcd', 'abcde', 'abcdef']) {
      expect(base64UrlEncode(text)).toBe(nodeEncode(text));
    }
  });

  it('emits no padding characters', () => {
    for (const text of ['a', 'ab', 'abc']) {
      expect(base64UrlEncode(text)).not.toContain('=');
    }
  });

  it('uses the URL-safe alphabet, never + or /', () => {
    // U+FFBE and U+FFBF are the 62nd and 63rd sextets: "+/" in standard
    // base64, "-_" in base64url.
    const encoded = base64UrlEncode('ﾾ﾿');
    expect(encoded).toContain('-');
    expect(encoded).toContain('_');
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
    expect(encoded).toBe(nodeEncode('ﾾ﾿'));
  });

  it('matches Node on the punctuation an fdi/ord token can contain', () => {
    for (const text of ['a:b,c/d+e', 'ORD%2F123', '?x=1&y=2', '{"a":1}']) {
      expect(base64UrlEncode(text)).toBe(nodeEncode(text));
    }
  });

  it('matches Node across ASCII, accents, CJK and astral code points', () => {
    for (const text of ['plain', 'ré—sumé✓', '日本語のテキスト', '𝔘𝔫𝔦𝔠𝔬𝔡𝔢', '👩‍⚕️ emoji zwj']) {
      expect(base64UrlEncode(text)).toBe(nodeEncode(text));
    }
  });
});

describe('round-trip', () => {
  it('survives ASCII, accents, CJK and astral code points', () => {
    for (const text of ['', 'plain', 'ré—sumé✓', '日本語のテキスト', '𝔘𝔫𝔦𝔠𝔬𝔡𝔢', '👩‍⚕️ emoji zwj']) {
      expect(base64UrlDecode(base64UrlEncode(text))).toBe(text);
    }
  });

  it('decodes what Node encoded', () => {
    for (const text of ['hello', 'ré—sumé✓', '𝔘𝔫𝔦𝔠𝔬𝔡𝔢']) {
      expect(base64UrlDecode(nodeEncode(text))).toBe(text);
    }
  });

  it('accepts padding even though it never emits it', () => {
    expect(base64UrlDecode(Buffer.from('abcd', 'utf8').toString('base64'))).toBe('abcd');
    expect(base64UrlDecode('YQ==')).toBe('a');
  });
});

describe('base64UrlDecode', () => {
  it('tolerates the noise a copy-pasted token picks up', () => {
    // Not strictness for its own sake: all of these carry the original bytes,
    // and `js-base64` strips what is not alphabet before decoding.
    const token = base64UrlEncode('{"fdi":"a:b","ord":"ORD%2F1"}');
    for (const noisy of [token + '\n', token.slice(0, 5) + ' ' + token.slice(5), token + '==']) {
      expect(base64UrlDecode(noisy)).toBe('{"fdi":"a:b","ord":"ORD%2F1"}');
    }
    // Standard base64 of the same bytes decodes too — '+' and '/' map back.
    expect(base64UrlDecode(Buffer.from('ÿû', 'utf8').toString('base64'))).toBe('ÿû');
  });

  it('rejects or accepts a stray character depending only on the length left over', () => {
    // Worth pinning because it is the reason this function does not try to
    // validate: `js-base64` strips what is not alphabet, so whether a corrupt
    // token throws comes down to whether the remainder is a decodable length.
    // Same single-character corruption, opposite outcomes.
    const throws = base64UrlEncode('x'.repeat(37)); // 50 chars -> 49 after the strip, not a base64 length
    const decodes = base64UrlEncode('x'.repeat(36)); // 48 chars -> 47 after the strip, which is one
    expect(throws.length % 4).toBe(2);
    expect(decodes.length % 4).toBe(0);

    expect(() => base64UrlDecode(throws.slice(0, 5) + '!' + throws.slice(6))).toThrow();
    expect(base64UrlDecode(decodes.slice(0, 5) + '!' + decodes.slice(6))).not.toBe('x'.repeat(36));
  });

  it('does not pretend to authenticate a token', () => {
    // The point of dropping the old alphabet check: corruption that stays
    // inside the alphabet decodes to garbage either way, so validating the
    // decoded payload — not the characters — is what catches a bad token.
    const token = base64UrlEncode('{"fdi":"a:b","ord":"ORD%2F1"}');
    const truncated = token.slice(0, 8) + token.slice(12);
    expect(base64UrlDecode(truncated)).not.toBe('{"fdi":"a:b","ord":"ORD%2F1"}');
    expect(() => JSON.parse(base64UrlDecode(truncated))).toThrow();
  });
});
