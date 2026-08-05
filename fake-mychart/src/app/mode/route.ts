import { NextRequest, NextResponse } from 'next/server';
import { getMountMode, setMountMode, type MountMode } from '@/lib/mount';
import {
  getProxyDiscoveryMode,
  setProxyDiscoveryMode,
  PROXY_DISCOVERY_MODES,
  type ProxyDiscoveryMode,
} from '@/lib/proxy';

/**
 * Test-control endpoint (not part of MyChart's API surface, same as /reset).
 *
 * Flips the server between real MyChart deployment shapes so one instance can
 * stand in for all of them:
 *
 *   GET  /mode                            → { "mode": "prefixed", "proxyDiscovery": "json" }
 *   POST /mode {"mode":"root"}            → { "ok": true, "mode": "root", ... }
 *   POST /mode {"proxyDiscovery":"html"}  → { "ok": true, ..., "proxyDiscovery": "html" }
 *
 * `mode` is the URL shape (path-prefixed vs root-mounted). `proxyDiscovery` is
 * how the server advertises the patient records an account can access — see
 * `src/lib/proxy.ts`. Either or both may be set in one call; omitted fields are
 * left alone.
 *
 * The switch takes effect immediately for every subsequent request. Callers
 * changing `mode` must re-login afterwards: a session discovered its path
 * prefix at login time, and that prefix is exactly what changes here.
 * `proxyDiscovery` needs no re-login.
 *
 * Both are global to the process, so suites that depend on them must set them
 * themselves rather than inheriting whatever the previous suite left behind.
 */
const VALID_MODES: MountMode[] = ['prefixed', 'root'];

function currentState() {
  return { mode: getMountMode(), proxyDiscovery: getProxyDiscoveryMode() };
}

export async function GET() {
  return NextResponse.json(currentState());
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Body must be JSON: {"mode":"prefixed"|"root","proxyDiscovery":"json"|"html"|"script"}' },
      { status: 400 },
    );
  }

  const { mode, proxyDiscovery } = body ?? {};

  if (mode === undefined && proxyDiscovery === undefined) {
    return NextResponse.json({ error: 'Provide at least one of mode, proxyDiscovery' }, { status: 400 });
  }

  if (mode !== undefined && (typeof mode !== 'string' || !VALID_MODES.includes(mode as MountMode))) {
    return NextResponse.json(
      { error: `mode must be one of ${VALID_MODES.join(', ')}`, received: mode },
      { status: 400 },
    );
  }

  if (
    proxyDiscovery !== undefined
    && (typeof proxyDiscovery !== 'string' || !PROXY_DISCOVERY_MODES.includes(proxyDiscovery as ProxyDiscoveryMode))
  ) {
    return NextResponse.json(
      { error: `proxyDiscovery must be one of ${PROXY_DISCOVERY_MODES.join(', ')}`, received: proxyDiscovery },
      { status: 400 },
    );
  }

  if (mode !== undefined) setMountMode(mode as MountMode);
  if (proxyDiscovery !== undefined) setProxyDiscoveryMode(proxyDiscovery as ProxyDiscoveryMode);

  return NextResponse.json({ ok: true, ...currentState() });
}
