import { NextRequest, NextResponse } from 'next/server';
import { handleGet as myChartGet, handlePost as myChartPost } from '../MyChart/[[...path]]/route';
import { isRootMount } from '@/lib/mount';

/**
 * Root-level catch-all, for modelling a MyChart instance mounted at the domain
 * root (Cleveland Clinic). In root mode these paths are served by exactly the
 * same handlers as `/MyChart/*` — same responses, same status codes — just
 * without the prefix.
 *
 * In the default path-prefixed mode MyChart is not served here at all, so these
 * paths 404. Keeping that honest matters: it's what stops a scraper bug from
 * silently "working" against the fake. `/MyChart/*` applies the mirror-image
 * guard, so exactly one of the two prefixes answers in either mode.
 *
 * More specific routes (`/api/*`, `/reset`, `/mode`, `/e/*`, `/MyChart/*`) take
 * precedence over this catch-all, so they are unaffected in both modes.
 */
function notServedHere(path: string[] | undefined) {
  return NextResponse.json(
    { error: 'Not found', path: (path ?? []).join('/') },
    { status: 404 },
  );
}

/**
 * Is this request addressing a deployment prefix that doesn't exist here?
 *
 * A root-mounted instance serves `/Authentication/Login` and nothing at
 * `/<anything>/Authentication/Login` — real ones answer 404 there
 * (`adams.mychartcc.com/DefaultAsp/Authentication/Login`, and ochin answers the
 * same for a made-up prefix). That 404 is load-bearing for the scraper: it is
 * how a wrong prefix guess gets ruled out. The shared handler ends with a
 * generic CSRF-token page for unknown GETs, which a scraper checking "does this
 * look like a login page?" would read as a yes — so the check has to happen
 * here, before that fallback, where root-mount knowledge lives.
 */
function addressesAPrefixThatDoesNotExist(path: string[] | undefined): boolean {
  if (!path || path.length < 2) return false;
  return path.slice(1).join('/').toLowerCase().startsWith('authentication/');
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  const { path } = await ctx.params;
  if (!isRootMount()) return notServedHere(path);
  if (addressesAPrefixThatDoesNotExist(path)) return notServedHere(path);
  return myChartGet(request, ctx);
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  const { path } = await ctx.params;
  if (!isRootMount()) return notServedHere(path);
  if (addressesAPrefixThatDoesNotExist(path)) return notServedHere(path);
  return myChartPost(request, ctx);
}
