import { NextRequest, NextResponse } from 'next/server';
import { DIRECTORY_LOGO } from '@/data/directory';

/**
 * `GET /mychartdotorg/directus/<subArea>/<imageId>/<fileName>`
 *
 * The logo half of the directory, mirroring the path Epic's media host serves
 * (`media.epic.com/mychartdotorg/directus/organizations/<imageId>/<fileName>`)
 * so the icon scraper can be exercised without reaching Epic.
 *
 * An unknown image 404s rather than returning a placeholder: "this logo does
 * not exist" is a case every client has to handle — eight organizations in the
 * real directory have no image at all — and a fake that always answers with
 * *something* is how that path stays untested until a patient sees it.
 */

/** A 1x1 transparent PNG. Real logos are ~600x230 banners; only the bytes and
 * the content type matter to anything that fetches one. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ subArea: string; imageId: string; fileName: string }> },
) {
  const { subArea, imageId, fileName } = await ctx.params;

  const known =
    subArea === DIRECTORY_LOGO.subAreaName &&
    imageId === DIRECTORY_LOGO.imageId &&
    fileName === DIRECTORY_LOGO.fileName;
  if (!known) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return new NextResponse(PNG_1X1 as unknown as BodyInit, {
    headers: {
      'Content-Type': 'image/png',
      'Content-Length': String(PNG_1X1.length),
      'Cache-Control': 'max-age=14400, stale-while-revalidate=28800',
    },
  });
}
