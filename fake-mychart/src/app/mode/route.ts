import { NextRequest, NextResponse } from 'next/server';
import {
  getMountMode, setMountMode, getDiscoveryMode, setDiscoveryMode,
  type MountMode, type DiscoveryMode,
} from '@/lib/mount';

/**
 * Test-control endpoint (not part of MyChart's API surface, same as /reset).
 *
 * Sets the two things about a real deployment that the scraper has to discover,
 * so one instance can stand in for all of them. They're independent: `mode` is
 * where MyChart is mounted, `discovery` is how `/` announces that.
 *
 *   GET  /mode                              → { "mode": "prefixed", "discovery": "redirect" }
 *   POST /mode {"mode":"root"}              → root-mounted, still announced by redirect
 *   POST /mode {"discovery":"meta-refresh"} → still under /MyChart, announced by meta refresh (Renown)
 *   POST /mode {"mode":"root","discovery":"meta-refresh"}  → both at once
 *
 * Whatever a request omits is left alone, so a caller that only cares about one
 * knob doesn't silently reset the other. The response always reports both.
 *
 * The switch takes effect immediately for every subsequent request. Callers
 * must re-login afterwards: a session discovered its path prefix at login
 * time, and that prefix is exactly what changes here.
 *
 * Both settings are global to the process, so suites that depend on them must
 * set them themselves rather than inheriting whatever the previous suite left
 * behind. `/reset` restores the defaults.
 */
const VALID_MODES: MountMode[] = ['prefixed', 'root'];
const VALID_DISCOVERY: DiscoveryMode[] = ['redirect', 'meta-refresh'];

function currentSettings() {
  return { mode: getMountMode(), discovery: getDiscoveryMode() };
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
      { error: 'Body must be JSON: {"mode":"prefixed"|"root","discovery":"redirect"|"meta-refresh"}' },
      { status: 400 },
    );
  }

  const { mode, discovery } = body ?? {};

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

  if (mode === undefined && discovery === undefined) {
    return NextResponse.json(
      { error: 'Provide at least one of mode, discovery' },
      { status: 400 },
    );
  }

  if (mode !== undefined) setMountMode(mode as MountMode);
  if (discovery !== undefined) setDiscoveryMode(discovery as DiscoveryMode);

  return NextResponse.json({ ok: true, ...currentSettings() });
}
