import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/sessions';
import { getOrDownloadStudy } from '@/lib/imaging-cache';
import { zipSync } from 'fflate';

/**
 * Download all images in a series as a ZIP file (lossless JPEG, quality 100).
 * Images are served from the shared cache populated by /api/mychart-series.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  const fdiParam = req.nextUrl.searchParams.get('fdi');
  const seriesUID = req.nextUrl.searchParams.get('series');

  if (!token || !fdiParam || !seriesUID) {
    return NextResponse.json({ error: 'Missing token, fdi, or series' }, { status: 400 });
  }

  if (!getSession(token)) {
    return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
  }

  try {
    const study = await getOrDownloadStudy(token, fdiParam);

    // Find all images for this series
    const seriesInfo = study.series.find(s => s.seriesUID === seriesUID);
    if (!seriesInfo || seriesInfo.imageCount === 0) {
      return NextResponse.json({ error: 'No images available for this series' }, { status: 404 });
    }

    const files: Record<string, [Uint8Array, { level: 0 }]> = {};
    const safeName = seriesInfo.description.replace(/[^a-zA-Z0-9_ -]/g, '').trim();
    for (let i = 0; i < seriesInfo.imageCount; i++) {
      const jpeg = study.images.get(`${seriesUID}:${i}`);
      if (jpeg) {
        files[`${safeName}_${i + 1}.jpg`] = [new Uint8Array(jpeg), { level: 0 }];
      }
    }

    if (Object.keys(files).length === 0) {
      return NextResponse.json({ error: 'No images available' }, { status: 404 });
    }

    const zipBuffer = zipSync(files);
    const zipName = safeName || 'xray_images';

    return new NextResponse(zipBuffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${zipName}.zip"`,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
