import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test'
import { setLogSink, resetLogSink } from '../../../shared/logger'
import { MyChartRequest } from '../myChartRequest'
import { setupTotp, disableTotp } from '../setupTotp'
import { setupPasskey } from '../setupPasskey'
import { myChartUserPassLogin } from '../login'
import { getRequestVerificationTokenFromBody } from '../util'
import { acceptTermsAndConditions } from '../termsAndConditions'

/**
 * The scraper's debug stream is the only diagnostic available on an instance
 * nobody here can reach, so it is verbose — and the endpoints it narrates hand
 * back real credentials. These tests drive the auth flows with scripted
 * responses carrying known secrets and assert that no secret reaches the log
 * sink, whichever branch the flow takes.
 *
 * They are deliberately end-to-end over the real functions: the failure mode
 * being guarded against is a new `logger.debug(body)` or `logger.debug(token)`
 * added to one of these files, which only a test that watches the sink catches.
 */

const HOST = 'mychart.example.com'
const TOTP_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'
const CSRF_TOKEN = 'CfDJ8SecretCsrfTokenValue-abcdefghijklmnop1234567890'
const PASSWORD = 'sup3r-s3cret-passw0rd'
const SESSION_COOKIE = 'EPICSESSION=abcdef0123456789; Path=/; HttpOnly'
const PASSKEY_CHALLENGE = 'ZmFrZS1jaGFsbGVuZ2UtdmFsdWU'

let logged: string[] = []

/** Everything the flow logged, flattened into one searchable string. */
function loggedText(): string {
  return logged.join('\n')
}

function expectNoSecrets(...secrets: string[]): void {
  const text = loggedText()
  for (const secret of secrets) {
    expect(text).not.toContain(secret)
  }
}

beforeAll(() => {
  process.env.MYCHART_CLI_TELEMETRY_DISABLED = '1'
  setLogSink((_level, args) => {
    logged.push(args.map(arg => (typeof arg === 'string' ? arg : safeStringify(arg))).join(' '))
  })
})

afterAll(() => {
  resetLogSink()
})

beforeEach(() => {
  logged = []
})

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

/** A MyChartRequest whose network layer is a scripted route table. */
function mockedRequest(routes: (url: string, init: RequestInit) => Response | null): MyChartRequest {
  const req = new MyChartRequest(HOST)
  req.firstPathPart = 'MyChart'
  req.fetchWithCookieJar = (async (url: string, init: RequestInit = {}) => {
    return routes(url, init) ?? new Response('', { status: 404 })
  }) as typeof req.fetchWithCookieJar
  return req
}

const csrfJson = () => new Response(JSON.stringify({ Token: CSRF_TOKEN }), { status: 200 })

describe('setupTotp never logs the shared secret', () => {
  it('keeps the secret out of the log on the happy path', async () => {
    let submittedCode: string | undefined
    const req = mockedRequest((url, init) => {
      if (url.includes('/Home/CSRFToken')) return csrfJson()
      if (url.includes('GetTwoFactorInfo')) return new Response('{}', { status: 200 })
      if (url.includes('VerifyPasswordAndUpdateContact')) {
        return new Response(JSON.stringify({ IsPasswordValid: true }), { status: 200 })
      }
      if (url.includes('TotpQrCode')) {
        return new Response(
          JSON.stringify({
            encodedSecretKey: TOTP_SECRET,
            QrCodeUrl: `otpauth://totp/MyChart?secret=${TOTP_SECRET}`,
          }),
          { status: 200 },
        )
      }
      if (url.includes('VerifyCode')) {
        submittedCode = JSON.parse(String(init.body)).Code
        return new Response(JSON.stringify({ Success: true }), { status: 200 })
      }
      if (url.includes('UpdateTwoFactorTotpOptInStatus')) return new Response('{}', { status: 200 })
      return null
    })

    const result = await setupTotp(req, PASSWORD)

    // The flow still works and still returns the secret to its caller.
    expect(result.secret).toBe(TOTP_SECRET)
    expect(submittedCode).toMatch(/^\d{6}$/)
    expectNoSecrets(TOTP_SECRET, CSRF_TOKEN, PASSWORD, submittedCode!)
  })

  it('keeps the secret out of the log when no known secret field matches', async () => {
    // The exact branch that used to `JSON.stringify(qrResult)` — reached when
    // an instance names the field something we do not recognize, which is
    // precisely when the payload is most likely to be dumped for debugging.
    const req = mockedRequest((url) => {
      if (url.includes('/Home/CSRFToken')) return csrfJson()
      if (url.includes('GetTwoFactorInfo')) return new Response('{}', { status: 200 })
      if (url.includes('VerifyPasswordAndUpdateContact')) {
        return new Response(JSON.stringify({ IsPasswordValid: true }), { status: 200 })
      }
      if (url.includes('TotpQrCode')) {
        return new Response(JSON.stringify({ SomeNewFieldName: TOTP_SECRET }), { status: 200 })
      }
      return null
    })

    const result = await setupTotp(req, PASSWORD)

    expect(result.secret).toBeNull()
    expect(result.error).toContain('Could not extract TOTP secret')
    // The field name is still logged — that is how a new one gets discovered.
    expect(loggedText()).toContain('SomeNewFieldName')
    expectNoSecrets(TOTP_SECRET, CSRF_TOKEN, PASSWORD)
  })

  it('logs neither the error body nor the Set-Cookie header on a non-200', async () => {
    const req = mockedRequest((url) => {
      if (url.includes('/Home/CSRFToken')) return csrfJson()
      if (url.includes('GetTwoFactorInfo')) {
        return new Response(JSON.stringify({ Error: 'boom', Token: CSRF_TOKEN }), {
          status: 503,
          headers: { 'set-cookie': SESSION_COOKIE, 'content-type': 'application/json' },
        })
      }
      return null
    })

    const result = await setupTotp(req, PASSWORD)

    expect(result.secret).toBeNull()
    // The status still gets logged — that is the diagnostic. The body and the
    // headers do not, because both carry credentials on these endpoints.
    expect(loggedText()).toContain('503')
    expect(loggedText()).not.toContain('boom')
    expectNoSecrets(CSRF_TOKEN, 'EPICSESSION=abcdef0123456789')
  })

  it('does not log the generated TOTP code when disabling', async () => {
    let submittedCode: string | undefined
    const req = mockedRequest((url, init) => {
      if (url.includes('/Home/CSRFToken')) return csrfJson()
      if (url.includes('VerifyPasswordAndUpdateContact')) {
        return new Response(JSON.stringify({ IsPasswordValid: true }), { status: 200 })
      }
      if (url.includes('VerifyCode')) {
        submittedCode = JSON.parse(String(init.body)).Code
        return new Response(JSON.stringify({ Success: true }), { status: 200 })
      }
      if (url.includes('UpdateTwoFactorTotpOptInStatus')) return new Response('{}', { status: 200 })
      return null
    })

    expect(await disableTotp(req, PASSWORD, TOTP_SECRET)).toBe(true)
    expect(submittedCode).toMatch(/^\d{6}$/)
    expectNoSecrets(TOTP_SECRET, PASSWORD, submittedCode!)
  })
})

