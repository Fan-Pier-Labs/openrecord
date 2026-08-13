/**
 * How many requests may be in flight to a single MyChart host at once.
 *
 * Ten is comfortably below what a browser opens against one origin (six for
 * HTTP/1.1, more over HTTP/2) while still letting a full 30-category scrape
 * finish quickly. Raise it only with evidence that a given instance tolerates
 * more — the cost of guessing high is the whole deployment's egress IP getting
 * blocked for every user at once.
 *
 * Override with MYCHART_MAX_CONCURRENT_REQUESTS_PER_HOST. Anything that isn't
 * a positive integer falls back to the default rather than silently disabling
 * the limit.
 */
export const DEFAULT_MAX_CONCURRENT_REQUESTS_PER_HOST = 10;

function parseMaxConcurrency(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_MAX_CONCURRENT_REQUESTS_PER_HOST;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return DEFAULT_MAX_CONCURRENT_REQUESTS_PER_HOST;
  }
  return parsed;
}

export const MAX_CONCURRENT_REQUESTS_PER_HOST = parseMaxConcurrency(
  process.env.MYCHART_MAX_CONCURRENT_REQUESTS_PER_HOST,
);

/** Exported for tests — the parsing rule above, without the process.env read. */
export const __parseMaxConcurrencyForTest = parseMaxConcurrency;
