export async function register() {
  // Only run on the server (not edge runtime)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startKeepalive } = await import('@/lib/mcp/keepalive');

    // Auto-run database migrations on startup
    try {
      const { getAuth } = await import('@/lib/auth');
      const { Pool } = await import('pg');
      const { getPoolOptions } = await import('@/lib/mcp/config');

      const auth = await getAuth();
      const ctx = await auth.$context;
      if (ctx.runMigrations) {
        await ctx.runMigrations();
        console.log('[instrumentation] BetterAuth migrations complete');
      }

      const opts = await getPoolOptions();
      const pool = new Pool(opts);
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
      await pool.query(`
        ALTER TABLE "user" ADD COLUMN IF NOT EXISTS mcp_api_key_hash TEXT UNIQUE;
      `);
      await pool.end();
      console.log('[instrumentation] Database migrations complete');
    } catch (err) {
      console.error('[instrumentation] Migration error:', err);
    }

    try {
      startKeepalive();
      console.log('[instrumentation] Keepalive service started');
    } catch (err) {
      console.error('[instrumentation] Keepalive setup error:', err);
    }
  }
}
