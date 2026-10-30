import { describe, test, expect } from 'bun:test';
import { browserPasswordDbExists } from '../password-import';

describe('browserPasswordDbExists', () => {
  test('returns a boolean', () => {
    const result = browserPasswordDbExists();
    expect(typeof result).toBe('boolean');
  });

  // On macOS CI/dev machines, Chrome is usually installed
  // This test just verifies the function doesn't throw
  test('does not throw on any platform', () => {
    expect(() => browserPasswordDbExists()).not.toThrow();
  });
});
