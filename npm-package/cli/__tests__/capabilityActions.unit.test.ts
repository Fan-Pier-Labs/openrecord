import { describe, it, expect } from 'bun:test';
import { jsonSafeReplacer } from '../capabilityActions';

describe('jsonSafeReplacer', () => {
  it('summarizes Uint8Arrays', () => {
    expect(jsonSafeReplacer('k', new Uint8Array(5))).toBe('<5 bytes>');
  });

  it('summarizes Buffers through JSON.stringify', () => {
    // JSON.stringify calls Buffer.toJSON() before the replacer runs, so the
    // replacer sees { type: 'Buffer', data: [...] } — it must catch that shape
    // or download_imaging_study floods the terminal with raw byte arrays.
    const out = JSON.parse(JSON.stringify({ pixelData: Buffer.alloc(3) }, jsonSafeReplacer));
    expect(out.pixelData).toBe('<3 bytes>');
  });

  it('leaves ordinary values and lookalike objects alone', () => {
    expect(jsonSafeReplacer('k', 'text')).toBe('text');
    expect(jsonSafeReplacer('k', 42)).toBe(42);
    expect(jsonSafeReplacer('k', null)).toBeNull();
    const notABuffer = { type: 'Buffer', data: 'not-an-array' };
    expect(jsonSafeReplacer('k', notABuffer)).toBe(notABuffer);
  });
});
