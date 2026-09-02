import { NextRequest, NextResponse } from 'next/server';
import {
  getMountMode, setMountMode, getDiscoveryMode, setDiscoveryMode,
  getMovedHost, setMovedHost, DISCOVERY_MODES,
  type MountMode, type DiscoveryMode,
} from '@/lib/mount';
import {
  getProxyDiscoveryMode,
  setProxyDiscoveryMode,
  PROXY_DISCOVERY_MODES,
  type ProxyDiscoveryMode,
} from '@/lib/proxy';
import { getRequireTerms, setRequireTerms } from '@/lib/terms';
import { getEpicVersion, setEpicVersion, EPIC_VERSIONS, type EpicVersion } from '@/lib/epicVersion';
import {
  getThreadEndpointMode,
  setThreadEndpointMode,
  THREAD_ENDPOINT_MODES,
  type ThreadEndpointMode,
} from '@/lib/threadEndpoint';

/**
 * Test-control endpoint (not part of MyChart's API surface, same as /reset).
 *
 * Sets the things about a real deployment that the scraper has to discover, so
 * one instance can stand in for all of them. Every knob is independent:
 *
 *   - `mode` — where MyChart is mounted: under `/MyChart`, or at the domain
 *     root like Cleveland Clinic.
 *   - `discovery` — how `/` announces that. Six shapes, all taken from real
 *     instances: `redirect` (a 302 with a `Location` header), `meta-refresh`
 *     (Renown's absolute `<meta http-equiv="refresh">`), `default-asp` (the
 *     multi-hop bounce through a bare relative `DefaultAsp`, which only names
 *     the route on its last hop), `script` (mydovetale.ca's `window.location`
 *     assignment), `landing-page` (an affiliate chooser that redirects nowhere
 *     and only links at the mount), and `moved-host` (the deployment now lives
 *     on a different hostname — pair it with `movedHost`). See `src/lib/mount.ts`.
 *   - `movedHost` — where `discovery: "moved-host"` sends the client. Point it
 *     at another name for this same server (`127.0.0.1:4000` when the client
 *     came in on `localhost:4000`) to exercise the move without a second server.
 *   - `proxyDiscovery` — which surface lists the patient records an account can
 *     access: the `/ProxySwitch` JSON endpoint, `.proxySubjectLink` anchors on
 *     `/Home`, or bare `proxySubjects.push(...)` script blocks. See
 *     `src/lib/proxy.ts`.
 *   - `requireTerms` — whether logging in lands on `/Home` or bounces to
 *     `/Authentication/TermsConditions` until the patient accepts once. See
 *     `src/lib/terms.ts`.
 *
 *   GET  /mode                              → every knob's current value
 *   POST /mode {"mode":"root"}              → root-mounted, still announced by redirect
 *   POST /mode {"discovery":"meta-refresh"} → still under /MyChart, announced by meta refresh (Renown)
 *   POST /mode {"proxyDiscovery":"script"}  → proxy records only in the script payload
 *   POST /mode {"requireTerms":true}        → login lands on the T&C page first
 *   POST /mode {"mode":"root","discovery":"meta-refresh"}  → several at once
 *
 * Whatever a request omits is left alone, so a caller that only cares about one
 * knob doesn't silently reset the others. The response always reports every knob.
 *
 * The switch takes effect immediately for every subsequent request. Callers
 * changing `mode` or `discovery` must re-login afterwards: a session discovered
 * its path prefix at login time, and that prefix is exactly what changes.
 * `proxyDiscovery` needs no re-login. `requireTerms` gates a session that has
 * not accepted yet, so a caller turning it on wants a fresh login too.
 *
 * All settings are global to the process, so suites that depend on them must
 * set them themselves rather than inheriting whatever the previous suite left
 * behind. `/reset` restores the defaults.
 */
const VALID_MODES: MountMode[] = ['prefixed', 'root'];
const VALID_DISCOVERY: DiscoveryMode[] = DISCOVERY_MODES;

function currentSettings() {
  return {
    mode: getMountMode(),
    discovery: getDiscoveryMode(),
    movedHost: getMovedHost(),
    proxyDiscovery: getProxyDiscoveryMode(),
    requireTerms: getRequireTerms(),
    epicVersion: getEpicVersion(),
    conversationMessages: getThreadEndpointMode(),
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
      { error: 'Body must be JSON: {"mode":"prefixed"|"root","discovery":"redirect"|"meta-refresh","proxyDiscovery":"json"|"html"|"script","requireTerms":true|false}' },
      { status: 400 },
    );
  }

  const { mode, discovery, movedHost, proxyDiscovery, requireTerms, epicVersion, conversationMessages } = body ?? {};

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

  if (movedHost !== undefined && movedHost !== null && typeof movedHost !== 'string') {
    return NextResponse.json(
      { error: 'movedHost must be a hostname string (or null to clear it)', received: movedHost },
      { status: 400 },
    );
  }

  if (requireTerms !== undefined && typeof requireTerms !== 'boolean') {
    return NextResponse.json(
      { error: 'requireTerms must be a boolean', received: requireTerms },
      { status: 400 },
    );
  }

  if (
    conversationMessages !== undefined
    && (typeof conversationMessages !== 'string' || !THREAD_ENDPOINT_MODES.includes(conversationMessages as ThreadEndpointMode))
  ) {
    return NextResponse.json(
      { error: `conversationMessages must be one of ${THREAD_ENDPOINT_MODES.join(', ')}`, received: conversationMessages },
      { status: 400 },
    );
  }

  if (
    epicVersion !== undefined
    && (typeof epicVersion !== 'string' || !EPIC_VERSIONS.includes(epicVersion as EpicVersion))
  ) {
    return NextResponse.json(
      { error: `epicVersion must be one of ${EPIC_VERSIONS.join(', ')}`, received: epicVersion },
      { status: 400 },
    );
  }

  // `moved-host` with nowhere to move to would answer every request with a 500,
  // which is a confusing way to find out the call was incomplete.
  const effectiveMovedHost = movedHost !== undefined ? movedHost : getMovedHost();
  if (discovery === 'moved-host' && !effectiveMovedHost) {
    return NextResponse.json(
      { error: 'discovery "moved-host" needs movedHost set in the same request, e.g. {"discovery":"moved-host","movedHost":"127.0.0.1:4000"}' },
      { status: 400 },
    );
  }

  if (
    mode === undefined && discovery === undefined && movedHost === undefined
    && proxyDiscovery === undefined && requireTerms === undefined && epicVersion === undefined
    && conversationMessages === undefined
  ) {
    return NextResponse.json(
      { error: 'Provide at least one of mode, discovery, movedHost, proxyDiscovery, requireTerms, epicVersion, conversationMessages' },
      { status: 400 },
    );
  }

  if (mode !== undefined) setMountMode(mode as MountMode);
  if (discovery !== undefined) setDiscoveryMode(discovery as DiscoveryMode);
  if (movedHost !== undefined) setMovedHost(movedHost as string | null);
  if (proxyDiscovery !== undefined) setProxyDiscoveryMode(proxyDiscovery as ProxyDiscoveryMode);
  if (requireTerms !== undefined) setRequireTerms(requireTerms);
  if (epicVersion !== undefined) setEpicVersion(epicVersion as EpicVersion);
  if (conversationMessages !== undefined) setThreadEndpointMode(conversationMessages as ThreadEndpointMode);

  return NextResponse.json({ ok: true, ...currentSettings() });
}
