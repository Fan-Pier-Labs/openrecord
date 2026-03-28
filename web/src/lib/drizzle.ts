import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { getPoolOptions } from './mcp/config';
import * as schema from './schema';

let db: NodePgDatabase<typeof schema> | null = null;
let pool: Pool | null = null;

export async function getPool(): Promise<Pool> {
  if (pool) return pool;
  const opts = await getPoolOptions();
  pool = new Pool(opts);
  return pool;
}

export async function getDb(): Promise<NodePgDatabase<typeof schema>> {
  if (db) return db;
  const p = await getPool();
  db = drizzle(p, { schema });
  return db;
}
