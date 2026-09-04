/**
 * The raw envelope every read scraper returns.
 *
 * A scraper's job is to talk to MyChart and hand back exactly what MyChart
 * sent. Deciding what a caller gets to see is the processor's job
 * (`scrapers/myChart/processors/`). Half the scrapers issue more than one
 * request — labs is four list calls plus two or three per order, billing is a
 * page scrape plus three JSON calls per account, past visits pages — so "the
 * raw HTTP response" is a list of requests, not one body.
 *
 * `raw` output mode returns {@link unwrapRaw} of this: the single body when
 * there was one request, the whole envelope otherwise.
 *
 * A request MyChart did not answer properly — a 5xx, a WAF block page, the
 * ASP.NET error page a November 2025 instance bounces a failed request to —
 * is recorded and then THROWN as a {@link MyChartResponseError}, in every
 * output mode. It used to be recorded and left for the processor to notice,
 * and five of twenty-nine did; for the rest, a 500 read as `{}`, projected to
 * `[]`, and rendered as "no allergies on file". The same care that keeps an
 * expired session from reading as an empty chart applies to a server error.
 * A scraper whose request is genuinely best-effort opts out per call with
 * `tolerateFailure`, and its processor is then the one reporting the gap.
 */

import type { MyChartRequest } from './myChartRequest';
import type { RequestConfig } from './types';
import { makeAuthenticatedRequest, type AuthenticatedRequestOptions } from './makeAuthenticatedRequest';
import { requireVerificationToken } from './util';

export interface RawRequestRecord {
  /** The path as sent, minus the `noCache` cache-buster. */
  path: string;
  method: 'GET' | 'POST';
  /**
   * The body we posted, when it matters for reading the response (an order
   * key, a CSN, a page cursor). JSON bodies are recorded parsed.
   */
  requestBody?: unknown;
  status: number;
  contentType: string;
  /** Parsed JSON when the response was JSON, otherwise the text. */
  body: unknown;
  /**
   * `token` marks the activity-page fetch made only to obtain the antiforgery
   * token. It is part of the exchange, so it is recorded, but it is not the
   * payload: {@link unwrapRaw} looks past it.
   */
  purpose?: 'token';
  /**
   * Why the answer was not the data, when it was not
   * ({@link describeResponseFailure}). Set on every failed record, tolerated
   * or thrown, so a processor reading a tolerated record can tell Epic's
   * 200 error page from data without repeating the classification.
   */
  failure?: string;
}

export interface RawResponse {
  requests: RawRequestRecord[];
}

/**
 * MyChart answered a request with something other than the data: a non-2xx
 * status, its own error page, or a WAF's block page. Thrown by
 * {@link RawCollector.send} after the answer is recorded, so the envelope a
 * tolerant caller keeps still shows what came back. Clients surface the
 * message as-is; nothing about it is an empty chart.
 */
export class MyChartResponseError extends Error {
  readonly method: string;
  readonly path: string;
  readonly status: number;

  constructor(record: RawRequestRecord, reason: string, excerpt: string) {
    super(
      `MyChart answered ${record.method} ${record.path} with ${reason}` +
        (excerpt ? `: "${excerpt}"` : '') +
        '. The request failed; nothing was read, so this is not an empty result. Retry later, ' +
        'and if it keeps failing the instance may be down or blocking this request shape.',
    );
    this.name = 'MyChartResponseError';
    this.method = record.method;
    this.path = record.path;
    this.status = record.status;
  }
}

/**
 * ASP.NET's error pages. A November 2025 instance answers a failed request
 * with a 302 to `/Home/FiveHundred` (or `/Home/FourOhFour`), which 302s on to
 * `/Home/Error?code=14`, a 200 HTML page — so after the redirects are
 * followed, the only trace of the failure is the URL the response came from.
 * An August 2025 instance answers a bare 500 instead, which the status catches.
 */
