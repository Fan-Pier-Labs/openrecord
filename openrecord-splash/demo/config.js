/**
 * Demo configuration.
 *
 * AI_ENDPOINT is the `openrecord-demo-ai` API Gateway endpoint (see
 * `openrecord-demo-lambda/`). Leave it empty and the demo runs entirely
 * offline on its scripted engine — real tool calls against the fictional
 * record, pre-written prose.
 *
 * Override at runtime for local testing without editing this file:
 *   window.OPENRECORD_DEMO_AI_ENDPOINT = 'http://localhost:9000'
 *   …or append ?ai=<url> to the demo URL.
 */

const DEFAULT_AI_ENDPOINT = '';

function endpointOverride() {
  if (typeof window === 'undefined') return null;
  const fromQuery = new URLSearchParams(window.location.search).get('ai');
  if (fromQuery) return fromQuery;
  if (window.OPENRECORD_DEMO_AI_ENDPOINT) return window.OPENRECORD_DEMO_AI_ENDPOINT;
  return null;
}

export const AI_ENDPOINT = endpointOverride() ?? DEFAULT_AI_ENDPOINT;

/** True when a live model is wired up; false means scripted-only. */
export const HAS_LIVE_AI = Boolean(AI_ENDPOINT);

export const GITHUB_URL = 'https://github.com/Fan-Pier-Labs/openrecord';