describe('setupPasskey never logs the WebAuthn challenge', () => {
  it('does not log the failed GenerateCreateRequest payload', async () => {
    const req = mockedRequest((url) => {
      if (url.includes('/Home/CSRFToken')) return csrfJson()
      if (url.includes('GenerateCreateRequest')) {
        return new Response(
          JSON.stringify({ success: false, data: { challenge: PASSKEY_CHALLENGE }, ErrorMessage: 'not enrolled' }),
          { status: 200 },
        )
      }
      return null
    })

    expect(await setupPasskey(req)).toBeNull()
    // Field names are logged so a changed response shape is still diagnosable;
    // the values behind them are not.
    expect(loggedText()).toContain('ErrorMessage')
    expect(loggedText()).not.toContain('not enrolled')
    expectNoSecrets(PASSKEY_CHALLENGE, CSRF_TOKEN)
  })
})

describe('login never logs the request verification token or 2FA codes', () => {
  it('logs neither the CSRF token nor the 2FA page', async () => {
    const tokenInput = `<input type="hidden" name="__RequestVerificationToken" value="${CSRF_TOKEN}" />`
    const twoFaPage = `<html><body>secondaryvalidationcontroller ${tokenInput}
      <div id="emailDelivery">Email to h***@example.com</div></body></html>`

    const fetchFn = async (url: string): Promise<Response> => {
      if (url === `https://${HOST}` || url === `https://${HOST}/`) {
        return new Response('', { status: 302, headers: { Location: '/MyChart/' } })
      }
      if (url.endsWith('/Authentication/Login')) return new Response(tokenInput, { status: 200 })
      if (url.includes('/SecondaryValidation/SendCode')) {
        return new Response(JSON.stringify({ Success: true }), { status: 200 })
      }
      if (url.includes('/SecondaryValidation/GetSMSConsentStrings')) return new Response('{}', { status: 200 })
      if (url.includes('/Authentication/Login/DoLogin')) return new Response(twoFaPage, { status: 200 })
      return new Response('', { status: 404 })
    }

    const result = await myChartUserPassLogin({ hostname: HOST, user: 'homer', pass: PASSWORD, fetchFn })

    expect(result.state).toBe('need_2fa')
    // The page-shape diagnostics that make the dump useful are still there.
    expect(loggedText()).toContain('secondaryvalidationcontroller')
    expectNoSecrets(CSRF_TOKEN, PASSWORD)
  })
})

describe('shared helpers never dump a page wholesale', () => {
  it('does not dump the page when the request verification token is missing', () => {
    const page = `<html><body><input type="hidden" name="SomeOtherToken" value="${CSRF_TOKEN}" />
      <p>Session expired</p></body></html>`

    expect(getRequestVerificationTokenFromBody(page)).toBeUndefined()
    expect(loggedText()).toContain('could not find request verification token')
    expectNoSecrets(CSRF_TOKEN)
  })

  it('does not dump the Terms & Conditions page when no CSRF token is found', async () => {
    const req = mockedRequest(() => new Response(
      `<html><body>Terms and Conditions
        <input type="hidden" name="SomeOtherToken" value="${CSRF_TOKEN}" /></body></html>`,
      { status: 200, headers: { 'set-cookie': SESSION_COOKIE } },
    ))

    expect(await acceptTermsAndConditions(req)).toBe(false)
    expectNoSecrets(CSRF_TOKEN, 'EPICSESSION=abcdef0123456789')
  })
})
