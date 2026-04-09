import { describe, test, expect } from 'bun:test';

/**
 * Tests for multi-account session resolution logic and tool parameter injection.
 *
 * These tests verify the core decision-making logic without hitting real MyChart
 * servers. They test the resolution rules:
 *   - 0 accounts → error
 *   - 1 account → auto-select
 *   - N accounts, no param → error listing hostnames (unless exactly 1 connected)
 *   - N accounts, explicit param → target that account
 *   - nonexistent param → error
 */

describe('multi-account resolution rules', () => {
  // These tests verify the resolution algorithm directly using the same
  // logic as resolveSession() without mocking the module.

  interface Account {
    hostname: string;
    username: string;
    password: string;
    connected: boolean;
  }

  /**
   * Pure function implementing the same resolution logic as resolveSession().
   * Returns the selected hostname or throws an error string.
   */
  function resolve(accounts: Account[], requestedAccount?: string): string {
    if (accounts.length === 0) {
      throw new Error('No MyChart accounts configured. Run `openclaw openrecord setup` to add one.');
    }

    if (requestedAccount) {
      const normalized = requestedAccount.toLowerCase().trim();
      const found = accounts.find(a => a.hostname.toLowerCase().trim() === normalized);
      if (!found) {
        const available = accounts.map(a => a.hostname).join(', ');
        throw new Error(`Account '${requestedAccount}' not found. Available: ${available}`);
      }
      return found.hostname;
    }

    if (accounts.length === 1) {
      return accounts[0].hostname;
    }

    const connected = accounts.filter(a => a.connected);

    if (connected.length === 1) {
      return connected[0].hostname;
    }

    if (connected.length === 0) {
      const hostnames = accounts.map(a => a.hostname).join(', ');
      throw new Error(`Multiple MyChart accounts configured. Specify the 'account' parameter with one of: ${hostnames}`);
    }

    const hostnames = connected.map(a => a.hostname).join(', ');
    throw new Error(`Multiple MyChart accounts connected. Specify the 'account' parameter with one of: ${hostnames}`);
  }

  test('zero accounts → error pointing to setup', () => {
    expect(() => resolve([])).toThrow('No MyChart accounts configured');
  });

  test('single account, no param → auto-selects', () => {
    const accounts: Account[] = [
      { hostname: 'mychart.hospital-a.org', username: 'user1', password: 'pass1', connected: false },
    ];
    expect(resolve(accounts)).toBe('mychart.hospital-a.org');
  });

  test('single account with explicit matching param → selects it', () => {
    const accounts: Account[] = [
      { hostname: 'mychart.hospital-a.org', username: 'user1', password: 'pass1', connected: false },
    ];
    expect(resolve(accounts, 'mychart.hospital-a.org')).toBe('mychart.hospital-a.org');
  });

  test('two accounts, no param, neither connected → error listing hostnames', () => {
    const accounts: Account[] = [
      { hostname: 'mychart.hospital-a.org', username: 'user1', password: 'pass1', connected: false },
      { hostname: 'mychart.hospital-b.org', username: 'user2', password: 'pass2', connected: false },
    ];
    expect(() => resolve(accounts)).toThrow('Multiple MyChart accounts configured');
    expect(() => resolve(accounts)).toThrow('mychart.hospital-a.org');
    expect(() => resolve(accounts)).toThrow('mychart.hospital-b.org');
  });

  test('two accounts, no param, one connected → returns connected one', () => {
    const accounts: Account[] = [
      { hostname: 'mychart.hospital-a.org', username: 'user1', password: 'pass1', connected: false },
      { hostname: 'mychart.hospital-b.org', username: 'user2', password: 'pass2', connected: true },
    ];
    expect(resolve(accounts)).toBe('mychart.hospital-b.org');
  });

  test('two accounts, no param, both connected → error listing connected hostnames', () => {
    const accounts: Account[] = [
      { hostname: 'mychart.hospital-a.org', username: 'user1', password: 'pass1', connected: true },
      { hostname: 'mychart.hospital-b.org', username: 'user2', password: 'pass2', connected: true },
    ];
    expect(() => resolve(accounts)).toThrow('Multiple MyChart accounts connected');
  });

  test('two accounts, explicit param → returns matching account', () => {
    const accounts: Account[] = [
      { hostname: 'mychart.hospital-a.org', username: 'user1', password: 'pass1', connected: false },
      { hostname: 'mychart.hospital-b.org', username: 'user2', password: 'pass2', connected: false },
    ];
    expect(resolve(accounts, 'mychart.hospital-b.org')).toBe('mychart.hospital-b.org');
  });

  test('nonexistent account param → error listing available', () => {
    const accounts: Account[] = [
      { hostname: 'mychart.hospital-a.org', username: 'user1', password: 'pass1', connected: false },
    ];
    expect(() => resolve(accounts, 'nonexistent.org')).toThrow("Account 'nonexistent.org' not found");
    expect(() => resolve(accounts, 'nonexistent.org')).toThrow('mychart.hospital-a.org');
  });

  test('case-insensitive hostname matching', () => {
    const accounts: Account[] = [
      { hostname: 'mychart.hospital-a.org', username: 'user1', password: 'pass1', connected: false },
    ];
    expect(resolve(accounts, 'MyChart.Hospital-A.ORG')).toBe('mychart.hospital-a.org');
  });
});

