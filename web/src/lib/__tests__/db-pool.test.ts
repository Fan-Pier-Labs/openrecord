import { describe, it, expect, mock, beforeEach } from 'bun:test';

// In-memory state shared with the pg mock so each test can swap in its
// own behavior for pool.query().
const state: {
  queryImpl: (...args: unknown[]) => Promise<unknown>;
  poolsCreated: number;
  endedPools: number;
} = {
  queryImpl: () => Promise.resolve({ rows: [], rowCount: 0 }),
  poolsCreated: 0,
  endedPools: 0,
};

class MockPool {
  constructor() {
    state.poolsCreated++;
  }
  // Forward to whichever impl the current test installed.
  query(...args: unknown[]) {
    return state.queryImpl(...args);
  }
  // db-pool calls .on('error', ...) on the pool; record-only.
  on() {}
  end() {
    state.endedPools++;
    return Promise.resolve();
  }
}

mock.module('pg', () => ({ Pool: MockPool }));

// invalidateDbPasswordCache must be present even if we don't assert on
// it directly — db-pool.resetPool() calls it on every retry.
let invalidationCount = 0;
mock.module('../mcp/config', () => ({
  getPoolOptions: () =>
    Promise.resolve({ connectionString: 'postgresql://localhost/test', ssl: false }),
  invalidateDbPasswordCache: () => {
    invalidationCount++;
  },
}));

const { isAuthError, withAuthRetry, query, resetPool, onPoolRecreated } = await import(
  '../db-pool'
);

function authError(code = '28P01', message = 'password authentication failed for user "postgres"') {
  return Object.assign(new Error(message), { code });
}

describe('isAuthError', () => {
  it('matches Postgres 28P01 invalid_password', () => {
    expect(isAuthError(authError('28P01'))).toBe(true);
  });

  it('matches Postgres 28000 invalid_authorization', () => {
    expect(isAuthError(authError('28000'))).toBe(true);
  });

  it('falls back to message match when code is missing', () => {
    expect(isAuthError(new Error('password authentication failed for user "postgres"'))).toBe(true);
  });

  it('does not match unrelated errors', () => {
    expect(isAuthError(new Error('connection refused'))).toBe(false);
    expect(isAuthError(Object.assign(new Error('x'), { code: '42P01' }))).toBe(false);
    expect(isAuthError(null)).toBe(false);
  });
});

describe('withAuthRetry', () => {
  beforeEach(async () => {
    state.poolsCreated = 0;
    state.endedPools = 0;
    invalidationCount = 0;
    state.queryImpl = () => Promise.resolve({ rows: [], rowCount: 0 });
    // Force a fresh pool by tripping the retry path once — easier than
    // poking module internals.
    await resetPool();
    state.poolsCreated = 0;
    state.endedPools = 0;
    invalidationCount = 0;
  });

  it('returns the result on success without recreating the pool', async () => {
    state.queryImpl = () => Promise.resolve({ rows: [{ ok: 1 }], rowCount: 1 });
    const r = await withAuthRetry((p) => p.query('select 1'));
    expect(r).toEqual({ rows: [{ ok: 1 }], rowCount: 1 });
    expect(state.poolsCreated).toBeLessThanOrEqual(1);
    expect(invalidationCount).toBe(0);
  });

  it('rethrows non-auth errors without retrying', async () => {
    let calls = 0;
    state.queryImpl = () => {
      calls++;
      return Promise.reject(new Error('connection refused'));
    };
    await expect(withAuthRetry((p) => p.query('select 1'))).rejects.toThrow('connection refused');
    expect(calls).toBe(1);
    expect(invalidationCount).toBe(0);
  });

  it('retries once on auth error and succeeds on second attempt', async () => {
    let calls = 0;
    state.queryImpl = () => {
      calls++;
      if (calls === 1) return Promise.reject(authError());
      return Promise.resolve({ rows: [{ ok: 1 }], rowCount: 1 });
    };
    const r = await withAuthRetry((p) => p.query('select 1'));
    expect(r).toEqual({ rows: [{ ok: 1 }], rowCount: 1 });
    expect(calls).toBe(2);
    expect(invalidationCount).toBe(1);
  });

  it('propagates the second failure unchanged', async () => {
    let calls = 0;
    state.queryImpl = () => {
      calls++;
      return Promise.reject(authError());
    };
    await expect(withAuthRetry((p) => p.query('select 1'))).rejects.toThrow(
      'password authentication failed',
    );
    expect(calls).toBe(2);
    expect(invalidationCount).toBe(1);
  });

  it('exposes the convenience query() helper that applies retry', async () => {
    let calls = 0;
    state.queryImpl = () => {
      calls++;
      if (calls === 1) return Promise.reject(authError());
      return Promise.resolve({ rows: [{ id: 'u1' }], rowCount: 1 });
    };
    const r = await query('select id from "user" where id = $1', ['u1']);
    expect(r.rows[0].id).toBe('u1');
    expect(calls).toBe(2);
  });
});

describe('onPoolRecreated', () => {
  beforeEach(async () => {
    await resetPool();
  });

  it('fires the listener when the pool is recreated after an auth error', async () => {
    let recreations = 0;
    const unsubscribe = onPoolRecreated(() => {
      recreations++;
    });
    let calls = 0;
    state.queryImpl = () => {
      calls++;
      if (calls === 1) return Promise.reject(authError());
      return Promise.resolve({ rows: [], rowCount: 0 });
    };
    await withAuthRetry((p) => p.query('select 1'));
    expect(recreations).toBeGreaterThanOrEqual(1);
    unsubscribe();
  });

  it('unsubscribe stops further notifications', async () => {
    let recreations = 0;
    const unsubscribe = onPoolRecreated(() => {
      recreations++;
    });
    unsubscribe();
    await resetPool();
    expect(recreations).toBe(0);
  });
});
