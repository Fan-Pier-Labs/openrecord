import { NextResponse, type NextRequest } from 'next/server';
import { isRootMount } from '@/lib/mount';
import { PROXY_SELECTOR_PLACEHOLDER, renderProxySelector } from '@/lib/html';
import {
  GET_PRIVATE, GET_PRIVATE_PATTERNS, GET_PUBLIC, GET_PUBLIC_PATTERNS,
  POST_PATTERNS, POST_ROUTES,
} from '@/handlers';
import { unknownGet, unknownPost } from '@/handlers/generic';
import { mountRoot } from '@/handlers/session';
import { requireSession, requiresAntiforgeryToken } from '@/handlers/guards';
import { activeDataset, currentUser, proxySelectorFor } from '@/handlers/records';
import { aspNetFailure, json } from '@/handlers/respond';
import { resolve, type HandlerContext } from '@/handlers/types';

type RouteParams = { params: Promise<{ path?: string[] }> };

/**
 * `handleGet`/`handlePost` are the MyChart surface itself, independent of where
 * it's mounted; the root catch-all imports them to serve the same responses from
 * the domain root. The `GET`/`POST` Next.js actually routes here are thin
 * wrappers that refuse to answer under `/MyChart` when the instance is
 * root-mounted — a root-mounted instance has no `/MyChart` to serve, and a fake
 * that answers on both prefixes lets a broken prefix guess silently "work".
 *
 * Every path below the mount is dispatched through the tables in
 * `src/handlers/`; this file owns only what is common to all of them — the
 * mount guard, the session and antiforgery gates, and the header rewrite.
 */
function contextFor(request: NextRequest, path: string[]): HandlerContext {
  const joined = path.join('/');
  // ASP.NET routing is case-insensitive, so route tables are keyed on the
  // lowercased path. The original casing is kept for `aspxerrorpath` and the
  // unhandled-POST log, which echo what the client actually sent.
  return { request, path: joined, lower: joined.toLowerCase(), ds: activeDataset(request) };
}

async function renderGet(request: NextRequest, { params }: RouteParams) {
  const { path } = await params;
  if (!path || path.length === 0) return mountRoot(request);

  const ctx = contextFor(request, path);

  // Everything in the public group is login-flow surface, served without a
  // session: the login and terms pages, the keepalives (which answer "0"
  // rather than redirecting — the contract MyChart's own JS relies on), and
  // ASP.NET's error pages, since a client bounced to FourOhFour/FiveHundred
  // mid-failure is often exactly one whose request was rejected before
  // authentication was consulted.
  const publicHandler = resolve(ctx.lower, GET_PUBLIC, GET_PUBLIC_PATTERNS);
  if (publicHandler) return publicHandler(ctx);

  // Everything below is post-login surface. Real MyChart guards all of it the
  // same way: no live session → 302 to the login page (which a redirect-
  // following client turns into a 200 HTML login page — that's what an
  // expired-session API call actually looks like from the scraper's side).
  const redirect = requireSession(request);
  if (redirect) return redirect;

  const handler = resolve(ctx.lower, GET_PRIVATE, GET_PRIVATE_PATTERNS);
  return handler ? handler(ctx) : unknownGet(ctx);
}

async function renderPost(request: NextRequest, { params }: RouteParams) {
  const { path } = await params;
  if (!path || path.length === 0) return json({ error: 'Not found' }, 404);

  const ctx = contextFor(request, path);

  // ── Session enforcement ─────────────────────────────────────────
  // Real MyChart's entire POST surface outside the login flow requires a live
  // session, api/* JSON endpoints included: an expired session 302s to the
  // login page exactly like the HTML routes, which is why a scraper that blindly
  // calls .json() on the follow-up sees login-page HTML, not a JSON error.
  // Authentication/* stays open — DoLogin, 2FA, terms acceptance and the
  // passkey challenge ARE the login flow.
  if (!ctx.lower.startsWith('authentication/')) {
    // CSRF before authentication, exactly as observed live: a POST with no
    // __RequestVerificationToken header is rejected with the ASP.NET
    // error surface (FiveHundred redirect on November 2025
    // instances, bare 500 on August 2025) even when no session was presented at all. Only a request that
    // clears the token check falls through to the login-redirect the
    // expired-session detector in makeAuthenticatedRequest.ts relies on.
    // The legacy Care Team activity enforces the token the same way its React
    // siblings do — verified on both captured instances — so it is not enough
    // to gate on the /api/ prefix.
    if (requiresAntiforgeryToken(ctx.lower) && !request.headers.get('__requestverificationtoken')) {
      return aspNetFailure(request, 'fivehundred', ctx.path);
    }
    const redirect = requireSession(request);
    if (redirect) return redirect;
  }

  const handler = resolve(ctx.lower, POST_ROUTES, POST_PATTERNS);
  return handler ? handler(ctx) : unknownPost(ctx);
}

// ─── Prefix guard ───────────────────────────────────────────────────
// Mirror of the root catch-all: each mount mode serves MyChart from exactly one
// place, never both.
function notServedHere(path: string[] | undefined) {
  return NextResponse.json(
    { error: 'Not found', path: (path ?? []).join('/') },
    { status: 404 },
  );
}

/**
 * Fill in the header's proxy selector for whichever session made this request.
 *
 * Doing it here rather than passing a model into each page function keeps every
 * page consistent — real MyChart shows the selector in the header everywhere,
 * not only on Home — without threading an argument through ~25 templates.
 * Pages for accounts with no proxy access get an empty string, matching real
 * instances, which render no selector for a single-record account.
 */
async function withProxySelector(request: NextRequest, res: NextResponse): Promise<NextResponse> {
  if (!(res.headers.get('Content-Type') || '').includes('text/html')) return res;
  const body = await res.text();
  if (!body.includes(PROXY_SELECTOR_PLACEHOLDER)) {
    return new NextResponse(body, { status: res.status, headers: res.headers });
  }
  const user = currentUser(request);
  const markup = user ? renderProxySelector(proxySelectorFor(request, user)) : '';
  return new NextResponse(body.replaceAll(PROXY_SELECTOR_PLACEHOLDER, markup), {
    status: res.status,
    headers: res.headers,
  });
}

/**
 * The MyChart surface itself, independent of where it's mounted. The root
 * catch-all calls these directly when the instance is root-mounted, so the
 * header selector is filled in here rather than in the prefix-gated exports
 * below — otherwise root-mounted pages would ship the raw placeholder.
 */
export async function handleGet(request: NextRequest, ctx: RouteParams) {
  return withProxySelector(request, await renderGet(request, ctx));
}

export async function handlePost(request: NextRequest, ctx: RouteParams) {
  return withProxySelector(request, await renderPost(request, ctx));
}

export async function GET(request: NextRequest, ctx: RouteParams) {
  if (isRootMount()) return notServedHere((await ctx.params).path);
  return handleGet(request, ctx);
}

export async function POST(request: NextRequest, ctx: RouteParams) {
  if (isRootMount()) return notServedHere((await ctx.params).path);
  return handlePost(request, ctx);
}
