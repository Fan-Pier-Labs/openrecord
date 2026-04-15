/**
 * Anthropic Messages API proxy. The mobile app sends Anthropic-shaped
 * requests (with tool_use/tool_result blocks) and the server forwards
 * them using its own ANTHROPIC_API_KEY. Cost is tracked against the
 * user's monthly $50 budget.
 */

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const ANTHROPIC_API_BASE = 'https://api.anthropic.com';
const ANTHROPIC_VERSION = '2023-06-01';
const ANTHROPIC_KEY_SECRET_ARN =
  'arn:aws:secretsmanager:us-east-2:555985150976:secret:ANTHROPIC_API_KEY';

/**
 * Per-model pricing, USD per 1M tokens.
 * Keep roughly in sync with https://www.anthropic.com/pricing.
 */
const PRICING: Record<string, { input: number; output: number; cacheRead?: number; cacheWrite?: number }> = {
  'claude-opus-4-6': { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  'claude-sonnet-4-6': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
};

function pricingFor(model: string) {
  if (PRICING[model]) return PRICING[model];
  // Fallback: charge Sonnet rates so we never under-count.
  return PRICING['claude-sonnet-4-6'];
}

let cachedKey: string | null = null;
async function getAnthropicApiKey(): Promise<string> {
  if (cachedKey) return cachedKey;
  if (process.env.ANTHROPIC_API_KEY) {
    cachedKey = process.env.ANTHROPIC_API_KEY;
    return cachedKey;
  }
  const client = new SecretsManagerClient({ region: 'us-east-2' });
  const res = await client.send(new GetSecretValueCommand({ SecretId: ANTHROPIC_KEY_SECRET_ARN }));
  const str = res.SecretString ?? '';
  try {
    const parsed = JSON.parse(str);
    cachedKey = parsed.ANTHROPIC_API_KEY ?? parsed.apiKey ?? str;
  } catch {
    cachedKey = str;
  }
  if (!cachedKey) throw new Error('ANTHROPIC_API_KEY missing');
  return cachedKey;
}

type AnthropicUsage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
};

export function computeAnthropicCostCents(model: string, usage: AnthropicUsage): number {
  const p = pricingFor(model);
  const input = (usage.input_tokens ?? 0) / 1_000_000;
  const output = (usage.output_tokens ?? 0) / 1_000_000;
  const cacheRead = (usage.cache_read_input_tokens ?? 0) / 1_000_000;
  const cacheWrite = (usage.cache_creation_input_tokens ?? 0) / 1_000_000;
  const dollars =
    input * p.input +
    output * p.output +
    cacheRead * (p.cacheRead ?? p.input) +
    cacheWrite * (p.cacheWrite ?? p.input);
  return Math.ceil(dollars * 100);
}

export async function forwardToAnthropic(body: unknown): Promise<{ status: number; json: unknown }> {
  const apiKey = await getAnthropicApiKey();
  const res = await fetch(`${ANTHROPIC_API_BASE}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return { status: res.status, json };
}
