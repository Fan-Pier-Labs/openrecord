import { NextRequest, NextResponse } from "next/server";

/**
 * Opt-in CORS support for browser-based E2E tests (the expo app's web
 * export scrapes fake-mychart directly from the page's origin).
 *
 * OFF by default: real MyChart does not serve CORS headers, and the
 * fake must stay faithful to the real API (see CLAUDE.md fidelity
 * rule). Set FAKE_MYCHART_CORS=true only in web-E2E runs.
 */
const CORS_ENABLED = process.env.FAKE_MYCHART_CORS === "true";

export function proxy(request: NextRequest) {
  if (!CORS_ENABLED) return NextResponse.next();

  const origin = request.headers.get("origin") ?? "*";
  const corsHeaders: Record<string, string> = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      request.headers.get("access-control-request-headers") ?? "*",
    "Access-Control-Expose-Headers": "*",
  };

  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: corsHeaders });
  }

  const response = NextResponse.next();
  for (const [key, value] of Object.entries(corsHeaders)) {
    response.headers.set(key, value);
  }
  return response;
}
