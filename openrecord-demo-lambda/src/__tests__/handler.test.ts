/**
 * The demo AI proxy.
 *
 * This endpoint is public and unauthenticated, so the tests that matter are
 * the ones covering abuse: the guard preamble the client can't remove, the
 * size caps, the rate limiter, and the rule that upstream error bodies never
 * reach the caller.
 */

import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
// @ts-expect-error — zero-dep ES module, no type declarations by design
import { handler, validatePayload, buildGeminiRequest, extractText, checkRateLimit } from '../handler.mjs';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const post = (body: unknown, sourceIp = '203.0.113.1') => ({
  requestContext: { http: { method: 'POST', sourceIp } },
  body: typeof body === 'string' ? body : JSON.stringify(body),
  isBase64Encoded: false,
});

const parse = (res: Any) => JSON.parse(res.body);

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  process.env.GEMINI_API_KEY = 'test-key';
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

/** Stub the Gemini REST call. */
function stubUpstream(response: { status?: number; body?: unknown; text?: string }) {
  const captured: { url?: string; body?: Any } = {};
  globalThis.fetch = (async (url: string, init: Any) => {
    captured.url = String(url);
    captured.body = JSON.parse(init.body);
    if (response.text !== undefined) {
      return new Response(response.text, { status: response.status ?? 200 });
    }
    return new Response(JSON.stringify(response.body ?? {}), { status: response.status ?? 200 });
  }) as Any;
  return captured;
}

const geminiReply = (text: string) => ({
  candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }],
  usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
});

