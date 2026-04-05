import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/sessions';
import { getOrDownloadStudy } from '@/lib/imaging-cache';

/**
 * Fetch series metadata for an imaging study.
 *
 * Downloads all images (cached for 10 min), converts them, and returns
 * the series list with actual downloadable image counts per series.
 * Subsequent calls and image requests are served from cache.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  const fdiParam = req.nextUrl.searchParams.get('fdi');

  if (!token || !fdiParam) {
    return NextResponse.json({ error: 'Missing token or fdi' }, { status: 400 });
  }

  const mychartRequest = getSession(token);
  if (!mychartRequest) {
    return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
  }

  let fdiContext: { fdi: string; ord: string };
  try {
    fdiContext = JSON.parse(Buffer.from(fdiParam, 'base64').toString('utf-8'));
    if (!fdiContext.fdi || !fdiContext.ord) {
      throw new Error('Missing fdi or ord');
    }
  } catch {
    return NextResponse.json({ error: 'Invalid fdi parameter' }, { status: 400 });
  }

  try {
    const study = await getOrDownloadStudy(token, fdiParam);

    if (study.series.length === 0) {
      return NextResponse.json({ error: 'No series found' }, { status: 404 });
    }

    return NextResponse.json({ series: study.series });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
