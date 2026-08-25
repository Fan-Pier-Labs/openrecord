/**
 * A MyChartRequest whose network layer is a small path-keyed router.
 *
 * The mock is installed at `transport`, not at `makeRequest`, so every test
 * still exercises the real URL building (mount prefix, protocol), the real
 * default headers, the real cookie jar and the real per-host concurrency
 * limiter — all of which sit above the transport. Only the socket is fake.
 *
 * Routes are keyed by a path suffix — `'/api/passkey-management/CreatePasskey'`
 * matches `https://host/MyChart/api/passkey-management/CreatePasskey`. A `'*'`
 * key catches anything unrouted; without one, unrouted paths 404 so a test that
 * accidentally depends on an un-stubbed endpoint fails loudly.
 */

import { MyChartRequest } from '../../core/myChartRequest'

export interface RecordedCall {
  /** Full URL the scraper built. */
  url: string
  /** Just the pathname, for convenient assertions. */
  path: string
  method: string
  headers: Record<string, string>
  /** Undefined for a bodyless request — the recorder mirrors what fetch was handed. */
  body?: string | undefined
  /** Parse the request body as JSON. Throws if it isn't JSON. */
  json: <T = Record<string, unknown>>() => T
}

export type RouteHandler = (call: RecordedCall) => Response | Promise<Response>

/** Build a JSON response the way MyChart's API endpoints do. */
export function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Build an HTML response. */
export function htmlResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'text/html' } })
}

/** An HTML page carrying a hidden __RequestVerificationToken input. */
export function pageWithCsrfToken(token: string): string {
  return `<html><body><form>
    <input type="hidden" name="__RequestVerificationToken" value="${token}" />
  </form></body></html>`
}

export interface MockRequestHandle {
  req: MyChartRequest
  calls: RecordedCall[]
  /** Every call whose path ends with the given suffix. */
  callsTo: (pathSuffix: string) => RecordedCall[]
  /** The single call to the given path suffix. Throws unless there is exactly one. */
  callTo: (pathSuffix: string) => RecordedCall
}

export function createMockRequest(
  routes: Record<string, RouteHandler>,
  { hostname = 'mychart.example.org', firstPathPart = 'MyChart' } = {},
): MockRequestHandle {
  const req = new MyChartRequest(hostname)
  req.firstPathPart = firstPathPart

  const calls: RecordedCall[] = []

  req.transport = (async (url: string, init: RequestInit) => {
    const href = String(url)
    const path = new URL(href).pathname
    const body = typeof init?.body === 'string' ? init.body : undefined
    const call: RecordedCall = {
      url: href,
      path,
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body,
      json<T = Record<string, unknown>>(): T {
        if (body === undefined) throw new Error(`No request body for ${path}`)
        return JSON.parse(body) as T
      },
    }
    calls.push(call)

    const key = Object.keys(routes).find(k => k !== '*' && path.endsWith(k))
    const handler = key ? routes[key] : routes['*']
    if (!handler) {
      return new Response(`No mock route for ${path}`, { status: 404 })
    }
    return handler(call)
  })

  return {
    req,
    calls,
    callsTo: (pathSuffix: string) => calls.filter(c => c.path.endsWith(pathSuffix)),
    callTo: (pathSuffix: string) => {
      const matches = calls.filter(c => c.path.endsWith(pathSuffix))
      if (matches.length !== 1) {
        throw new Error(`Expected exactly 1 call to ${pathSuffix}, got ${matches.length}`)
      }
      return matches[0]!
    },
  }
}
