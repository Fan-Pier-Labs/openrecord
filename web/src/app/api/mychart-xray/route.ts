import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/sessions';
import { downloadImagingStudyDirect } from '../../../../../scrapers/myChart/eunity/imagingDirectDownload';
import { convertCloToJpg } from '../../../../../scrapers/myChart/clo-to-jpg-converter/clo_to_jpg';

/**
 * Serve a single X-ray image as lossless JPEG (quality 100).
 *
 * Query params:
 *   - token: session token
 *   - fdi: base64-encoded FdiContext
 *   - series: (optional) seriesUID to filter by
 *   - index: (optional) 0-based index within the series (default: 0)
 *
 * Images are cached server-side after first download. Responses use
 * Cache-Control: private, max-age=600 so the browser caches them too —
 * prev/next navigation is instant after first load.
 */

// Server-side cache: key → JPEG buffers. Entries expire after 10 min.
const imageCache = new Map<string, { jpegs: Buffer[]; ts: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000;
const pendingDownloads = new Map<string, Promise<Buffer[]>>();

function evictStale() {
  const now = Date.now();
  for (const [key, entry] of imageCache) {
    if (now - entry.ts > CACHE_TTL_MS) imageCache.delete(key);
  }
}

async function getOrDownloadImages(
  token: string,
  fdiParam: string,
  seriesFilter: string | null,
): Promise<Buffer[]> {
  const cacheKey = `${token}:${fdiParam}:${seriesFilter ?? ''}`;

  const cached = imageCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.jpegs;
  }

  const pending = pendingDownloads.get(cacheKey);
  if (pending) return pending;

  const downloadPromise = (async () => {
    try {
      const mychartRequest = getSession(token);
      if (!mychartRequest) throw new Error('Invalid or expired session');

      const fdiContext = JSON.parse(Buffer.from(fdiParam, 'base64').toString('utf-8'));

      const downloadResult = await downloadImagingStudyDirect(
        mychartRequest,
        fdiContext,
        '',
        '',
        { skipFileWrite: true, maxImages: 50 },
      );

      if (downloadResult.errors.length > 0 && downloadResult.images.length === 0) {
        throw new Error(downloadResult.errors.join('; '));
      }

      let candidates = downloadResult.images.filter(img => img.pixelData);
      if (seriesFilter) {
        const filtered = candidates.filter(img => img.seriesUID === seriesFilter);
        if (filtered.length > 0) candidates = filtered;
      }

      const realImages = candidates.filter(img => img.pixelData!.length > 10000);
      if (realImages.length > 0) candidates = realImages;

      // Convert all to lossless JPEG (quality 100)
      const jpegs: Buffer[] = [];
      for (const image of candidates) {
        try {
          const jpegBuffer = await convertCloToJpg(
            image.pixelData,
            null,
            image.wrapperData,
            100,
          );
          if (Buffer.isBuffer(jpegBuffer)) {
            jpegs.push(jpegBuffer);
          }
        } catch {
          // Skip images that fail to convert
        }
      }

      imageCache.set(cacheKey, { jpegs, ts: Date.now() });
      evictStale();
      return jpegs;
    } finally {
      pendingDownloads.delete(cacheKey);
    }
  })();

  pendingDownloads.set(cacheKey, downloadPromise);
  return downloadPromise;
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  const fdiParam = req.nextUrl.searchParams.get('fdi');
  const seriesFilter = req.nextUrl.searchParams.get('series');
  const imageIndex = parseInt(req.nextUrl.searchParams.get('index') ?? '0', 10);

  if (!token || !fdiParam) {
    return NextResponse.json({ error: 'Missing token or fdi' }, { status: 400 });
  }

  const mychartRequest = getSession(token);
  if (!mychartRequest) {
    return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
  }

  try {
    const fdiContext = JSON.parse(Buffer.from(fdiParam, 'base64').toString('utf-8'));
    if (!fdiContext.fdi || !fdiContext.ord) {
      return NextResponse.json({ error: 'Invalid fdi parameter' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid fdi parameter' }, { status: 400 });
  }

  try {
    const jpegs = await getOrDownloadImages(token, fdiParam, seriesFilter);

    if (jpegs.length === 0) {
      return NextResponse.json({ error: 'No image data available' }, { status: 404 });
    }

    if (imageIndex < 0 || imageIndex >= jpegs.length) {
      return NextResponse.json({ error: 'Image index out of range' }, { status: 404 });
    }

    return new NextResponse(jpegs[imageIndex], {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'private, max-age=600',
        'X-Image-Count': String(jpegs.length),
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
