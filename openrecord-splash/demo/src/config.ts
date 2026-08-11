/**
 * Demo configuration.
 *
 * AI_ENDPOINT is the `openrecord-demo-ai` API Gateway endpoint (see
 * `openrecord-demo-lambda/`). Every reply in the demo comes from a real model
 * call through it — there is no offline path, so without an endpoint the demo
 * says so plainly rather than answering from a canned table.
 *
 * Resolution order:
 *   1. `?ai=<url>` on the demo URL — handy for pointing at a local proxy.
 *   2. `VITE_AI_ENDPOINT` at build or dev time.
 *   3. The baked-in default below.
 */

const DEFAULT_AI_ENDPOINT = '';

function endpointOverride(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('ai');
}

export const AI_ENDPOINT: string =
  endpointOverride() ?? import.meta.env.VITE_AI_ENDPOINT ?? DEFAULT_AI_ENDPOINT;

/** False means the demo cannot answer anything and should say so. */
export const HAS_LIVE_AI: boolean = Boolean(AI_ENDPOINT);

export const GITHUB_URL = 'https://github.com/Fan-Pier-Labs/openrecord';
