import { NextRequest, NextResponse } from 'next/server';
import {
  getMountMode, setMountMode, getDiscoveryMode, setDiscoveryMode,
  type MountMode, type DiscoveryMode,
} from '@/lib/mount';
import {
  getProxyDiscoveryMode,
  setProxyDiscoveryMode,
  PROXY_DISCOVERY_MODES,
  type ProxyDiscoveryMode,
} from '@/lib/proxy';

/**
 * Test-control endpoint (not part of MyChart's API surface, same as /reset).
 *
 * Sets the things about a real deployment that the scraper has to discover, so
 * one instance can stand in for all of them. All three knobs are independent:
 *
 *   - `mode` — where MyChart is mounted: under `/MyChart`, or at the domain
 *     root like Cleveland Clinic.
 *   - `discovery` — how `/` announces that: a 302 with a `Location` header, or
 *     a 200 carrying an absolute `<meta http-equiv="refresh">` like Renown.
 *   - `proxyDiscovery` — which surface lists the patient records an account can
 *     access: the `/ProxySwitch` JSON endpoint, `.proxySubjectLink` anchors on
 *     `/Home`, or bare `proxySubjects.push(...)` script blocks. See
 *     `src/lib/proxy.ts`.
 *
 *   GET  /mode                              → { "mode": …, "discovery": …, "proxyDiscovery": … }
 *   POST /mode {"mode":"root"}              → root-mounted, still announced by redirect
 *   POST /mode {"discovery":"meta-refresh"} → still under /MyChart, announced by meta refresh (Renown)
 *   POST /mode {"proxyDiscovery":"script"}  → proxy records only in the script payload
 *   POST /mode {"mode":"root","discovery":"meta-refresh"}  → several at once
 *
 * Whatever a request omits is left alone, so a caller that only cares about one
 * knob doesn't silently reset the others. The response always reports all three.
 *
 * The switch takes effect immediately for every subsequent request. Callers
 * changing `mode` or `discovery` must re-login afterwards: a session discovered
 * its path prefix at login time, and that prefix is exactly what changes.
 * `proxyDiscovery` needs no re-login.
 *
 * All settings are global to the process, so suites that depend on them must
 * set them themselves rather than inheriting whatever the previous suite left
 * behind. `/reset` restores the defaults.
 */
const VALID_MODES: MountMode[] = ['prefixed', 'root'];
const VALID_DISCOVERY: DiscoveryMode[] = ['redirect', 'meta-refresh'];

function currentSettings() {
  return {
    mode: getMountMode(),
    discovery: getDiscoveryMode(),
    proxyDiscovery: getProxyDiscoveryMode(),
  };
}

export async function GET() {
  return NextResponse.json(currentSettings());
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Body must be JSON: {"mode":"prefixed"|"root","discovery":"redirect"|"meta-refresh","proxyDiscovery":"json"|"html"|"script"}' },
      { status: 400 },
    );
  }

  const { mode, discovery, proxyDiscovery } = body ?? {};

  if (mode !== undefined && (typeof mode !== 'string' || !VALID_MODES.includes(mode as MountMode))) {
    return NextResponse.json(
      { error: `mode must be one of ${VALID_MODES.join(', ')}`, received: mode },
      { status: 400 },
    );
  }

  if (discovery !== undefined && (typeof discovery !== 'string' || !VALID_DISCOVERY.includes(discovery as DiscoveryMode))) {
    return NextResponse.json(
      { error: `discovery must be one of ${VALID_DISCOVERY.join(', ')}`, received: discovery },
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

  if (mode === undefined && discovery === undefined && proxyDiscovery === undefined) {
    return NextResponse.json(
      { error: 'Provide at least one of mode, discovery, proxyDiscovery' },
      { status: 400 },
    );
  }

  if (mode !== undefined) setMountMode(mode as MountMode);
  if (discovery !== undefined) setDiscoveryMode(discovery as DiscoveryMode);
  if (proxyDiscovery !== undefined) setProxyDiscoveryMode(proxyDiscovery as ProxyDiscoveryMode);

  return NextResponse.json({ ok: true, ...currentSettings() });
}
