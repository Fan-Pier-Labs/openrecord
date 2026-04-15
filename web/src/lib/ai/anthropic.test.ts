import { describe, expect, test } from 'bun:test';
import { computeAnthropicCostCents } from './anthropic';

describe('computeAnthropicCostCents', () => {
  test('charges Sonnet rates for claude-sonnet-4-6', () => {
    // 1M input ($3) + 1M output ($15) = $18 = 1800 cents
    const cents = computeAnthropicCostCents('claude-sonnet-4-6', {
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
    });
    expect(cents).toBe(1800);
  });

  test('counts cache reads cheaper than fresh input', () => {
    // Sonnet: input $3/M, cacheRead $0.3/M. 1M cache read = $0.30 = 30 cents
    const cents = computeAnthropicCostCents('claude-sonnet-4-6', {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 1_000_000,
    });
    expect(cents).toBe(30);
  });

  test('unknown model falls back to Sonnet pricing', () => {
    const unknown = computeAnthropicCostCents('claude-future-model', {
      input_tokens: 1_000_000,
      output_tokens: 0,
    });
    const sonnet = computeAnthropicCostCents('claude-sonnet-4-6', {
      input_tokens: 1_000_000,
      output_tokens: 0,
    });
    expect(unknown).toBe(sonnet);
  });

  test('small token counts round up to at least 1 cent', () => {
    const cents = computeAnthropicCostCents('claude-sonnet-4-6', {
      input_tokens: 1,
      output_tokens: 1,
    });
    expect(cents).toBeGreaterThanOrEqual(1);
  });
});
