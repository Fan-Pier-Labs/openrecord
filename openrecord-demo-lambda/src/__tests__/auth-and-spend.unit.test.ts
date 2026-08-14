/**
 * The signed-in tier: Google ID-token verification, the per-tier model
 * allow-lists, the spend ledger, and the GET spend endpoint.
 *
 * Tokens are forged with a locally generated RSA keypair whose public JWK is
 * injected into google-auth's cert cache — so the "valid" tokens here are
 * valid signatures over our own key, and a token signed by anyone else fails
 * exactly like it would in production.
 */

import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { generateKeyPairSync, createSign } from 'node:crypto';
import { verifyGoogleIdToken, _setCertsForTest } from '../google-auth.mjs';
import { handler, _spendStore } from '../handler.mjs';
import { estimateCostMicros, monthKey, ledgerKey, createMemorySpendStore } from '../spend.mjs';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the seams into the untyped .mjs handler: the fetch stub, the node KeyObject threaded through forgeToken, and the handler's per-branch response union, where `body` is unreachable without widening
type Any = any;

const WEB_CLIENT_ID = 'test-client.apps.googleusercontent.com';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-kid', alg: 'RS256', use: 'sig' };

const { privateKey: rogueKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function forgeToken(
  claims: Record<string, unknown> = {},
  { key = privateKey, kid = 'test-kid' }: { key?: Any; kid?: string } = {},
): string {
  const header = b64url(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({
      iss: 'https://accounts.google.com',
      aud: WEB_CLIENT_ID,
      sub: 'user-123',
      exp: Math.floor(Date.now() / 1000) + 3600,
      ...claims,
    }),
  );
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  const signature = signer.sign(key);
  return `${header}.${payload}.${b64url(signature)}`;
}

const post = (body: unknown, token?: string, sourceIp = '198.51.100.77') => ({
  requestContext: { http: { method: 'POST', sourceIp } },
  headers: token ? { authorization: `Bearer ${token}` } : {},
  body: JSON.stringify(body),
  isBase64Encoded: false,
});

const get = (token?: string) => ({
  requestContext: { http: { method: 'GET', sourceIp: '198.51.100.77' } },
  headers: token ? { authorization: `Bearer ${token}` } : {},
});

const parse = (res: Any) => JSON.parse(res.body);

const geminiReply = (text: string, inputTokens = 1000, outputTokens = 500) => ({
  candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }],
  usageMetadata: { promptTokenCount: inputTokens, candidatesTokenCount: outputTokens },
});

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  process.env.GEMINI_API_KEY = 'test-key';
  process.env.GOOGLE_WEB_CLIENT_ID = WEB_CLIENT_ID;
  _setCertsForTest([jwk]);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.GOOGLE_WEB_CLIENT_ID;
  delete process.env.SPEND_LIMIT_CENTS;
  _setCertsForTest(null, 0);
});

function stubUpstream(response: { status?: number; body?: unknown }) {
  const captured: { url?: string } = {};
  globalThis.fetch = (async (url: string) => {
    captured.url = String(url);
    return new Response(JSON.stringify(response.body ?? {}), { status: response.status ?? 200 });
  }) as Any;
  return captured;
}

describe('verifyGoogleIdToken', () => {
  const clientIds = new Set([WEB_CLIENT_ID]);

  test('accepts a well-formed token signed by a known key', async () => {
    const out = await verifyGoogleIdToken(forgeToken({ email: 'a@b.c' }), clientIds);
    expect(out.sub).toBe('user-123');
    expect(out.email).toBe('a@b.c');
  });

  test('rejects a token signed by the wrong key', async () => {
    expect(verifyGoogleIdToken(forgeToken({}, { key: rogueKey }), clientIds)).rejects.toThrow('Bad signature');
  });

  test('rejects a tampered payload', async () => {
    const token = forgeToken();
    const [h, , s] = token.split('.');
    const tampered = `${h}.${b64url(JSON.stringify({ iss: 'https://accounts.google.com', aud: WEB_CLIENT_ID, sub: 'someone-else', exp: Math.floor(Date.now() / 1000) + 3600 }))}.${s}`;
    expect(verifyGoogleIdToken(tampered, clientIds)).rejects.toThrow('Bad signature');
  });

  test('rejects the wrong audience', async () => {
    expect(verifyGoogleIdToken(forgeToken({ aud: 'someone-elses-app' }), clientIds)).rejects.toThrow('Wrong audience');
  });

  test('rejects the wrong issuer', async () => {
    expect(verifyGoogleIdToken(forgeToken({ iss: 'https://evil.example' }), clientIds)).rejects.toThrow('Wrong issuer');
  });

  test('rejects an expired token', async () => {
    expect(
      verifyGoogleIdToken(forgeToken({ exp: Math.floor(Date.now() / 1000) - 10 }), clientIds),
    ).rejects.toThrow('Token expired');
  });

  test('rejects garbage', async () => {
    expect(verifyGoogleIdToken('not-a-jwt', clientIds)).rejects.toThrow('Malformed token');
  });
});

