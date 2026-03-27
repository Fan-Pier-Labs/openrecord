/**
 * Shared migration logic. Called by both the CLI migrate script and
 * the instrumentation hook (auto-migrate on startup).
 */

import { getAuth } from './auth';
import { getPool } from './drizzle';

export async function runMigrations(): Promise<void> {
  // 1. Run BetterAuth migrations (creates user, session, account, verification, twoFactor, passkey tables)
  const auth = await getAuth();
  const ctx = await auth.$context;
  if (ctx.runMigrations) {
    await ctx.runMigrations();
    console.log('[migrate] BetterAuth migrations complete.');
  }

  // 2. Create custom mychart_instances table and add custom columns.
  //    We use raw SQL with IF NOT EXISTS for idempotent migrations,
  //    since these extend BetterAuth's managed schema.
  const pool = await getPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS mychart_instances (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      hostname TEXT NOT NULL,
      username TEXT NOT NULL,
      encrypted_password TEXT NOT NULL,
      encrypted_totp_secret TEXT,
      mychart_email TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, hostname, username)
    );
  `);

  // 3. Add mcp_api_key_hash column to user table
  await pool.query(`
    ALTER TABLE "user" ADD COLUMN IF NOT EXISTS mcp_api_key_hash TEXT UNIQUE;
  `);

  // 4. Add notification preference columns to user table
  await pool.query(`
    ALTER TABLE "user" ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN DEFAULT FALSE;
  `);
  await pool.query(`
    ALTER TABLE "user" ADD COLUMN IF NOT EXISTS notifications_include_content BOOLEAN DEFAULT FALSE;
  `);

  // 5. Add notification tracking column to mychart_instances
  await pool.query(`
    ALTER TABLE mychart_instances ADD COLUMN IF NOT EXISTS notifications_last_checked_at TIMESTAMPTZ;
  `);

  console.log('[migrate] Database migrations complete.');
}
