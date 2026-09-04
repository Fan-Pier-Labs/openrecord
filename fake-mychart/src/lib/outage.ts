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
 */

const outageState: { failingEndpoints: Set<string> } = {
  failingEndpoints: new Set(),
};

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
}
