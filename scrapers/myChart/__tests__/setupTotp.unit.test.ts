/**
 * Unit tests for setupTotp / disableTotp.
 *
 * These cover the branches fake-mychart can't reach: it only ever serves one
 * CSRF-token format and one TotpQrCode field name, while the scraper exists
 * precisely because real instances differ on both. The end-to-end happy path
 * is covered separately by
 * `scrapers/myChart/__tests__/fake-mychart/credential-setup.test.ts` and
 * `tests/integration/ci/cli-passkey.integration.test.ts`.
 */

import { describe, it, expect, beforeEach, afterAll } from 'bun:test'
import { setupTotp, disableTotp } from '../setupTotp'
import { generateTotpCode } from '../totp'
import { setLogSink, resetLogSink } from '../../../shared/logger'
import {
  createMockRequest,
  jsonResponse,
  htmlResponse,
  pageWithCsrfToken,
  type RouteHandler,
} from './mockMyChartRequest'

const CSRF = 'csrf-token-for-tests'
const PASSWORD = 'donuts123'
const SECRET = 'JBSWY3DPEHPK3PXP'

// Log output from the module under test, captured so tests can assert on what
// it does and doesn't emit. Reset before each test.
let logged: string[] = []

beforeEach(() => {
  logged = []
  setLogSink((_level, args) => {
    logged.push(args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '))
  })
})

afterAll(resetLogSink)

/**
 * Is `code` a valid TOTP for `secret` right now?
 *
 * Accepts the neighbouring steps as well as the current one: a test that
 * straddles a 30-second boundary between the scraper generating the code and
 * this check running would otherwise fail for no reason.
 */
async function isValidTotp(secret: string, code: string): Promise<boolean> {
  const now = Date.now()
  for (const offset of [-30_000, 0, 30_000]) {
    if ((await generateTotpCode(secret, now + offset)) === code) return true
  }
  return false
}

/** The five endpoints of a successful setup, all responding happily. */
function happyRoutes(overrides: Record<string, RouteHandler> = {}): Record<string, RouteHandler> {
  return {
    '/Home/CSRFToken': () => jsonResponse({ Token: CSRF }),
    '/api/secondary-validation/GetTwoFactorInfo': () => jsonResponse({ IsTotpEnabled: false }),
    '/api/secondary-validation/VerifyPasswordAndUpdateContact': () =>
      jsonResponse({ IsPasswordValid: true }),
    '/api/secondary-validation/TotpQrCode': () => jsonResponse({ encodedSecretKey: SECRET }),
    '/api/secondary-validation/VerifyCode': () => jsonResponse({ Success: true }),
    '/api/secondary-validation/UpdateTwoFactorTotpOptInStatus': () => jsonResponse({ Success: true }),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// CSRF token resolution
// ---------------------------------------------------------------------------

describe('setupTotp — CSRF token resolution', () => {
  // Each shape below was observed on a real instance; the scraper has a branch
  // per shape and none of them are reachable through fake-mychart.
  const shapes: Array<[string, () => Response]> = [
    ['JSON { Token }', () => jsonResponse({ Token: CSRF })],
    ['JSON { token }', () => jsonResponse({ token: CSRF })],
    ['JSON { RequestVerificationToken }', () => jsonResponse({ RequestVerificationToken: CSRF })],
    ['JSON { requestVerificationToken }', () => jsonResponse({ requestVerificationToken: CSRF })],
    ['bare string body', () => new Response(CSRF, { status: 200 })],
    ['HTML hidden input', () => htmlResponse(pageWithCsrfToken(CSRF))],
  ]

  for (const [label, handler] of shapes) {
    it(`accepts a token delivered as ${label}`, async () => {
      const { req, callTo } = createMockRequest(happyRoutes({ '/Home/CSRFToken': handler }))
      const result = await setupTotp(req, PASSWORD)

      expect(result.error).toBeUndefined()
      expect(result.secret).toBe(SECRET)
      // Whatever shape it arrived in, it must go back out as a header.
      expect(callTo('/api/secondary-validation/GetTwoFactorInfo').headers['__RequestVerificationToken'])
        .toBe(CSRF)
    })
  }

  it('falls back to the /Home page when the token endpoint returns an empty body', async () => {
    // Denver Health serves an empty 200 here.
    const { req, callsTo, callTo } = createMockRequest(
      happyRoutes({
        '/Home/CSRFToken': () => new Response('', { status: 200 }),
        '/Home': () => htmlResponse(pageWithCsrfToken(CSRF)),
      }),
    )

    const result = await setupTotp(req, PASSWORD)

    expect(result.secret).toBe(SECRET)
    expect(callsTo('/Home').length).toBe(1)
    expect(callTo('/api/secondary-validation/GetTwoFactorInfo').headers['__RequestVerificationToken'])
      .toBe(CSRF)
  })

  it('fails when neither the token endpoint nor /Home yields a token', async () => {
    const { req, calls } = createMockRequest(
      happyRoutes({
        '/Home/CSRFToken': () => new Response('', { status: 200 }),
        '/Home': () => htmlResponse('<html><body>no token here</body></html>'),
      }),
    )

    const result = await setupTotp(req, PASSWORD)

    expect(result.secret).toBeNull()
    expect(result.error).toContain('Could not get CSRF token')
    // No 2FA endpoint should have been touched without a token.
    expect(calls.some(c => c.path.includes('secondary-validation'))).toBe(false)
  })

  it('fails without falling back when the session has bounced to Terms & Conditions', async () => {
    // A T&C page contains no usable token, and /Home would just bounce again.
    const { req, callsTo } = createMockRequest(
      happyRoutes({
        '/Home/CSRFToken': () => htmlResponse('<html><body><h1>Terms and Conditions</h1></body></html>'),
      }),
    )

    const result = await setupTotp(req, PASSWORD)

    expect(result.secret).toBeNull()
    expect(result.error).toContain('Could not get CSRF token')
    expect(callsTo('/Home').length).toBe(0)
  })

  it('sends a cache-busting query so a proxy cannot serve a stale token', async () => {
    const { req, callTo } = createMockRequest(happyRoutes())
    await setupTotp(req, PASSWORD)
    expect(callTo('/Home/CSRFToken').url).toContain('noCache=')
  })
})

// ---------------------------------------------------------------------------
// setupTotp — happy path
// ---------------------------------------------------------------------------

describe('setupTotp — successful setup', () => {
  it('returns the secret and walks the five endpoints in order', async () => {
    const { req, calls } = createMockRequest(happyRoutes())

    const result = await setupTotp(req, PASSWORD)

    expect(result).toEqual({ secret: SECRET })
    expect(calls.map(c => c.path)).toEqual([
      '/MyChart/Home/CSRFToken',
      '/MyChart/api/secondary-validation/GetTwoFactorInfo',
      '/MyChart/api/secondary-validation/VerifyPasswordAndUpdateContact',
      '/MyChart/api/secondary-validation/TotpQrCode',
      '/MyChart/api/secondary-validation/VerifyCode',
      '/MyChart/api/secondary-validation/UpdateTwoFactorTotpOptInStatus',
    ])
  })

  it('submits a code that actually validates against the returned secret', async () => {
    // The whole point of the VerifyCode step: prove the client derived a real
    // code from the secret the server just issued.
    const { req, callTo } = createMockRequest(happyRoutes())

    await setupTotp(req, PASSWORD)

    const code = callTo('/api/secondary-validation/VerifyCode').json<{ Code: string }>().Code
    expect(code).toMatch(/^\d{6}$/)
    expect(await isValidTotp(SECRET, code)).toBe(true)
  })

  it('POSTs the password under the field name MyChart expects', async () => {
    const { req, callTo } = createMockRequest(happyRoutes())
    await setupTotp(req, PASSWORD)
    expect(callTo('/api/secondary-validation/VerifyPasswordAndUpdateContact').json<{ Password: string }>())
      .toEqual({ Password: PASSWORD })
  })

  it('sends the CSRF header and a JSON content type on every API call', async () => {
    const { req, calls } = createMockRequest(happyRoutes())
    await setupTotp(req, PASSWORD)

    const apiCalls = calls.filter(c => c.path.includes('secondary-validation'))
    expect(apiCalls.length).toBe(5)
    for (const call of apiCalls) {
      expect(call.method).toBe('POST')
      expect(call.headers['__RequestVerificationToken']).toBe(CSRF)
      expect(call.headers['Content-Type']).toBe('application/json')
    }
  })

  // Instances disagree on what the secret field is called. Each name below has
  // its own `||` arm in the scraper, so each needs its own case.
  const secretFields = [
    'encodedSecretKey',
    'EncodedSecretKey',
    'SecretKey',
    'secretKey',
    'Secret',
    'secret',
    'ManualEntryKey',
    'manualEntryKey',
  ]

  for (const field of secretFields) {
    it(`extracts the secret from a "${field}" field`, async () => {
      const { req } = createMockRequest(
        happyRoutes({ '/api/secondary-validation/TotpQrCode': () => jsonResponse({ [field]: SECRET }) }),
      )
      const result = await setupTotp(req, PASSWORD)
      expect(result.secret).toBe(SECRET)
    })
  }
})

// ---------------------------------------------------------------------------
// setupTotp — failure paths
// ---------------------------------------------------------------------------

describe('setupTotp — failure paths', () => {
  it('reports a 500 from GetTwoFactorInfo as "instance does not support it"', async () => {
    // Instances with the authenticator-app feature switched off 500 here
    // rather than answering; that is not a session problem and the message
    // must not tell the user to log in again.
    const { req } = createMockRequest(
      happyRoutes({ '/api/secondary-validation/GetTwoFactorInfo': () => jsonResponse({}, 500) }),
    )

    const result = await setupTotp(req, PASSWORD)

    expect(result.secret).toBeNull()
    expect(result.error).toContain('does not support authenticator app setup')
    expect(result.error).not.toContain('session may have expired')
  })

  it('reports any other GetTwoFactorInfo error as a possible expired session', async () => {
    const { req } = createMockRequest(
      happyRoutes({ '/api/secondary-validation/GetTwoFactorInfo': () => jsonResponse({}, 403) }),
    )

    const result = await setupTotp(req, PASSWORD)

    expect(result.error).toContain('HTTP 403')
    expect(result.error).toContain('session may have expired')
  })

  for (const field of ['IsTotpEnabled', 'isTotpEnabled']) {
    it(`stops before touching the password when ${field} is already true`, async () => {
      const { req, callsTo } = createMockRequest(
        happyRoutes({
          '/api/secondary-validation/GetTwoFactorInfo': () => jsonResponse({ [field]: true }),
        }),
      )

      const result = await setupTotp(req, PASSWORD)

      expect(result.secret).toBeNull()
      expect(result.error).toContain('already enabled')
      // Re-running setup on an enabled account would silently issue a second
      // secret; the guard has to fire before the password is sent anywhere.
      expect(callsTo('/api/secondary-validation/VerifyPasswordAndUpdateContact').length).toBe(0)
    })
  }

  it('fails when password verification returns a non-200', async () => {
    const { req, callsTo } = createMockRequest(
      happyRoutes({
        '/api/secondary-validation/VerifyPasswordAndUpdateContact': () => jsonResponse({}, 401),
      }),
    )

    const result = await setupTotp(req, PASSWORD)

    expect(result.secret).toBeNull()
    expect(result.error).toContain('Password verification failed')
    expect(result.error).toContain('HTTP 401')
    expect(callsTo('/api/secondary-validation/TotpQrCode').length).toBe(0)
  })

  for (const field of ['IsPasswordValid', 'isPasswordValid']) {
    it(`fails when the server answers 200 with ${field}: false`, async () => {
      const { req, callsTo } = createMockRequest(
        happyRoutes({
          '/api/secondary-validation/VerifyPasswordAndUpdateContact': () =>
            jsonResponse({ [field]: false }),
        }),
      )

      const result = await setupTotp(req, PASSWORD)

      expect(result.secret).toBeNull()
      expect(result.error).toContain('saved password may be incorrect')
      expect(callsTo('/api/secondary-validation/TotpQrCode').length).toBe(0)
    })
  }

  it('fails when the QR-code endpoint errors', async () => {
    const { req } = createMockRequest(
      happyRoutes({ '/api/secondary-validation/TotpQrCode': () => jsonResponse({}, 500) }),
    )

    const result = await setupTotp(req, PASSWORD)

    expect(result.secret).toBeNull()
    expect(result.error).toContain('Failed to get TOTP QR code')
  })

  it('fails when the QR-code response carries no recognizable secret field', async () => {
    const { req, callsTo } = createMockRequest(
      happyRoutes({
        '/api/secondary-validation/TotpQrCode': () => jsonResponse({ qrCodeImage: 'data:image/png;base64,...' }),
      }),
    )

    const result = await setupTotp(req, PASSWORD)

    expect(result.secret).toBeNull()
    expect(result.error).toContain('Could not extract TOTP secret')
    expect(callsTo('/api/secondary-validation/VerifyCode').length).toBe(0)
  })

  it('fails when the generated code is rejected', async () => {
    const { req, callsTo } = createMockRequest(
      happyRoutes({ '/api/secondary-validation/VerifyCode': () => jsonResponse({ Success: false }, 400) }),
    )

    const result = await setupTotp(req, PASSWORD)

    expect(result.secret).toBeNull()
    expect(result.error).toContain('TOTP code verification failed')
    // Never opt in on the back of a rejected code.
    expect(callsTo('/api/secondary-validation/UpdateTwoFactorTotpOptInStatus').length).toBe(0)
  })

  it('fails — rather than returning a secret 2FA never accepted — when opt-in errors', async () => {
    // Returning the secret here would leave the caller storing a secret the
    // account will not actually accept at login.
    const { req } = createMockRequest(
      happyRoutes({
        '/api/secondary-validation/UpdateTwoFactorTotpOptInStatus': () => jsonResponse({}, 500),
      }),
    )

    const result = await setupTotp(req, PASSWORD)

    expect(result.secret).toBeNull()
    expect(result.error).toContain('Failed to finalize TOTP opt-in')
  })
})

// ---------------------------------------------------------------------------
// Secret handling in logs
// ---------------------------------------------------------------------------

describe('setupTotp — what reaches the log sink', () => {
  it('never logs the TOTP secret or the password', async () => {
    const { req } = createMockRequest(happyRoutes())

    const result = await setupTotp(req, PASSWORD)
    expect(result.secret).toBe(SECRET)

    const output = logged.join('\n')
    expect(output).not.toContain(SECRET)
    expect(output).not.toContain(PASSWORD)
    // It may report the length — that's the diagnostic it keeps instead.
    expect(output).toContain(String(SECRET.length))
  })

  it('never logs the secret on the failure paths either', async () => {
    // The error branches dump response bodies wholesale, so a server that
    // echoes the secret back in an error must not end up in the log.
    const { req } = createMockRequest(
      happyRoutes({
        '/api/secondary-validation/TotpQrCode': () => jsonResponse({ encodedSecretKey: SECRET }),
        '/api/secondary-validation/VerifyCode': () => jsonResponse({ Success: false }, 400),
      }),
    )

    await setupTotp(req, PASSWORD)

    expect(logged.join('\n')).not.toContain(SECRET)
  })
})

// ---------------------------------------------------------------------------
// disableTotp
// ---------------------------------------------------------------------------

describe('disableTotp', () => {
  function disableRoutes(overrides: Record<string, RouteHandler> = {}): Record<string, RouteHandler> {
    return {
      '/Home/CSRFToken': () => jsonResponse({ Token: CSRF }),
      '/api/secondary-validation/VerifyPasswordAndUpdateContact': () =>
        jsonResponse({ IsPasswordValid: true }),
      '/api/secondary-validation/VerifyCode': () => jsonResponse({ Success: true }),
      '/api/secondary-validation/UpdateTwoFactorTotpOptInStatus': () => jsonResponse({ Success: true }),
      ...overrides,
    }
  }

  it('verifies password, proves possession of the secret, then opts out', async () => {
    const { req, calls, callTo } = createMockRequest(disableRoutes())

    expect(await disableTotp(req, PASSWORD, SECRET)).toBe(true)

    expect(calls.map(c => c.path)).toEqual([
      '/MyChart/Home/CSRFToken',
      '/MyChart/api/secondary-validation/VerifyPasswordAndUpdateContact',
      '/MyChart/api/secondary-validation/VerifyCode',
      '/MyChart/api/secondary-validation/UpdateTwoFactorTotpOptInStatus',
    ])

    const code = callTo('/api/secondary-validation/VerifyCode').json<{ Code: string }>().Code
    expect(await isValidTotp(SECRET, code)).toBe(true)
  })

  it('returns false without touching 2FA when there is no CSRF token', async () => {
    const { req, calls } = createMockRequest(
      disableRoutes({
        '/Home/CSRFToken': () => new Response('', { status: 200 }),
        '/Home': () => htmlResponse('<html><body>nothing</body></html>'),
      }),
    )

    expect(await disableTotp(req, PASSWORD, SECRET)).toBe(false)
    expect(calls.some(c => c.path.includes('secondary-validation'))).toBe(false)
  })

  it('returns false and leaves TOTP enabled when the password is wrong', async () => {
    const { req, callsTo } = createMockRequest(
      disableRoutes({
        '/api/secondary-validation/VerifyPasswordAndUpdateContact': () =>
          jsonResponse({ IsPasswordValid: false }),
      }),
    )

    expect(await disableTotp(req, PASSWORD, SECRET)).toBe(false)
    expect(callsTo('/api/secondary-validation/UpdateTwoFactorTotpOptInStatus').length).toBe(0)
  })

  it('returns false and does not opt out when the code is rejected', async () => {
    const { req, callsTo } = createMockRequest(
      disableRoutes({ '/api/secondary-validation/VerifyCode': () => jsonResponse({ Success: false }, 400) }),
    )

    expect(await disableTotp(req, PASSWORD, SECRET)).toBe(false)
    expect(callsTo('/api/secondary-validation/UpdateTwoFactorTotpOptInStatus').length).toBe(0)
  })

  it('never logs the secret or the password', async () => {
    const { req } = createMockRequest(disableRoutes())
    await disableTotp(req, PASSWORD, SECRET)

    const output = logged.join('\n')
    expect(output).not.toContain(SECRET)
    expect(output).not.toContain(PASSWORD)
  })
})
