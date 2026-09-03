import { NextResponse, type NextRequest } from 'next/server';
import { mountPrefix } from '@/lib/mount';
import { publicBaseUrl } from '@/lib/publicUrl';
import { isLegacyEpicVersion } from '@/lib/epicVersion';

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function html(body: string, status = 200) {
  return new NextResponse(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

/** A 302 to another route under whichever prefix this instance is mounted at. */
export function redirectTo(request: NextRequest, path: string) {
  return NextResponse.redirect(new URL(`${mountPrefix()}${path}`, publicBaseUrl(request)), 302);
}

export const ERROR_PAGE_HTML = `<!DOCTYPE html><html><head><title>Error</title></head><body>
<h1>An error has occurred.</h1>
<p>We're sorry, but something went wrong. Please try again later.</p>
</body></html>`;

/**
 * ASP.NET's error surface, as observed live on three instances.
 *
 * A request the server can't route or refuses (unknown `/api/*` path, an API
 * POST missing its `__RequestVerificationToken`) does NOT get a tidy JSON
 * error. On November 2025 instances (two of three) it gets ASP.NET's classic redirect
 * dance: 302 to `/Home/FourOhFour?aspxerrorpath=<path>` (unknown path) or
 * `/Home/FiveHundred?aspxerrorpath=<path>` (server error), each of which 302s
 * on to `/Home/Error?code=14`, which renders a 200 HTML error page. On the
 * August 2025 instance the same failures answer a bare 500 HTML error page with no
 * redirect. `POST /mode {"epicVersion":"August 2025"}` selects the second shape.
 */
export function aspNetFailure(
  request: NextRequest,
  kind: 'fourohfour' | 'fivehundred',
  failedPath: string,
): NextResponse {
  if (isLegacyEpicVersion()) {
    return html(ERROR_PAGE_HTML, 500);
  }
  const page = kind === 'fourohfour' ? 'FourOhFour' : 'FiveHundred';
  const target = `${mountPrefix()}/Home/${page}?aspxerrorpath=${encodeURIComponent(`${mountPrefix()}/${failedPath}`)}`;
  return NextResponse.redirect(new URL(target, publicBaseUrl(request)), 302);
}
