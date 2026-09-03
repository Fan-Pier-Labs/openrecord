/**
 * Portable base64url, via `js-base64`.
 *
 * Tokens encoded here round-trip through a model's output, the CLI's argv and
 * React Native's Hermes runtime. `Buffer` exists in Node but not reliably
 * on-device, and `atob` is not in the Hermes standard library either — hence a
 * library that falls back to pure JS for both the UTF-8 and the base64 step
 * instead of assuming either global.
 *
 * Output is unpadded base64url — byte-for-byte what Node's
 * `Buffer.toString('base64url')` produces, which `__tests__/base64url.unit.test.ts`
 * asserts. A token minted by any client has to decode in every other one.
 */

import { Base64 } from 'js-base64';

/** Encode a string as unpadded base64url. */
export function base64UrlEncode(text: string): string {
  return Base64.encodeURI(text);
}

/**
 * Decode unpadded (or padded) base64url. Throws on a character outside the
 * alphabet rather than silently producing garbage — `Base64.decode` strips
 * anything it doesn't recognize, including the `+` and `/` of standard base64.
 */
export function base64UrlDecode(encoded: string): string {
  const body = encoded.replace(/={0,2}$/, '');
  const stray = /[^A-Za-z0-9_-]/.exec(body);
  if (stray) throw new Error(`Not base64url: unexpected character ${JSON.stringify(stray[0])}`);
  return Base64.decode(body);
}
