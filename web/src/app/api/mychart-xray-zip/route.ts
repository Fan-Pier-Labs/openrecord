import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/sessions';
import { downloadImagingStudyDirect } from '../../../../../scrapers/myChart/eunity/imagingDirectDownload';
import { convertCloToJpg } from '../../../../../scrapers/myChart/clo-to-jpg-converter/clo_to_jpg';
import { zipSync, strToU8 } from 'fflate';

/**
 * Download all images in a study/series as a ZIP file.
 * Each image is saved as lossless JPEG (quality 100).
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  const fdiParam = req.nextUrl.searchParams.get('fdi');
  const seriesFilter = req.nextUrl.searchParams.get('series');

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
      return NextResponse.json({ error: 'Invalid fdi parameter' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid fdi parameter' }, { status: 400 });
  }

  try {
    const downloadResult = await downloadImagingStudyDirect(
      mychartRequest,
      fdiContext,
      '',
      '',
      { skipFileWrite: true, maxImages: 50 },
    );

    if (downloadResult.errors.length > 0 && downloadResult.images.length === 0) {
      return NextResponse.json({ error: downloadResult.errors.join('; ') }, { status: 502 });
    }

    let candidates = downloadResult.images.filter(img => img.pixelData);
    if (seriesFilter) {
      const filtered = candidates.filter(img => img.seriesUID === seriesFilter);
      if (filtered.length > 0) candidates = filtered;
    }

    const realImages = candidates.filter(img => img.pixelData!.length > 10000);
    if (realImages.length > 0) candidates = realImages;

    if (candidates.length === 0) {
      return NextResponse.json({ error: 'No image data available' }, { status: 404 });
    }

    // Convert all to lossless JPEG and build zip
    const files: Record<string, Uint8Array> = {};
    let seriesDesc = '';
    for (let i = 0; i < candidates.length; i++) {
      const image = candidates[i];
      if (!seriesDesc) seriesDesc = image.seriesDescription;
      try {
        const jpegBuffer = await convertCloToJpg(
          image.pixelData,
          null,
          image.wrapperData,
          100,
        );
        if (Buffer.isBuffer(jpegBuffer)) {
          const safeName = image.seriesDescription.replace(/[^a-zA-Z0-9_ -]/g, '').trim();
          const fileName = `${safeName}_${i + 1}.jpg`;
          // fflate expects Uint8Array; store uncompressed since JPEGs are already compressed
          files[fileName] = new Uint8Array(jpegBuffer);
        }
      } catch {
        // Skip failed conversions
      }
    }

    if (Object.keys(files).length === 0) {
      return NextResponse.json({ error: 'All image conversions failed' }, { status: 500 });
    }

    // Store without compression (level 0) since JPEGs are already compressed
    const zipOptions: Record<string, [Uint8Array, { level: 0 }]> = {};
    for (const [name, data] of Object.entries(files)) {
      zipOptions[name] = [data, { level: 0 }];
    }
    const zipBuffer = zipSync(zipOptions);

    const safeStudyName = seriesDesc.replace(/[^a-zA-Z0-9_ -]/g, '').trim() || 'xray_images';
    return new NextResponse(zipBuffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${safeStudyName}.zip"`,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