describe('spend math', () => {
  test('prices flash traffic', () => {
    // 1M input at $0.30 + 1M output at $2.50 = $2.80 = 2_800_000 micros
    expect(
      estimateCostMicros('gemini-2.5-flash', { promptTokenCount: 1_000_000, candidatesTokenCount: 1_000_000 }),
    ).toBe(2_800_000);
  });

  test('pro costs more than flash for the same traffic', () => {
    const usage = { promptTokenCount: 10_000, candidatesTokenCount: 10_000 };
    expect(estimateCostMicros('gemini-2.5-pro', usage)).toBeGreaterThan(
      estimateCostMicros('gemini-2.5-flash', usage),
    );
  });

  test('ledger keys are per user per month', () => {
    const jan = new Date('2026-01-15T00:00:00Z');
    const feb = new Date('2026-02-15T00:00:00Z');
    expect(ledgerKey('u1', jan)).not.toBe(ledgerKey('u1', feb));
    expect(ledgerKey('u1', jan)).not.toBe(ledgerKey('u2', jan));
    expect(monthKey(jan)).toBe('2026-01');
  });

  test('the memory store accumulates', async () => {
    const store = createMemorySpendStore();
    await store.add('k', 100);
    await store.add('k', 50);
    expect(await store.get('k')).toBe(150);
  });
});

describe('handler auth tiers', () => {
  test('a verified token unlocks gemini-2.5-pro', async () => {
    const captured = stubUpstream({ body: geminiReply('deep thought') });
    const res = await handler(
      post({ system: '', messages: [{ role: 'user', content: 'hi' }], model: 'gemini-2.5-pro' }, forgeToken({ sub: 'pro-user' })),
    );
    expect(res.statusCode).toBe(200);
    expect(parse(res).model).toBe('gemini-2.5-pro');
    expect(captured.url).toContain('gemini-2.5-pro:generateContent');
  });

  test('no token → pro is refused with 403', async () => {
    stubUpstream({ body: geminiReply('nope') });
    const res = await handler(
      post({ system: '', messages: [{ role: 'user', content: 'hi' }], model: 'gemini-2.5-pro' }),
    );
    expect(res.statusCode).toBe(403);
    expect(parse(res).error).toContain('requires sign-in');
  });

  test('an invalid token is a 401, not a silent downgrade', async () => {
    stubUpstream({ body: geminiReply('nope') });
    const res = await handler(
      post({ system: '', messages: [{ role: 'user', content: 'hi' }] }, forgeToken({}, { key: rogueKey })),
    );
    expect(res.statusCode).toBe(401);
    expect(parse(res).error).toContain('Sign in again');
  });

  test('unauthenticated flash still works (the demo path)', async () => {
    stubUpstream({ body: geminiReply('pong') });
    const res = await handler(post({ system: '', messages: [{ role: 'user', content: 'ping' }] }, undefined, '198.51.100.78'));
    expect(res.statusCode).toBe(200);
    expect(parse(res).text).toBe('pong');
  });
});

describe('spend enforcement', () => {
  test('successful signed-in calls are metered and readable via GET', async () => {
    const sub = `meter-${Math.random().toString(36).slice(2)}`;
    stubUpstream({ body: geminiReply('ok', 1_000_000, 100_000) });
    const res = await handler(post({ system: '', messages: [{ role: 'user', content: 'hi' }] }, forgeToken({ sub })));
    expect(res.statusCode).toBe(200);

    // 1M in ($0.30) + 100k out ($0.25) = $0.55 → 55 cents
    const spendRes = await handler(get(forgeToken({ sub })));
    expect(spendRes.statusCode).toBe(200);
    const spend = parse(spendRes);
    expect(spend.spentCents).toBe(55);
    expect(spend.limitCents).toBe(5000);
    expect(spend.remainingCents).toBe(4945);
    expect(spend.period).toBe(monthKey());
  });

  test('GET without a token is a 401', async () => {
    const res = await handler(get());
    expect(res.statusCode).toBe(401);
  });

  test('a user over the monthly limit is refused with 402', async () => {
    const sub = `capped-${Math.random().toString(36).slice(2)}`;
    await _spendStore.add(ledgerKey(sub), 51_000_000); // $51 spent
    stubUpstream({ body: geminiReply('should not be reached') });
    const res = await handler(post({ system: '', messages: [{ role: 'user', content: 'hi' }] }, forgeToken({ sub })));
    expect(res.statusCode).toBe(402);
    expect(parse(res).error).toContain('credit is used up');
    expect(parse(res).spentCents).toBe(5100);
  });

  test('the cap is configurable via SPEND_LIMIT_CENTS', async () => {
    process.env.SPEND_LIMIT_CENTS = '100';
    const sub = `tiny-${Math.random().toString(36).slice(2)}`;
    await _spendStore.add(ledgerKey(sub), 1_010_000); // $1.01 spent of a $1 cap
    stubUpstream({ body: geminiReply('should not be reached') });
    const res = await handler(post({ system: '', messages: [{ role: 'user', content: 'hi' }] }, forgeToken({ sub })));
    expect(res.statusCode).toBe(402);
  });
});
