import { NextResponse } from 'next/server';
import { getDiscoveryMode, getMovedHost, isMetaRefreshDiscovery, isRootMount, mountPrefix } from '@/lib/mount';

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

  if (getDiscoveryMode() === 'script') {
    // mydovetale.ca's body, verbatim apart from the host and prefix — including
    // the HTML comment wrapper, which is what the page actually ships. There is
    // no Location header and no refresh tag; the assignment is the only clue.
    const body = `<script type="text/javascript">
<!--
window.location="${protocol}://${host}${target}";
// -->
</script>`;
    return new NextResponse(body, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  if (getDiscoveryMode() === 'landing-page') {
    // An affiliate chooser: 200, no redirect of any kind, and the mount is
    // named only by the links. Modelled on mychart.chihealth.com, which links
    // its own mount alongside a sister organization's on another host — so a
    // reader that just takes the first link it sees ends up at the wrong one.
    const body = `<!DOCTYPE html>
<html>
<head><title>Select your organization</title>
<link href="en-US/styles/Affiliates.css" rel="stylesheet" type="text/css" />
</head>
<body>
  <a href="https://mychart.sisterorg.example/theirprefix/"><img src="sisterlogo.png" /></a>
  <a href="${protocol}://${host}${target}"><img src="mychartlogo.png" /></a>
  <a href="/patients-and-visitors/find-a-doctor.html">Find a doctor</a>
</body>
</html>`;
    return new NextResponse(body, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  if (getDiscoveryMode() === 'moved-host') {
    // The deployment now lives on another hostname. Real examples redirect to
    // the new host's root and bounce onward from there; here we skip straight
    // to where that bounce ends, because in this fake both names resolve to the
    // same server and a second `/` would land back in this branch forever.
    const movedHost = getMovedHost();
    if (!movedHost) {
      return NextResponse.json(
        { error: 'discovery=moved-host needs a movedHost; POST /mode {"discovery":"moved-host","movedHost":"127.0.0.1:4000"}' },
        { status: 500 },
      );
    }
    return new NextResponse(null, {
      status: 301,
      headers: { Location: `${protocol}://${movedHost}${target}` },
    });
  }

  if (getDiscoveryMode() === 'default-asp') {
    // Root-mounted instances hop straight to the bare relative `DefaultAsp`
    // (adams.mychartcc.com); prefixed ones go to the mount first and hit
    // DefaultAsp on the way out of it. Either way the first hop names no route.
    if (isRootMount()) {
      return new NextResponse(null, { status: 302, headers: { Location: 'DefaultAsp' } });
    }
    return new NextResponse(null, {
      status: 302,
      headers: { Location: `${protocol}://${host}${mountPrefix()}/` },
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
