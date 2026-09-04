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
 * Decode unpadded (or padded) base64url.
 *
 * Deliberately no validation of its own. This used to reject any character
 * outside the alphabet, which sounds safer than it is: corruption that stays
 * inside the alphabet — a truncated or re-ordered token — passes such a check
 * and decodes to garbage anyway, so it bought nothing against the failure that
 * actually matters. What it did buy was rejecting input that decodes correctly
 * (standard base64, a pasted newline, stray padding). `Base64.decode` throws on
 * a length that cannot be base64 and tolerates the rest; callers that need to
 * know a token is *theirs* validate the decoded payload — see `decodeImageId`.
 */
export function base64UrlDecode(encoded: string): string {
  return Base64.decode(encoded);
}
