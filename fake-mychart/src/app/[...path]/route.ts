import { NextRequest, NextResponse } from 'next/server';
import { GET as myChartGet, POST as myChartPost } from '../MyChart/[[...path]]/route';
import { isRootMount } from '@/lib/mount';

/**
 * Root-level catch-all, for modelling a MyChart instance mounted at the domain
 * root (Cleveland Clinic). When FAKE_MYCHART_ROOT_MOUNT=true these paths are
 * served by exactly the same handlers as `/MyChart/*` — same responses, same
 * status codes — just without the prefix.
 *
 * When the fake is running in its default path-prefixed mode, MyChart is not
 * served here at all, so these paths 404. Keeping that honest matters: it's
 * what stops a scraper bug from silently "working" against the fake.
 *
 * More specific routes (`/api/*`, `/reset`, `/e/*`, `/MyChart/*`) take
 * precedence over this catch-all, so they are unaffected in both modes.
 */
function notServedHere(path: string[] | undefined) {
  return NextResponse.json(
    { error: 'Not found', path: (path ?? []).join('/') },
    { status: 404 },
  );
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  if (!isRootMount()) return notServedHere((await ctx.params).path);
  return myChartGet(request, ctx);
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  if (!isRootMount()) return notServedHere((await ctx.params).path);
  return myChartPost(request, ctx);
}
