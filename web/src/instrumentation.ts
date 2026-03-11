export async function register() {
  // Only run on the server (not edge runtime)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startKeepalive } = await import('@/lib/mcp/keepalive');

    try {
      startKeepalive();
      console.log('[instrumentation] Keepalive service started');
    } catch (err) {
      console.error('[instrumentation] Keepalive setup error:', err);
    }
  }
}
