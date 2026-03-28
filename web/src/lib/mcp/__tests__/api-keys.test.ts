import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { createHash } from 'crypto';

// Track calls to the mock db
let updateSetValues: Record<string, unknown> = {};
let updateWhereUserId = '';
let selectResult: Record<string, unknown>[] = [];

function createMockDb() {
  return {
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: (condition: unknown) => {
          updateSetValues = values;
          // Extract userId from the drizzle condition (simplified mock)
          return Promise.resolve([]);
        },
      }),
    }),
    select: (fields?: Record<string, unknown>) => ({
      from: () => ({
        where: () => Promise.resolve(selectResult),
      }),
    }),
  };
}

const mockDb = createMockDb();

// Mock drizzle module
mock.module('../../drizzle', () => ({
  getDb: () => Promise.resolve(mockDb),
}));

// Mock drizzle-orm operators (they just pass through in our mock)
mock.module('drizzle-orm', () => ({
  eq: (field: unknown, value: unknown) => ({ field, value }),
}));

// Import after mocks
const { generateApiKey, validateApiKey, revokeApiKey, hasApiKey } = await import('../api-keys');

describe('API key helpers', () => {
  beforeEach(() => {
    selectResult = [];
    updateSetValues = {};
    updateWhereUserId = '';
  });

  describe('generateApiKey', () => {
    it('generates a 64-char hex key', async () => {
      const key = await generateApiKey('user-1');
      expect(key).toHaveLength(64);
      expect(key).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('validateApiKey', () => {
    it('returns userId for valid key', async () => {
      selectResult = [{ id: 'user-1' }];
      const result = await validateApiKey('some-key');
      expect(result).toEqual({ userId: 'user-1' });
    });

    it('returns null for invalid key', async () => {
      selectResult = [];
      const result = await validateApiKey('bad-key');
      expect(result).toBeNull();
    });
  });

  describe('revokeApiKey', () => {
    it('sets hash to null', async () => {
      await revokeApiKey('user-1');
      expect(updateSetValues).toHaveProperty('mcpApiKeyHash', null);
    });
  });

  describe('hasApiKey', () => {
    it('returns true when user has a key', async () => {
      selectResult = [{ mcpApiKeyHash: 'abc123' }];
      expect(await hasApiKey('user-1')).toBe(true);
    });

    it('returns false when user has no key', async () => {
      selectResult = [{ mcpApiKeyHash: null }];
      expect(await hasApiKey('user-1')).toBe(false);
    });

    it('returns false when user not found', async () => {
      selectResult = [];
      expect(await hasApiKey('nonexistent')).toBe(false);
    });
  });
});
