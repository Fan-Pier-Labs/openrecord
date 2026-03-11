import { describe, expect, test } from 'bun:test';
import { normalizeHostname } from '../utils';

describe('normalizeHostname', () => {
  test('returns bare hostname as-is', () => {
    expect(normalizeHostname('mychart.example.org')).toBe('mychart.example.org');
  });

  test('strips https:// prefix', () => {
    expect(normalizeHostname('https://mychart.example.org')).toBe('mychart.example.org');
  });

  test('strips http:// prefix', () => {
    expect(normalizeHostname('http://portal.example.org')).toBe('portal.example.org');
  });

  test('strips trailing slash', () => {
    expect(normalizeHostname('https://mychart.example.org/')).toBe('mychart.example.org');
  });

  test('strips full URL path', () => {
    expect(normalizeHostname('https://mychart.example.org/mychart/Authentication/Login')).toBe('mychart.example.org');
  });

  test('handles whitespace', () => {
    expect(normalizeHostname('  https://portal.example.org  ')).toBe('portal.example.org');
  });

  test('handles hostname with trailing slash but no protocol', () => {
    expect(normalizeHostname('mychart.example.org/')).toBe('mychart.example.org');
  });
});
