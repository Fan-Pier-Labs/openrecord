import { NextResponse } from 'next/server';
import { isRootMount } from '@/lib/mount';

// GET / → 302 redirect. This is how the scraper discovers the firstPathPart.
//
// Two shapes, matching the two ways real MyChart is deployed:
//
//   - Path-prefixed (default): absolute redirect to /MyChart/, as
//     mychart.uhhospitals.org does.
//   - Root-mounted (FAKE_MYCHART_ROOT_MOUNT=true): a *relative* redirect to
//     `./Authentication/Login?`, byte-for-byte what mychart.clevelandclinic.org
//     sends. The relative form and the trailing `?` both matter — the scraper
//     resolves this header to decide whether there's a path prefix at all, and
//     naively taking the first path segment here yields "Authentication".
export async function GET(request: Request) {
  if (isRootMount()) {
    return new NextResponse(null, {
      status: 302,
      headers: { Location: './Authentication/Login?' },
    });
  }

  // Use the Host header so the redirect stays on the same domain the client used
  // (in Docker Compose, request.url resolves to localhost but the client uses the service name)
  const host = request.headers.get('host') || new URL(request.url).host;
  // CloudFront sets cloudfront-forwarded-proto; ALB sets x-forwarded-proto
  const protocol = request.headers.get('cloudfront-forwarded-proto')
    || request.headers.get('x-forwarded-proto')
    || (host.includes('localhost') || !host.includes('.') ? 'http' : 'https');
  return NextResponse.redirect(new URL(`${protocol}://${host}/MyChart/`), 302);
}
