import { NextResponse } from 'next/server';
import { isMetaRefreshMount, isRootMount } from '@/lib/mount';

// GET / → however this instance announces where MyChart lives. This is the only
// thing the scraper has to go on when it discovers the firstPathPart.
//
// Three shapes, matching three ways real MyChart is deployed:
//
//   - Path-prefixed (default): absolute redirect to /MyChart/, as
//     mychart.uhhospitals.org does.
//   - Root-mounted: a *relative* redirect to `./Authentication/Login?`,
//     byte-for-byte what mychart.clevelandclinic.org sends. The relative form
//     and the trailing `?` both matter — the scraper resolves this header to
//     decide whether there's a path prefix at all, and naively taking the first
//     path segment here yields "Authentication".
//   - Meta-refresh: 200 with no Location header at all, and an *absolute* URL
//     inside a `<meta http-equiv="refresh">`, which is what mychart.renown.org
//     serves. The absolute form matters — a parser that just strips slashes
//     folds the host into the prefix and produces `https:mychart.renown.orgmychart`.
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

  if (isMetaRefreshMount()) {
    // Renown's tag verbatim apart from the host and the prefix's casing — real
    // Renown says `/mychart` where this fake serves `/MyChart`. The odd spacing
    // before the `;` and the lowercase `url=` key are copied as-is.
    const body = `<html><head><meta http-equiv="refresh" content="1 ;url=${protocol}://${host}/MyChart"></head><body></body></html>`;
    return new NextResponse(body, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  return NextResponse.redirect(new URL(`${protocol}://${host}/MyChart/`), 302);
}
