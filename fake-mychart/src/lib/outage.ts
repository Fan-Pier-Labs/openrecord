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
 * The other bad day is a slow one. `responseDelaySeconds` holds every gated
 * (post-login) request for that long before it is answered, so a client's
 * handling of a call that outruns its host's patience — the Claude Desktop
 * extension's `check_pending_call` — can be exercised against this server.
 * Applied at the same point as the outage, after the gates, so login itself
 * stays quick. Keep it under the scrapers' 2-minute per-request deadline
 * (`scrapers/http.ts`) or every request simply fails; a chart read makes at
 * least two gated requests, so 110 s is enough to push any data tool past the
 * extension's 3.5-minute deadline.
 */

const outageState: { failingEndpoints: Set<string>; responseDelaySeconds: number } = {
  failingEndpoints: new Set(),
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

export function getFailingEndpoints(): string[] {
  return [...outageState.failingEndpoints].sort();
}

export function setFailingEndpoints(paths: readonly string[]): void {
  outageState.failingEndpoints = new Set(paths.map(normalizeEndpointPath).filter(p => p.length > 0));
}

/** Whether the lowercased request path is one the instance is failing. */
export function isFailingEndpoint(lower: string): boolean {
  return outageState.failingEndpoints.has(normalizeEndpointPath(lower));
}

export function resetFailingEndpoints(): void {
  outageState.failingEndpoints = new Set();
  outageState.responseDelaySeconds = 0;
}
