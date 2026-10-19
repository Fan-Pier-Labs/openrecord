// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * Endpoints this instance is currently failing on purpose.
 *
 * Real MyChart has bad days: a controller action throws, and the patient's
 * allergies come back as ASP.NET's error surface instead of JSON. The scraper
 * must surface that as a failure and never as an empty chart, and the only way
 * to prove it does is to make the fake fail a data endpoint on demand.
 *
 * A listed path answers with the same surface a real unhandled exception
 * produces on the active release (`aspNetFailure`, `fivehundred`): the
 * FiveHundred → `/Home/Error?code=14` redirect dance ending in a **200** HTML
 * page on November 2025, a bare 500 on August 2025. The failure is applied
 * after the antiforgery and session gates, where a real action's exception
 * happens, so an unauthenticated or token-less call still gets the answer it
 * would get on a healthy instance.
 *
 * Paths are below the mount prefix and matched the way routes are: whole path,
 * case-insensitively, query string ignored. Global to the process, like every
 * other knob; `/reset` clears it.
 *
 * An entry can also be `{ path, contains }`, which fails only the requests to
 * that path whose query string or body contains `contains` (case-sensitive,
 * since it is usually an id). That is one account's `GetVisits`, one order's
 * `GetDetails`, one flowsheet's readings — the single bad item among siblings
 * that answer, which a whole-path outage cannot express.
 *
 * The other bad day is a slow one. `responseDelaySeconds` holds every gated
 * (post-login) request that long, for exercising the Claude Desktop
 * extension's `check_pending_call` by hand. Keep it under the scrapers'
 * 2-minute per-request deadline (`scrapers/http.ts`) or every request fails.
 */

export type FailingEndpoint = string | { path: string; contains: string };

const outageState: { failingEndpoints: Set<string>; failingRequests: Array<{ path: string; contains: string }>; responseDelaySeconds: number } = {
  failingEndpoints: new Set(),
  failingRequests: [],
  responseDelaySeconds: 0,
};

export function getResponseDelaySeconds(): number {
  return outageState.responseDelaySeconds;
}

export function setResponseDelaySeconds(seconds: number): void {
  outageState.responseDelaySeconds = Math.max(0, seconds);
}

/** Resolves after the configured delay; at once when there is none. */
export function responseDelay(): Promise<void> {
  const ms = outageState.responseDelaySeconds * 1000;
  if (ms <= 0) return Promise.resolve();
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

/** A path the way the route tables key it: no leading slash, lowercased, no query. */
export function normalizeEndpointPath(path: string): string {
  return path.trim().replace(/^\/+/, '').split('?')[0]!.toLowerCase();
}

export function getFailingEndpoints(): FailingEndpoint[] {
  return [...[...outageState.failingEndpoints].sort(), ...outageState.failingRequests];
}

export function setFailingEndpoints(entries: readonly FailingEndpoint[]): void {
  const paths = new Set<string>();
  const requests: Array<{ path: string; contains: string }> = [];
  for (const entry of entries) {
    const path = normalizeEndpointPath(typeof entry === 'string' ? entry : entry.path);
    if (path.length === 0) continue;
    if (typeof entry === 'string') paths.add(path);
    else if (entry.contains.length > 0) requests.push({ path, contains: entry.contains });
  }
  outageState.failingEndpoints = paths;
  outageState.failingRequests = requests;
}

/** Whether a request to this path can only be judged by its query string and body. */
export function needsRequestText(lower: string): boolean {
  const path = normalizeEndpointPath(lower);
  return outageState.failingRequests.some(r => r.path === path);
}

/**
 * Whether the lowercased request path is one the instance is failing.
 * `requestText` is the request's query string and body, and only matters for
 * a `{ path, contains }` entry.
 */
export function isFailingEndpoint(lower: string, requestText = ''): boolean {
  const path = normalizeEndpointPath(lower);
  if (outageState.failingEndpoints.has(path)) return true;
  return outageState.failingRequests.some(r => r.path === path && requestText.includes(r.contains));
}

export function resetFailingEndpoints(): void {
  outageState.failingEndpoints = new Set();
  outageState.failingRequests = [];
  outageState.responseDelaySeconds = 0;
}
