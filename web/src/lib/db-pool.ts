/**
 * Shared Postgres pool with RDS auto-rotation handling.
 *
 * Background: the prod DB password is an RDS-managed secret that rotates
 * automatically. A long-running Fargate task caches that password in
 * memory on startup; after rotation, every query fails with
 * `password authentication failed for user "postgres"` until the task
 * restarts. This module recovers in-process by invalidating the cached
 * password, recreating the pool, and retrying the failed query once.
 */

import { Pool, type QueryResult, type QueryResultRow } from 'pg';
import { getPoolOptions, invalidateDbPasswordCache } from './mcp/config';

let pool: Pool | null = null;
let poolPromise: Promise<Pool> | null = null;
const poolListeners = new Set<(pool: Pool) => void>();

async function buildPool(): Promise<Pool> {
  const opts = await getPoolOptions();
  const next = new Pool(opts);
  // pg emits 'error' on idle clients (e.g. an idle connection rejected
  // mid-life by Postgres). Log but don't crash — withAuthRetry handles
  // recovery on the next query.
  next.on('error', (err) => {
    console.error('[db-pool] idle client error:', err.message);
  });
  return next;
}

export async function getSharedPool(): Promise<Pool> {
  if (pool) return pool;
  if (!poolPromise) {
    poolPromise = buildPool().then((p) => {
      pool = p;
      for (const fn of poolListeners) fn(p);
      return p;
    });
  }
  return poolPromise;
}

/**
 * Subscribe to pool recreation events. Useful for consumers (like
 * BetterAuth) that hold a long-lived reference to the Pool object —
 * after a recreation the old reference is dead.
 */
export function onPoolRecreated(fn: (pool: Pool) => void): () => void {
  poolListeners.add(fn);
  return () => {
    poolListeners.delete(fn);
  };
}

/**
 * Tear down the cached pool + password and rebuild on next access.
 * Exported so the auth layer can force a refresh after BetterAuth
 * surfaces a session error caused by a rotation.
 */
export async function resetPool(): Promise<Pool> {
  invalidateDbPasswordCache();
  const prev = pool;
  pool = null;
  poolPromise = null;
  // End the old pool in the background; do not block the retry path.
  if (prev) {
    prev.end().catch((err) => {
      console.error('[db-pool] error ending stale pool:', err.message);
    });
  }
  return getSharedPool();
}

/**
 * Postgres error code 28P01 = invalid_password. Sometimes Postgres also
 * surfaces this as 28000 (invalid_authorization_specification). pg
 * exposes the SQLSTATE on err.code, and on the rare path where it's lost
 * the message reliably contains "password authentication failed".
 */
export function isAuthError(err: unknown): boolean {
  if (!err) return false;
  const e = err as { code?: string; message?: string };
  if (e.code === '28P01' || e.code === '28000') return true;
  return typeof e.message === 'string' && e.message.includes('password authentication failed');
}

/**
 * Run a DB operation. If it fails with a Postgres auth error (rotated
 * password), drop the cached password + pool, rebuild, and retry once.
 * A second failure propagates unchanged.
 */
export async function withAuthRetry<T>(fn: (pool: Pool) => Promise<T>): Promise<T> {
  let p = await getSharedPool();
  try {
    return await fn(p);
  } catch (err) {
    if (!isAuthError(err)) throw err;
    console.warn('[db-pool] auth error — refreshing password from Secrets Manager and retrying');
    p = await resetPool();
    return await fn(p);
  }
}

/**
 * Convenience wrapper for the common pool.query(text, params) pattern
 * with auth-retry baked in.
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  return withAuthRetry((p) => p.query<T>(text, params));
}
