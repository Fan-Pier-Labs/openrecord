/**
 * fetchSessionCsrfToken — the `/Home/CSRFToken` response variants.
 *
 * These shapes are per-instance, so fake-mychart serves exactly one of them and
 * an integration test can never reach the rest. This suite is the only place
 * the full matrix runs. It lives at the core level because three call sites now
 * share the function (TOTP enrollment, passkey enrollment, the eUnity imaging
 * handoff) and each used to carry its own drifting copy.
 */

import { describe, expect, it } from 'bun:test'
import { fetchSessionCsrfToken } from '../csrf'
import {
  createMockRequest,
  htmlResponse,
  jsonResponse,
  pageWithCsrfToken,
} from '../../auth/__tests__/mockMyChartRequest'

const CSRF = 'csrf-token-for-tests'

describe('fetchSessionCsrfToken — response shapes', () => {
  const shapes: Array<[string, () => Response]> = [
    ['JSON { Token }', () => jsonResponse({ Token: CSRF })],
    ['JSON { token }', () => jsonResponse({ token: CSRF })],
    ['JSON { RequestVerificationToken }', () => jsonResponse({ RequestVerificationToken: CSRF })],
    ['JSON { requestVerificationToken }', () => jsonResponse({ requestVerificationToken: CSRF })],
    ['bare string body', () => new Response(CSRF, { status: 200 })],
    ['HTML hidden input', () => htmlResponse(pageWithCsrfToken(CSRF))],
  ]

  for (const [label, handler] of shapes) {
    it(`reads a token delivered as ${label}`, async () => {
      const { req, calls } = createMockRequest({ '/Home/CSRFToken': handler })

      expect(await fetchSessionCsrfToken(req)).toBe(CSRF)
      // The token came straight from the endpoint — no /Home round trip needed.
      expect(calls.map(c => c.path)).toEqual(['/MyChart/Home/CSRFToken'])
    })
  }

  it('sends a cache-busting query so a proxy cannot serve a stale token', async () => {
    const { req, callTo } = createMockRequest({
      '/Home/CSRFToken': () => jsonResponse({ Token: CSRF }),
    })

    await fetchSessionCsrfToken(req)

    expect(callTo('/Home/CSRFToken').url).toContain('noCache=')
  })
})

describe('fetchSessionCsrfToken — the /Home fallback', () => {
  it('falls back to the /Home page when the endpoint returns an empty body', async () => {
    // At least one live instance serves an empty 200 here.
    const { req, calls } = createMockRequest({
      '/Home/CSRFToken': () => new Response('', { status: 200 }),
      '/Home': () => htmlResponse(pageWithCsrfToken(CSRF)),
    })

    expect(await fetchSessionCsrfToken(req)).toBe(CSRF)
    expect(calls.map(c => c.path)).toEqual(['/MyChart/Home/CSRFToken', '/MyChart/Home'])
  })

  it('falls back when the endpoint returns JSON with no recognisable token key', async () => {
    const { req, callsTo } = createMockRequest({
      '/Home/CSRFToken': () => jsonResponse({ error: 'nope' }),
      '/Home': () => htmlResponse(pageWithCsrfToken(CSRF)),
    })

    expect(await fetchSessionCsrfToken(req)).toBe(CSRF)
    expect(callsTo('/Home').length).toBe(1)
  })

  it('returns null when neither the endpoint nor /Home yields a token', async () => {
    const { req } = createMockRequest({
      '/Home/CSRFToken': () => new Response('', { status: 200 }),
      '/Home': () => htmlResponse('<html><body>no token here</body></html>'),
    })

    expect(await fetchSessionCsrfToken(req)).toBeNull()
  })

  it('returns null rather than throwing when the /Home fallback itself fails', async () => {
    const { req } = createMockRequest({
      '/Home/CSRFToken': () => new Response('', { status: 200 }),
      '/Home': () => {
        throw new Error('socket hang up')
      },
    })

    expect(await fetchSessionCsrfToken(req)).toBeNull()
  })
})

describe('fetchSessionCsrfToken — Terms & Conditions', () => {
  // A T&C page carries a __RequestVerificationToken of its own, so parsing it
  // as a normal HTML response would hand back a token that every /api/* POST
  // then rejects. /Home would only bounce to T&C again, so it is skipped.
  const tcPages: Array<[string, string]> = [
    ['a heading', '<html><body><h1>Terms and Conditions</h1></body></html>'],
    ['a route name', '<html><body><a href="/Authentication/TermsConditions">x</a></body></html>'],
  ]

  for (const [label, body] of tcPages) {
    it(`returns null without falling back when the session bounced to T&C (${label})`, async () => {
      const { req, callsTo } = createMockRequest({
        '/Home/CSRFToken': () => htmlResponse(body),
        '/Home': () => htmlResponse(pageWithCsrfToken(CSRF)),
      })

      expect(await fetchSessionCsrfToken(req)).toBeNull()
      expect(callsTo('/Home').length).toBe(0)
    })
  }

  it('detects the T&C bounce even when it arrives carrying a token input', async () => {
    const { req } = createMockRequest({
      '/Home/CSRFToken': () =>
        htmlResponse(
          `<html><body><h1>Terms and Conditions</h1>${pageWithCsrfToken('tc-token')}</body></html>`,
        ),
    })

    expect(await fetchSessionCsrfToken(req)).toBeNull()
  })
})
