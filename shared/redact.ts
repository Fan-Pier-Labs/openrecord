/**
 * Redaction helpers for values on their way to `logger.*`.
 *
 * The scraper's debug stream is verbose on purpose — it is how a failing
 * login gets diagnosed against an instance nobody here can reach. But the
 * MyChart endpoints it narrates hand back real secrets: the TOTP shared
 * secret from `/api/secondary-validation/TotpQrCode`, the hidden
 * `__RequestVerificationToken` on every form, WebAuthn challenges,
 * `Set-Cookie` session cookies, and the one-time 2FA codes themselves.
 *
 * None of the log destinations are ephemeral — the desktop extension writes
 * to Claude Desktop's log files, the CLI to stdout (often teed to a file),
 * the mobile app to the device console — so a secret that reaches a log
 * outlives the session that created it. Anything derived from a response
 * body, a header map, or a parsed auth payload goes through here first.
 *
 * Every function is total: it never throws, never returns a sensitive value
 * unchanged, and always leaves enough behind (length, key names, shape) to
 * debug with.
 */

/**
 * Substrings that mark a key — or a form/query/JSON field name — as holding
 * a secret. Deliberately broad: over-redacting a debug line costs a little
 * context, under-redacting one writes a credential to disk.
 */
const SENSITIVE_WORDS = [
  'secret',
  'password',
  'passwd',
  'pwd',
  'token',
  'credential',
  'cookie',
  'challenge',
  'signature',
  'assertion',
  'attestation',
  'authorization',
  'apikey',
  'api[-_]?key',
  'privatekey',
  'sessionid',
  'totp',
  'otp',
  'twofactorcode',
  'verificationcode',
  'securityanswer',
  'qrcode',
  'rawid',
  'clientdata',
] as const;

const SENSITIVE_WORD_ALTERNATION = SENSITIVE_WORDS.join('|');

/** Matches a key that contains a sensitive word, or ends in `...Key`. */
const SENSITIVE_KEY_RE = new RegExp(`(?:${SENSITIVE_WORD_ALTERNATION})|key$`, 'i');

/** `"secretKey": "abc"` inside a JSON blob or an inline script. */
const JSON_FIELD_RE = new RegExp(
  `("[\\w$.-]*(?:${SENSITIVE_WORD_ALTERNATION})[\\w$.-]*"\\s*:\\s*")((?:[^"\\\\]|\\\\.)*)(")`,
  'gi',
);

/** `__RequestVerificationToken=abc` in a form body or query string. */
const FORM_FIELD_RE = new RegExp(
  `([\\w$.\\[\\]-]*(?:${SENSITIVE_WORD_ALTERNATION})[\\w$.\\[\\]-]*=)([^&\\s"'<>]+)`,
  'gi',
);

/**
 * The `value` attribute of any `<input>` tag. Not limited to sensitive names:
 * the hidden inputs on a MyChart form are where the CSRF token lives, and a
 * visible input's value is never worth a log line anyway.
 */
const INPUT_VALUE_RE = /(<input\b[^>]*?\bvalue\s*=\s*)(["'])([\s\S]*?)\2/gi;

const MAX_DEPTH = 6;
const MAX_ARRAY_ITEMS = 50;

/** True if a key name suggests its value is a secret. */
export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_RE.test(key);
}

/**
 * Replace a secret with a placeholder that keeps its length — enough to tell
 * "the server sent an empty token" from "the server sent a 32-char one".
 */
export function redactSecret(value: unknown): string {
  if (value === null || value === undefined) return '[absent]';
  if (typeof value === 'string') {
    return value.length === 0 ? '[empty]' : `[redacted ${value.length} chars]`;
  }
  if (typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[redacted array of ${value.length}]`;
  return '[redacted]';
}

/**
 * Deep copy of `value` with every sensitive key's value replaced. Booleans
 * survive (a flag can't be a secret, and `IsPasswordValid` is the whole point
 * of the log line); strings, numbers and objects under a sensitive key do not.
 *
 * Cycles, deep nesting and long arrays are all bounded — this runs on
 * attacker-adjacent input from an endpoint we don't control.
 */
export function redactValue(value: unknown): unknown {
  return redactInner(value, 0, new WeakSet<object>());
}

function redactInner(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[depth limit]';
  if (seen.has(value)) return '[circular]';
  seen.add(value);

  try {
    if (Array.isArray(value)) {
      const items = value.slice(0, MAX_ARRAY_ITEMS).map(item => redactInner(item, depth + 1, seen));
      if (value.length > MAX_ARRAY_ITEMS) items.push(`[+${value.length - MAX_ARRAY_ITEMS} more]`);
      return items;
    }

    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isSensitiveKey(key) ? redactSecret(item) : redactInner(item, depth + 1, seen);
    }
    return out;
  } finally {
    // Only a cycle — the same object on the current path — is `[circular]`.
    // The same object reached twice by different paths is just repeated.
    seen.delete(value);
  }
}

/** `redactValue` followed by `JSON.stringify`, truncated and never throwing. */
export function redactJson(value: unknown, maxLength = 1000): string {
  let serialized: string;
  try {
    serialized = JSON.stringify(redactValue(value)) ?? String(value);
  } catch {
    return '[unserializable]';
  }
  return truncate(serialized, maxLength, serialized.length);
}

/**
 * Make an HTTP response body safe to log.
 *
 * JSON bodies are parsed and key-redacted. Anything else (HTML login pages,
 * form-encoded replies, inline scripts) is scrubbed textually: input values,
 * `"token": "..."` pairs and `token=...` pairs all lose their values. The
 * result is truncated, with the original length noted so a body that is
 * suspiciously short still reads as suspiciously short.
 */
export function redactBody(body: unknown, maxLength = 500): string {
  if (body === null || body === undefined) return '[absent]';
  if (typeof body !== 'string') return redactJson(body, maxLength);

  const trimmed = body.trim();
  if (!trimmed) return '[empty body]';

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return truncate(JSON.stringify(redactValue(JSON.parse(trimmed))), maxLength, body.length);
    } catch {
      // Not actually JSON — fall through to the text scrubber.
    }
  }

  return truncate(scrubText(body), maxLength, body.length);
}

/** Header map with `Set-Cookie`, `Authorization` and friends redacted. */
export function redactHeaders(headers: Headers | Record<string, string>): Record<string, unknown> {
  const plain = headers instanceof Headers ? Object.fromEntries(headers.entries()) : headers;
  return redactValue(plain) as Record<string, unknown>;
}

/** URL with the values of sensitive query parameters removed. */
export function redactUrl(url: string): string {
  const queryStart = url.indexOf('?');
  if (queryStart === -1) return url;
  const [path, query] = [url.slice(0, queryStart), url.slice(queryStart + 1)];
  return `${path}?${replaceFormFields(query)}`;
}

function scrubText(text: string): string {
  const withoutInputValues = text.replace(
    INPUT_VALUE_RE,
    (_match, prefix: string, quote: string, value: string) => `${prefix}${quote}${redactSecret(value)}${quote}`,
  );
  const withoutJsonFields = withoutInputValues.replace(
    JSON_FIELD_RE,
    (_match, prefix: string, value: string, suffix: string) => `${prefix}${redactSecret(value)}${suffix}`,
  );
  return replaceFormFields(withoutJsonFields);
}

function replaceFormFields(text: string): string {
  return text.replace(
    FORM_FIELD_RE,
    (_match, prefix: string, value: string) => `${prefix}${redactSecret(value)}`,
  );
}

function truncate(text: string, maxLength: number, originalLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}… [truncated, ${originalLength} chars total]`;
}
