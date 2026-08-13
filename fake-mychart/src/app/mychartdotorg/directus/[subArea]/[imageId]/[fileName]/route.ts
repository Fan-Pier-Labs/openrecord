import { NextRequest, NextResponse } from 'next/server';
import { DIRECTORY_LOGO } from '@/data/directory';
import { directoryLogoBytes } from '@/lib/directoryLogos';

/**
 * `GET /mychartdotorg/directus/<subArea>/<imageId>/<fileName>`
 *
 * An organization's own logo, at the path Epic's media host serves it from
 * (`media.epic.com/mychartdotorg/directus/organizations/<imageId>/<fileName>`).
 * The bytes are a checked-in placeholder, not anyone's real branding — see
 * `src/data/directory-logos/`.
 *
 * An unknown image 404s rather than returning a placeholder: "this logo does
 * not exist" is a case every client has to handle — eight organizations in the
 * real directory have no image at all — and a fake that always answers with
 * *something* is how that path stays untested until a patient sees it.
 */
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

  const bytes = directoryLogoBytes('organization.png');
  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      'Content-Type': 'image/png',
      'Content-Length': String(bytes.length),
      'Cache-Control': 'max-age=14400, stale-while-revalidate=28800',
    },
  });
}
