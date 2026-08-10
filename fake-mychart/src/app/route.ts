import { NextResponse } from 'next/server';
import { isMetaRefreshDiscovery, isRootMount, mountPrefix } from '@/lib/mount';

// GET / → however this instance announces where MyChart lives. This is the only
// thing the scraper has to go on when it discovers the firstPathPart.
//
// Two independent knobs, both set via POST /mode (see src/lib/mount.ts):
//
//   - Where MyChart is mounted: under /MyChart (default) or at the domain root.
//   - How that's announced: a 302 with a Location header (default), or 200 with
//     an absolute URL inside a <meta http-equiv="refresh">.
//
// Real instances mix these freely — Renown is prefixed-and-meta-refresh,
// Cleveland Clinic is root-and-redirect — so all four combinations work here.
export async function GET(request: Request) {
  // Where the scraper should end up. Root-mounted instances point straight at a
  // MyChart route, since there's no prefix to announce. Renown's meta refresh
  // carries no trailing slash; uhhospitals' redirect does.
  const target = isRootMount()
    ? '/Authentication/Login'
    : mountPrefix() + (isMetaRefreshDiscovery() ? '' : '/');

  // Use the Host header so we stay on the domain the client actually used (in
  // Docker Compose, request.url resolves to localhost but the client uses the
  // service name).
  const host = request.headers.get('host') || new URL(request.url).host;
  // CloudFront sets cloudfront-forwarded-proto; ALB sets x-forwarded-proto
  const protocol = request.headers.get('cloudfront-forwarded-proto')
    || request.headers.get('x-forwarded-proto')
    || (host.includes('localhost') || !host.includes('.') ? 'http' : 'https');

  if (isMetaRefreshDiscovery()) {
    // Renown's tag verbatim apart from the host and the prefix's casing — real
    // Renown says `/mychart` where this fake serves `/MyChart`. The odd spacing
    // before the `;` and the lowercase `url=` key are copied as-is. The URL is
    // absolute because that's the shape that breaks naive parsing.
    const body = `<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN" "http://www.w3.org/TR/html4/loose.dtd">
<HTML>
<HEAD>
<TITLE>MyChart - Login Page</TITLE>
<meta http-equiv="refresh" content="1 ;url=${protocol}://${host}${target}">

</HEAD>
<BODY>
<!-- this is a redirect to MyChart -->
</BODY>
</HTML>`;
    return new NextResponse(body, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  if (isRootMount()) {
    // Relative, with the trailing `?`, byte-for-byte what Cleveland Clinic
    // sends. Naively taking the first path segment here yields "Authentication".
    return new NextResponse(null, {
      status: 302,
      headers: { Location: './Authentication/Login?' },
    });
  }

  return NextResponse.redirect(new URL(`${protocol}://${host}${target}`), 302);
}
