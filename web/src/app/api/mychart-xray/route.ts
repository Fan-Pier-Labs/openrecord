import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/sessions';
import { getOrDownloadStudy } from '@/lib/imaging-cache';

/**
 * Serve a single X-ray image as lossless JPEG (quality 100).
 *
 * Query params:
 *   - token: session token
 *   - fdi: base64-encoded FdiContext
 *   - series: seriesUID
 *   - index: 0-based index within the series (default: 0)
 *
 * Images are pre-downloaded and cached by the /api/mychart-series endpoint.
 * This endpoint just serves from that cache, so it's fast.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  const fdiParam = req.nextUrl.searchParams.get('fdi');
  const seriesUID = req.nextUrl.searchParams.get('series');
  const imageIndex = parseInt(req.nextUrl.searchParams.get('index') ?? '0', 10);

  if (!token || !fdiParam || !seriesUID) {
    return NextResponse.json({ error: 'Missing token, fdi, or series' }, { status: 400 });
  }

  if (!getSession(token)) {
    return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
  }

  try {
    const study = await getOrDownloadStudy(token, fdiParam);
    const jpeg = study.images.get(`${seriesUID}:${imageIndex}`);

    if (!jpeg) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    return new NextResponse(jpeg, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'private, max-age=600',
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
