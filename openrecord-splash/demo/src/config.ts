/**
 * Demo configuration.
 *
 * AI_ENDPOINT is the `openrecord-demo-ai` API Gateway endpoint (see
 * `openrecord-demo-lambda/`). Leave it empty and the demo runs entirely
 * offline on its scripted engine — real tool calls against the fictional
 * record, pre-written prose.
 *
 * Override at runtime for local testing without editing this file by
 * appending `?ai=<url>` to the demo URL.
 */

const DEFAULT_AI_ENDPOINT = '';

function endpointOverride(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('ai');
}

export const AI_ENDPOINT: string = endpointOverride() ?? DEFAULT_AI_ENDPOINT;

/** True when a live model is wired up; false means scripted-only. */
export const HAS_LIVE_AI: boolean = Boolean(AI_ENDPOINT);

export const GITHUB_URL = 'https://github.com/Fan-Pier-Labs/openrecord';
