/**
 * Plumbing for MyChart's anonymous surface.
 *
 * The pre-login pages behave like the post-login ones in one way that matters:
 * every JSON endpoint behind them is a POST that requires the antiforgery
 * token from the page that hosts it, sent back as a header of the same name,
 * on the session cookie that page set. So "call an anonymous endpoint" is
 * always "open its page first". This module does that once per page and hands
 * the token around.
 *
 * These are raw `makeRequest` calls on purpose. `makeAuthenticatedRequest`
 * exists to notice an expired login and re-login; there is no login here to
 * expire, and its login-page detector would misread every one of these pages
 * (they *are* the login shell, with a different activity in the middle).
 *
 * ## The two error surfaces
 *
 * A rejected call — wrong payload, missing token, a feature the org switched
 * off — never comes back as a JSON error. The November 2025 release answers
 * 302 → `/Home/FiveHundred` → `/Home/Error?code=14` → a 200 HTML error page;
 * August 2025 answers a bare 500 HTML page. `postForm` refuses to follow the
 * redirect and treats anything that is not a 200 JSON body as the same
 * failure, so a caller sees one `PreloginEndpointError` on either release
 * instead of `SyntaxError: Unexpected token '<'`.
 */

import type { MyChartRequest } from '../core/myChartRequest';
import { getRequestVerificationTokenFromBody } from '../core/util';

const TOKEN_HEADER = '__RequestVerificationToken';

export class PreloginEndpointError extends Error {
  constructor(
    message: string,
    readonly path: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'PreloginEndpointError';
  }
}

/** A pre-login page and the antiforgery token it issued. */
export type PreloginPage = {
  html: string;
  token: string | null;
  /** Where the request ended up after redirects, relative to the mount. */
  finalUrl: string;
};

/**
 * Open a pre-login page under the discovered mount.
 *
 * Redirects are followed: `/GuestEstimates` bounces to its first step, and a
 * feature the org has switched off bounces to the login page — the caller
 * tells those apart by looking at what came back, not by the status.
 */
export async function openPreloginPage(request: MyChartRequest, path: string): Promise<PreloginPage> {
  const response = await request.makeRequest({ path });
  const html = await response.text();
  if (response.status >= 400) {
    throw new PreloginEndpointError(`GET ${path} answered ${response.status}`, path, response.status);
  }
  return {
    html,
    token: getRequestVerificationTokenFromBody(html) ?? null,
    finalUrl: response.url || path,
  };
}

/**
 * Encode a payload the way MyChart's own page JS does (`$$WPUtil.postify`).
 *
 * Nested objects are `outer.inner=value`; brackets are for array indices only,
 * so a list of objects is `list[0].Field=value`. This is not jQuery's
 * `outer[inner]` convention, and the difference is not cosmetic: the ASP.NET
 * model binder behind the scheduling endpoints rejects the bracket form with a
 * 500 (November 2025 release) or a 302 to the error page (August 2025).
 *
 * Confirmed by replaying one captured `GetSlots` body against a live instance
 * in both encodings — byte-for-byte identical except the separators, 200 for
 * dots and 500 for brackets. Some endpoints bind either form, which is why the
 * bracket version worked on the first instance it was tried against.
 */
export function encodeForm(data: Record<string, unknown>): string {
  const params = new URLSearchParams();
  const add = (key: string, value: unknown) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((v, i) => add(`${key}[${i}]`, v));
    } else if (typeof value === 'object') {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) add(`${key}.${k}`, v);
    } else {
      // Primitives only by now; JSON.stringify renders numbers and booleans
      // the way jQuery's serializer does ("1", "true").
      params.append(key, typeof value === 'string' ? value : JSON.stringify(value));
    }
  };
  for (const [k, v] of Object.entries(data)) add(k, v);
  return params.toString();
}

/**
 * POST a form-encoded payload to an anonymous endpoint and parse the JSON it
 * returns. Throws {@link PreloginEndpointError} on either release's error
 * surface rather than handing back an HTML error page as data.
 */
export async function postForm<T>(
  request: MyChartRequest,
  path: string,
  token: string | null,
  data: Record<string, unknown>,
  referer: string,
): Promise<T> {
  if (!token) {
    throw new PreloginEndpointError(`no antiforgery token to call ${path} with`, path, 0);
  }
  const origin = `${request.protocol}://${request.hostname}`;
  const response = await request.makeRequest({
    method: 'POST',
    path,
    body: encodeForm(data),
    followRedirects: false,
    headers: {
      [TOKEN_HEADER]: token,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      Origin: origin,
      Referer: `${origin}${request.firstPathPart ? '/' + request.firstPathPart : ''}${referer}`,
    },
  });

  const contentType = response.headers.get('content-type') ?? '';
  if (response.status !== 200 || !contentType.includes('json')) {
    throw new PreloginEndpointError(
      `POST ${path} was refused (${response.status}${contentType ? ', ' + contentType.split(';')[0] : ''}) — ` +
        'the payload was not what this release expects, or the feature is switched off on this instance',
      path,
      response.status,
    );
  }
  return (await response.json()) as T;
}
