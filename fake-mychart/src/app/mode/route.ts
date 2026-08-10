import { NextRequest, NextResponse } from 'next/server';
import { getMountMode, setMountMode, type MountMode } from '@/lib/mount';

/**
 * Test-control endpoint (not part of MyChart's API surface, same as /reset).
 *
 * Flips the server between the real MyChart deployment shapes so one instance
 * can stand in for all of them:
 *
 *   GET  /mode                          → { "mode": "prefixed" }
 *   POST /mode {"mode":"root"}          → { "ok": true, "mode": "root" }
 *   POST /mode {"mode":"meta-refresh"}  → { "ok": true, "mode": "meta-refresh" }
 *
 * The switch takes effect immediately for every subsequent request. Callers
 * must re-login afterwards: a session discovered its path prefix at login
 * time, and that prefix is exactly what changes here.
 *
 * The mode is global to the process, so suites that depend on it must set it
 * themselves rather than inheriting whatever the previous suite left behind.
 */
const VALID_MODES: MountMode[] = ['prefixed', 'root', 'meta-refresh'];

export async function GET() {
  return NextResponse.json({ mode: getMountMode() });
}

export async function POST(request: NextRequest) {
  let mode: unknown;
  try {
    ({ mode } = await request.json());
  } catch {
    return NextResponse.json({ error: 'Body must be JSON: {"mode":"prefixed"|"root"|"meta-refresh"}' }, { status: 400 });
  }

  if (typeof mode !== 'string' || !VALID_MODES.includes(mode as MountMode)) {
    return NextResponse.json(
      { error: `mode must be one of ${VALID_MODES.join(', ')}`, received: mode },
      { status: 400 },
    );
  }

  setMountMode(mode as MountMode);
  return NextResponse.json({ ok: true, mode: getMountMode() });
}
