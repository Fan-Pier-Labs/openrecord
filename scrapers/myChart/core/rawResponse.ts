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
}

export interface RawResponse {
  requests: RawRequestRecord[];
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
   * plus its body: parsed
   * JSON when the body parses as JSON, otherwise the text. The Response has
   * already been read; use the returned body.
   */
  async send(
    config: RequestConfig,
    options: { purpose?: 'token' } = {},
  ): Promise<{ response: Response; body: unknown; text: string }> {
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
    this.requests.push({
      path: displayPath(config.path ?? config.url ?? ''),
      method: config.method ?? 'GET',
      ...(config.body !== undefined ? { requestBody: parseRequestBody(config) } : {}),
      status: response.status,
      contentType,
      body,
      ...(options.purpose ? { purpose: options.purpose } : {}),
    });
    return { response, body, text };
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
  async postJson(path: string, token: string, body: unknown = {}): Promise<unknown> {
    const result = await this.send({
      path,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', __RequestVerificationToken: token },
      body: JSON.stringify(body),
    });
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

/** The first recorded request whose path contains `fragment` (case-insensitive). */
export function findRequest(raw: RawResponse, fragment: string): RawRequestRecord | undefined {
  const needle = fragment.toLowerCase();
  return raw.requests.find((r) => r.path.toLowerCase().includes(needle));
}

/** Every recorded request whose path contains `fragment` (case-insensitive). */
export function findRequests(raw: RawResponse, fragment: string): RawRequestRecord[] {
  const needle = fragment.toLowerCase();
  return raw.requests.filter((r) => r.path.toLowerCase().includes(needle));
}

/** The body of the first request matching `fragment`, or undefined. */
export function bodyOf(raw: RawResponse, fragment: string): unknown {
  return findRequest(raw, fragment)?.body;
}
