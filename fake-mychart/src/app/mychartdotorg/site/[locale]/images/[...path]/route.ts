import { NextRequest, NextResponse } from 'next/server';
import { directoryLogoBytes } from '@/lib/directoryLogos';

/**
 * `GET /mychartdotorg/site/<locale>/images/<path>`
 *
 * The other half of Epic's media host: logos shipped as site assets rather
 * than directory records. Two paths reach here, and a client hits both —
 * `login/default.png` for an organization with no logo at all, and
 * `login/custom/<name>.png` for the handful (Mayo, Kaiser, …) whose logo Epic
 * hand-places instead. Both get the same checked-in placeholder; what matters
 * is that the fallbacks resolve to real bytes on this origin.
 *
 * Anything outside `login/` 404s — this mirrors one directory of Epic's media
 * host, not the whole thing.
 */
export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ locale: string; path: string[] }> },
) {
  const { path } = await ctx.params;
  const requested = (path ?? []).join('/');

  if (!requested.startsWith('login/') || !requested.endsWith('.png')) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const bytes = directoryLogoBytes('generic.png');
  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      'Content-Type': 'image/png',
      'Content-Length': String(bytes.length),
      'Cache-Control': 'max-age=14400, stale-while-revalidate=28800',
    },
  });
}
