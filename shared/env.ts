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

/**
 * How long a single outbound request may take before it is abandoned.
 *
 * A host that accepts the connection and then never answers would otherwise
 * hang a scrape forever while holding one of that host's ten permits, so a few
 * of them starve every other category on the same instance. Sixty seconds is
 * well past the slowest thing MyChart legitimately does (a big EHI export or
 * document render) and far short of "forever".
 *
 * Override with MYCHART_REQUEST_TIMEOUT_MS. Anything that isn't a positive
 * integer falls back to the default; 0 is accepted and means no timeout, for
 * debugging a request that really does need to run long.
 */
export const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;

function parseRequestTimeout(raw: string | undefined): number {
  // `Number('')` is 0, and 0 means "no timeout" here — an empty or unset
  // variable must not silently disable the deadline.
  if (raw === undefined || raw.trim() === '') return DEFAULT_REQUEST_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return DEFAULT_REQUEST_TIMEOUT_MS;
  }
  return parsed;
}

export const REQUEST_TIMEOUT_MS = parseRequestTimeout(process.env.MYCHART_REQUEST_TIMEOUT_MS);

/** Exported for tests — the parsing rule above, without the process.env read. */
export const __parseRequestTimeoutForTest = parseRequestTimeout;