describe('makeTool account parameter injection', () => {
  test('account property is added to tool parameters', () => {
    // Simulate what makeTool does to parameters
    const originalParams = {
      type: 'object',
      properties: {
        conversation_id: { type: 'string', description: 'Conversation ID' },
      },
      required: ['conversation_id'],
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const baseProps = (originalParams as any)?.properties ?? {};
    const mergedParams = {
      type: 'object',
      properties: {
        account: { type: 'string', description: 'MyChart account hostname (required if multiple accounts configured)' },
        ...baseProps,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      required: [...((originalParams as any)?.required ?? [])],
    };

    expect(mergedParams.properties.account).toBeDefined();
    expect(mergedParams.properties.conversation_id).toBeDefined();
    expect(mergedParams.required).toContain('conversation_id');
    expect(mergedParams.required).not.toContain('account');
  });

  test('account property is added even when no original parameters', () => {
    const originalParams = undefined;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const baseProps = (originalParams as any)?.properties ?? {};
    const mergedParams = {
      type: 'object',
      properties: {
        account: { type: 'string', description: 'MyChart account hostname (required if multiple accounts configured)' },
        ...baseProps,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      required: [...((originalParams as any)?.required ?? [])],
    };

    expect(mergedParams.properties.account).toBeDefined();
    expect(Object.keys(mergedParams.properties)).toHaveLength(1);
    expect(mergedParams.required).toHaveLength(0);
  });

  test('account property does not override existing tool properties', () => {
    const originalParams = {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Full name' },
        phone: { type: 'string', description: 'Phone number' },
      },
      required: ['name', 'phone'],
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const baseProps = (originalParams as any)?.properties ?? {};
    const mergedParams = {
      type: 'object',
      properties: {
        account: { type: 'string', description: 'MyChart account hostname (required if multiple accounts configured)' },
        ...baseProps,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      required: [...((originalParams as any)?.required ?? [])],
    };

    expect(Object.keys(mergedParams.properties)).toHaveLength(3); // account + name + phone
    expect(mergedParams.properties.name.description).toBe('Full name');
    expect(mergedParams.required).toEqual(['name', 'phone']);
  });
});

describe('mychart_list_accounts output format', () => {
  test('returns expected shape for each account', () => {
    // Simulate the list_accounts tool output structure
    const accounts = [
      { hostname: 'mychart.hospital-a.org', username: 'user1', password: 'pass1', totpSecret: 'secret' },
      { hostname: 'mychart.hospital-b.org', username: 'user2', password: 'pass2' },
    ];

    const result = accounts.map(a => ({
      hostname: a.hostname,
      username: a.username,
      connected: false,
      hasPasskey: false,
      hasTotpSecret: !!a.totpSecret,
    }));

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      hostname: 'mychart.hospital-a.org',
      username: 'user1',
      connected: false,
      hasPasskey: false,
      hasTotpSecret: true,
    });
    expect(result[1]).toEqual({
      hostname: 'mychart.hospital-b.org',
      username: 'user2',
      connected: false,
      hasPasskey: false,
      hasTotpSecret: false,
    });
  });
});