const ASPNET_ERROR_PAGE_RE = /\/home\/(error|fivehundred|fourohfour)(?:[/?#]|$)/i;

/** F5's block page: HTTP 200, `text/html`, and this text where the data should be. */
const WAF_BLOCK_RE = /Request Rejected|The requested URL was rejected/i;

function isAspNetErrorPage(url: string | null | undefined): boolean {
  if (!url) return false;
  let pathname = url;
  try {
    pathname = new URL(url).pathname;
  } catch {
    // A relative Location header: test it as-is.
  }
  return ASPNET_ERROR_PAGE_RE.test(pathname);
}

/**
 * Why a response is not the data it was asked for, or null when it might be.
 * Cheapest signal first. A redirect a caller asked to see for itself
 * (`followRedirects: false`) is only a failure when it points at the error
 * page; where it points otherwise is the caller's to read.
 *
 * The error-page check reads `response.url`, so it needs the transport to
 * report where the final response came from. Node and Bun do. On device the
 * transport is `expo/fetch` (`scrapers/http.ts`), whose `FetchResponse.url`
 * is the native response URL (`metadata.url`, checked in Expo SDK 57) — and
 * `makeRequest` follows redirects itself with `redirect: 'manual'`, so the
 * response being classified is always the last hop's own, not a
 * platform-followed one.
 */
export function describeResponseFailure(
  response: Response,
  text: string,
  config: Pick<RequestConfig, 'followRedirects'>,
): string | null {
  const contentType = response.headers.get('content-type') ?? '';
  if (response.status >= 300 && response.status < 400 && config.followRedirects === false) {
    const location = response.headers.get('Location') ?? '';
    return isAspNetErrorPage(location)
      ? `HTTP ${response.status} to its error page ${location}`
      : null;
  }
  if (response.status < 200 || response.status >= 300) {
    return `HTTP ${response.status}${contentType ? ` (${contentType})` : ''}`;
  }
  if (isAspNetErrorPage(response.url)) {
    return `HTTP ${response.status} from its error page ${response.url}`;
  }
  if (contentType.includes('text/html') && WAF_BLOCK_RE.test(text.slice(0, 2000))) {
    return (
      `HTTP ${response.status} and a WAF block page in place of the data — the request was rejected ` +
      'by the web application firewall in front of MyChart, not answered by MyChart'
    );
  }
  return null;
}

/**
 * The first line or so of a body, tags stripped, for an error message. This
 * is page text — an error page's apology, a WAF's support id — never chart
 * data: a failed answer carries none, which is the point. It does reach
 * whatever logs the error message.
 */
function excerptOf(text: string): string {
  const plain = text
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > 160 ? `${plain.slice(0, 157)}...` : plain;
}

/** Strip the cache-busting `noCache=<random>` query param scrapers append. */
export function displayPath(path: string): string {
  return path
    .replace(/([?&])noCache=[^&]*&?/, '$1')
    .replace(/[?&]$/, '');
}

function parseRequestBody(config: RequestConfig): unknown {
  if (config.body === undefined) return undefined;
  const contentType = config.headers?.['Content-Type'] ?? config.headers?.['content-type'] ?? '';
  if (contentType.includes('json')) {
    try {
      return JSON.parse(config.body);
    } catch {
      return config.body;
    }
  }
  return config.body;
}

export interface SendOptions {
  /** Marks the activity-page fetch made only for its antiforgery token. */
  purpose?: 'token';
  /**
   * Record a failed answer and return it instead of throwing. Only for a
   * request whose failure the scraper's processor reports as a gap
   * (`externalProvidersUnavailable`), never for the payload.
   */
  tolerateFailure?: boolean;
}

/**
 * Records every request a scraper makes so the envelope is the untouched
 * record of the exchange. Wraps `makeAuthenticatedRequest`, so the session
 * expiry handling and the active-patient restore still apply to every call.
 */
export class RawCollector {
  readonly requests: RawRequestRecord[] = [];

  constructor(
    private readonly request: MyChartRequest,
    private readonly options?: AuthenticatedRequestOptions,
  ) {}

  /**
   * Issue a request (named `send`, not `fetch`: http.unit.test.ts greps the
   * scrapers for bare `fetch(` calls, and this is not a second network path —
   * it wraps makeAuthenticatedRequest), record it, and return the response
   * plus its body: parsed JSON when the body parses as JSON, otherwise the
   * text. The Response has already been read; use the returned body.
   *
   * An answer that is not the data ({@link describeResponseFailure}) is
   * recorded and then thrown as a {@link MyChartResponseError}. With
   * `tolerateFailure` it is recorded and returned with `failure` set instead —
   * for a request that is best-effort by design (an optional endpoint, a
   * speculative probe), whose processor then reports the gap honestly. Never
   * for the payload: a tolerated 500 on the payload is the empty chart this
   * exists to prevent.
   */
  async send(
    config: RequestConfig,
    options: SendOptions = {},
  ): Promise<{ response: Response; body: unknown; text: string; failure: MyChartResponseError | null }> {
    const response = await makeAuthenticatedRequest(this.request, config, this.options);
    const text = await response.text();
    const contentType = response.headers.get('content-type') ?? '';
    let body: unknown = text;
    if (text.length > 0) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    const record: RawRequestRecord = {
      path: displayPath(config.path ?? config.url ?? ''),
      method: config.method ?? 'GET',
      ...(config.body !== undefined ? { requestBody: parseRequestBody(config) } : {}),
      status: response.status,
      contentType,
      body,
      ...(options.purpose ? { purpose: options.purpose } : {}),
    };
    this.requests.push(record);

    const reason = describeResponseFailure(response, text, config);
    if (reason) record.failure = reason;
    const failure = reason ? new MyChartResponseError(record, reason, excerptOf(text)) : null;
    if (failure && !options.tolerateFailure) throw failure;
    return { response, body, text, failure };
  }

  /**
   * Fetch an activity page and return its antiforgery token. Throws when the
   * page has none — the API behind it would refuse every call anyway.
   */
  async pageToken(pagePath: string): Promise<string> {
    const page = await this.send({ path: pagePath }, { purpose: 'token' });
    return requireVerificationToken(page.text, pagePath);
  }

  /** POST a JSON body with the antiforgery token, the way the React `/api/*` routes expect. */
  async postJson(path: string, token: string, body: unknown = {}, options: SendOptions = {}): Promise<unknown> {
    const result = await this.send(
      {
        path,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', __RequestVerificationToken: token },
        body: JSON.stringify(body),
      },
      options,
    );
    return result.body;
  }

  /** The envelope so far. */
  toRaw(): RawResponse {
    return { requests: this.requests };
  }
}

/**
 * What `raw` mode returns: the one payload body when the scraper made one
 * payload request (token-page fetches do not count), the whole envelope when
 * it made several. A CLI user asking for the raw medications payload wants
 * MyChart's JSON, not a wrapper around it and the page that carried the token.
 */
export function unwrapRaw(raw: RawResponse): unknown {
  const payloads = raw.requests.filter((r) => r.purpose !== 'token');
  return payloads.length === 1 ? payloads[0]!.body : raw;
}

/**
 * Whether a recorded request is the endpoint `name` names: its path (query
 * string aside, case aside) is `name`, or ends with `/name`. Whole segments
 * only — `Load` never matches `LoadExternal`, `GetFlowsheets` never matches
 * `GetFlowsheetReadings`. A substring match here once returned the outside
 * providers as the whole care team whenever `LoadExternal` answered first,
 * because parallel requests land in the envelope in whatever order they
 * resolved.
 */
export function isRequestFor(record: RawRequestRecord, name: string): boolean {
  const pathname = record.path.split('?')[0]!.toLowerCase();
  const needle = name.toLowerCase().replace(/^\/+/, '');
  return pathname === `/${needle}` || pathname === needle || pathname.endsWith(`/${needle}`);
}

/** The first recorded request for the endpoint `name` (a path, or its trailing segments). */
export function findRequest(raw: RawResponse, name: string): RawRequestRecord | undefined {
  return raw.requests.find((r) => isRequestFor(r, name));
}

/** Every recorded request for the endpoint `name`. */
export function findRequests(raw: RawResponse, name: string): RawRequestRecord[] {
  return raw.requests.filter((r) => isRequestFor(r, name));
}

/** The body of the first request for the endpoint `name`, or undefined. */
export function bodyOf(raw: RawResponse, name: string): unknown {
  return findRequest(raw, name)?.body;
}

/** Whether a recorded request came back as the data: recorded, no `failure`, 2xx. */
export function answered(record: RawRequestRecord | undefined): record is RawRequestRecord {
  return record !== undefined && record.failure === undefined && record.status >= 200 && record.status < 300;
}

/**
 * The body of the first request for `name` when it answered, otherwise
 * `undefined` — for a processor reading a request its scraper tolerated
 * (`tolerateFailure`). Reading `bodyOf` there would turn a recorded 500 into
 * `{}` and then into empty fields; this returns nothing, and the processor
 * reports the gap under a name (`contactInformationUnavailable`,
 * `unavailable: ['GetStatementList']`) instead of as empty data.
 */
export function okBodyOf(raw: RawResponse, name: string): unknown {
  const record = findRequest(raw, name);
  return answered(record) ? record.body : undefined;
}