describe('validatePayload', () => {
  test('accepts a well-formed conversation', () => {
    const out = validatePayload({ system: 'sys', messages: [{ role: 'user', content: 'hi' }] });
    expect(out.system).toBe('sys');
    expect(out.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  test('normalizes unknown roles to user', () => {
    const out = validatePayload({ messages: [{ role: 'system', content: 'x' }, { role: 'assistant', content: 'y' }] });
    expect(out.messages.map((m: Any) => m.role)).toEqual(['user', 'assistant']);
  });

  test('drops blank messages but rejects an all-blank conversation', () => {
    const out = validatePayload({ messages: [{ role: 'user', content: 'keep' }, { role: 'user', content: '   ' }] });
    expect(out.messages).toHaveLength(1);
    expect(() => validatePayload({ messages: [{ role: 'user', content: '  ' }] })).toThrow('at least one non-empty');
  });

  test('rejects a missing or empty messages array', () => {
    expect(() => validatePayload({})).toThrow('non-empty array');
    expect(() => validatePayload({ messages: [] })).toThrow('non-empty array');
    expect(() => validatePayload({ messages: 'nope' })).toThrow('non-empty array');
  });

  test('caps the message count', () => {
    const messages = Array.from({ length: 41 }, () => ({ role: 'user', content: 'x' }));
    expect(() => validatePayload({ messages })).toThrow('Too many messages');
  });

  test('caps a single message and the whole conversation', () => {
    expect(() => validatePayload({ messages: [{ role: 'user', content: 'x'.repeat(24_001) }] })).toThrow('Message too long');

    const messages = Array.from({ length: 20 }, () => ({ role: 'user', content: 'x'.repeat(20_000) }));
    expect(() => validatePayload({ messages })).toThrow('Conversation too large');
  });

  test('truncates an oversized system prompt rather than rejecting it', () => {
    const out = validatePayload({ system: 's'.repeat(30_000), messages: [{ role: 'user', content: 'hi' }] });
    expect(out.system).toHaveLength(24_000);
  });

  test('size errors carry a 413 for the caller', () => {
    try {
      validatePayload({ messages: [{ role: 'user', content: 'x'.repeat(24_001) }] });
      throw new Error('should have thrown');
    } catch (err) {
      expect((err as Any).statusCode).toBe(413);
    }
  });
});

describe('buildGeminiRequest', () => {
  test('always prepends the guard preamble', () => {
    const req = buildGeminiRequest({ system: 'CLIENT PROMPT', messages: [{ role: 'user', content: 'hi' }] });
    const instruction = req.systemInstruction.parts[0].text;
    expect(instruction).toContain('public product demo for OpenRecord');
    expect(instruction).toContain('CLIENT PROMPT');
    // The guard has to come first so it frames what follows.
    expect(instruction.indexOf('OpenRecord')).toBeLessThan(instruction.indexOf('CLIENT PROMPT'));
  });

  test('the guard survives an empty client prompt', () => {
    const req = buildGeminiRequest({ system: '', messages: [{ role: 'user', content: 'hi' }] });
    expect(req.systemInstruction.parts[0].text).toContain('No real person is involved');
  });

  test('maps assistant turns to the model role', () => {
    const req = buildGeminiRequest({
      system: '',
      messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }],
    });
    expect(req.contents.map((c: Any) => c.role)).toEqual(['user', 'model']);
    expect(req.contents[1].parts[0].text).toBe('b');
  });

  test('caps output and disables thinking for cost and latency', () => {
    const req = buildGeminiRequest({ system: '', messages: [{ role: 'user', content: 'hi' }] });
    expect(req.generationConfig.maxOutputTokens).toBe(2048);
    expect(req.generationConfig.thinkingConfig.thinkingBudget).toBe(0);
  });
});

describe('extractText', () => {
  test('joins every text part', () => {
    expect(extractText({ candidates: [{ content: { parts: [{ text: 'a' }, { text: 'b' }] } }] })).toBe('ab');
  });

  test('returns empty for a blocked or malformed response instead of throwing', () => {
    expect(extractText({})).toBe('');
    expect(extractText({ candidates: [] })).toBe('');
    expect(extractText({ candidates: [{ content: {} }] })).toBe('');
  });
});

describe('checkRateLimit', () => {
  test('allows up to the limit, then reports a wait', () => {
    const ip = `198.51.100.${Math.floor(Math.random() * 200)}`;
    const now = 1_000_000;
    for (let i = 0; i < 40; i++) expect(checkRateLimit(ip, now)).toBeNull();
    const retryAfter = checkRateLimit(ip, now);
    expect(retryAfter).toBeGreaterThan(0);
  });

  test('the window resets', () => {
    const ip = `198.51.100.${200 + Math.floor(Math.random() * 50)}`;
    const now = 2_000_000;
    for (let i = 0; i < 41; i++) checkRateLimit(ip, now);
    expect(checkRateLimit(ip, now)).toBeGreaterThan(0);
    expect(checkRateLimit(ip, now + 11 * 60 * 1000)).toBeNull();
  });

  test('one IP hitting the limit does not block another', () => {
    const now = 3_000_000;
    const noisy = '192.0.2.10';
    for (let i = 0; i < 41; i++) checkRateLimit(noisy, now);
    expect(checkRateLimit(noisy, now)).toBeGreaterThan(0);
    expect(checkRateLimit('192.0.2.11', now)).toBeNull();
  });
});

describe('handler', () => {
  test('answers a preflight and rejects non-POST', async () => {
    expect((await handler({ requestContext: { http: { method: 'OPTIONS' } } })).statusCode).toBe(204);
    const res = await handler({ requestContext: { http: { method: 'GET' } } });
    expect(res.statusCode).toBe(405);
  });

  test('returns 503 when no key is configured', async () => {
    delete process.env.GEMINI_API_KEY;
    const res = await handler(post({ messages: [{ role: 'user', content: 'hi' }] }));
    expect(res.statusCode).toBe(503);
    expect(parse(res).error).toContain('not configured');
  });

  test('rejects invalid JSON', async () => {
    const res = await handler(post('{not json'));
    expect(res.statusCode).toBe(400);
    expect(parse(res).error).toBe('Invalid JSON');
  });

  test('proxies a valid request and returns the text', async () => {
    const captured = stubUpstream({ body: geminiReply('PONG') });
    const res = await handler(post({ system: 'sys', messages: [{ role: 'user', content: 'ping' }] }));

    expect(res.statusCode).toBe(200);
    expect(parse(res).text).toBe('PONG');
    expect(captured.url).toContain('gemini-2.5-flash-lite:generateContent');
    expect(captured.body.contents[0].parts[0].text).toBe('ping');
  });

  test('decodes a base64 body', async () => {
    stubUpstream({ body: geminiReply('ok') });
    const res = await handler({
      requestContext: { http: { method: 'POST', sourceIp: '203.0.113.9' } },
      body: Buffer.from(JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] })).toString('base64'),
      isBase64Encoded: true,
    });
    expect(res.statusCode).toBe(200);
    expect(parse(res).text).toBe('ok');
  });

  test('never forwards an upstream error body', async () => {
    stubUpstream({ status: 400, text: 'API key not valid for project 12345-secret' });
    const res = await handler(post({ messages: [{ role: 'user', content: 'hi' }] }, '203.0.113.20'));

    expect(res.statusCode).toBe(502);
    expect(res.body).not.toContain('12345-secret');
    expect(parse(res).error).toBe('The model returned an error.');
  });

  test('an upstream 429 is passed through as a 429', async () => {
    stubUpstream({ status: 429, text: 'quota' });
    const res = await handler(post({ messages: [{ role: 'user', content: 'hi' }] }, '203.0.113.21'));
    expect(res.statusCode).toBe(429);
  });

  test('a transport failure becomes a 502, not a stack trace', async () => {
    globalThis.fetch = (async () => {
      throw new Error('ECONNRESET');
    }) as Any;
    const res = await handler(post({ messages: [{ role: 'user', content: 'hi' }] }, '203.0.113.22'));

    expect(res.statusCode).toBe(502);
    expect(res.body).not.toContain('ECONNRESET');
  });

  test('a rate-limited caller gets a 429 with Retry-After and no upstream call', async () => {
    const ip = '203.0.113.99';
    let upstreamCalls = 0;
    globalThis.fetch = (async () => {
      upstreamCalls++;
      return new Response(JSON.stringify(geminiReply('ok')), { status: 200 });
    }) as Any;

    // 40 successful calls each emit a usage line; keep the test output readable.
    const log = console.log;
    console.log = () => {};
    let last: Any;
    try {
      for (let i = 0; i < 45; i++) {
        last = await handler(post({ messages: [{ role: 'user', content: 'hi' }] }, ip));
      }
    } finally {
      console.log = log;
    }

    expect(last.statusCode).toBe(429);
    expect(last.headers['retry-after']).toBeTruthy();
    // The limit is 40, so the extra attempts never reached the model.
    expect(upstreamCalls).toBeLessThanOrEqual(40);
  });

  test('oversized payloads are refused before the model is called', async () => {
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return new Response('{}', { status: 200 });
    }) as Any;

    const res = await handler(
      post({ messages: [{ role: 'user', content: 'x'.repeat(30_000) }] }, '203.0.113.30')
    );
    expect(res.statusCode).toBe(413);
    expect(called).toBe(false);
  });
});
