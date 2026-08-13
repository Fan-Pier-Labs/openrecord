import { describe, it, expect, beforeAll, afterAll, afterEach } from 'bun:test'
import { myChartUserPassLogin } from '../login'
import { setTestTransport } from '../../http'

// Drives myChartUserPassLogin end to end against a scripted fake MyChart,
// installed with setTestTransport. Covers the parts of the flow that only
// show up in the request the scraper actually sends: which credential field it
// picks, how it encodes the credentials, and how it classifies the response.

const HOST = 'mychart.example.com'
const TOKEN_INPUT = '<input name="__RequestVerificationToken" value="tok123" />'
const HOME_PAGE = '<html><body>MD_HOME_INDEX</body></html>'

type FakeServer = {
  /** HTML served at /MyChart/Authentication/Login. */
  loginPage?: string
  /** Body served for any URL containing "loginpagecontroller". */
  controllerJs?: string
  /** Response to the DoLogin POST. */
  doLogin?: { body: string; url?: string }
  /** Whether the 2FA SendCode endpoint reports success. Defaults to true. */
  sendCodeSucceeds?: boolean
}

type Call = { url: string; method: string; body?: string }

function fakeMyChart(server: FakeServer) {
  const calls: Call[] = []
  const fetchFn = async (url: string, init: RequestInit): Promise<Response> => {
    calls.push({
      url,
      method: (init.method ?? 'GET'),
      body: init.body ? String(init.body) : undefined,
    })

    // Root request: redirect to /MyChart/ so firstPathPart resolves.
    if (url === `https://${HOST}` || url === `https://${HOST}/`) {
      return new Response('', { status: 302, headers: { Location: '/MyChart/' } })
    }
    if (url.includes('loginpagecontroller')) {
      return new Response(server.controllerJs ?? '', { status: 200 })
    }
    if (url.endsWith('/Authentication/Login')) {
      return new Response(server.loginPage ?? TOKEN_INPUT, { status: 200 })
    }
    if (url.includes('/SecondaryValidation/SendCode')) {
      const ok = server.sendCodeSucceeds ?? true
      return new Response(JSON.stringify({ Success: ok }), { status: 200 })
    }
    if (url.includes('/SecondaryValidation/GetSMSConsentStrings')) {
      return new Response('{}', { status: 200 })
    }
    if (url.includes('/Authentication/Login/DoLogin')) {
      const res = server.doLogin ?? { body: HOME_PAGE }
      const resp = new Response(res.body, { status: 200 })
      if (res.url) Object.defineProperty(resp, 'url', { value: res.url })
      return resp
    }
    return new Response('', { status: 404 })
  }
  setTestTransport(fetchFn)
  return { calls }
}

/** Pull the decoded Credentials object back out of the posted DoLogin body. */
function postedCredentials(calls: Call[]): Record<string, string> {
  const doLogin = calls.find((c) => c.url.includes('DoLogin'))
  if (!doLogin?.body) throw new Error('no DoLogin request was made')
  const loginInfo = new URLSearchParams(doLogin.body).get('LoginInfo')!
  return JSON.parse(loginInfo).Credentials
}

let previousTelemetrySetting: string | undefined

beforeAll(() => {
  previousTelemetrySetting = process.env.MYCHART_CLI_TELEMETRY_DISABLED
  process.env.MYCHART_CLI_TELEMETRY_DISABLED = '1'
})

afterEach(() => {
  // Process-wide, so it has to come back off between tests.
  setTestTransport(null)
})

afterAll(() => {
  if (previousTelemetrySetting === undefined) delete process.env.MYCHART_CLI_TELEMETRY_DISABLED
  else process.env.MYCHART_CLI_TELEMETRY_DISABLED = previousTelemetrySetting
})

describe('myChartUserPassLogin argument validation', () => {
  it('throws when hostname is missing', async () => {
    await expect(myChartUserPassLogin({ hostname: '', user: 'u', pass: 'p' }))
      .rejects.toThrow('Missing hostname, user, or pass')
  })

  it('throws when user is missing', async () => {
    await expect(myChartUserPassLogin({ hostname: HOST, user: '', pass: 'p' }))
      .rejects.toThrow('Missing hostname, user, or pass')
  })

  it('throws when pass is missing', async () => {
    await expect(myChartUserPassLogin({ hostname: HOST, user: 'u', pass: '' }))
      .rejects.toThrow('Missing hostname, user, or pass')
  })
})

describe('credential field detection', () => {
  it('defaults to LoginIdentifier when the page has no loginpagecontroller script', async () => {
    const { calls } = fakeMyChart({})
    await myChartUserPassLogin({ hostname: HOST, user: 'u', pass: 'p' })

    expect(Object.keys(postedCredentials(calls))).toEqual(['LoginIdentifier', 'Password'])
    expect(calls.some((c) => c.url.includes('loginpagecontroller'))).toBe(false)
  })

  it('switches to Username when the controller JS uses Username only', async () => {
    const { calls } = fakeMyChart({
      loginPage: `${TOKEN_INPUT}<script src="/MyChart/scripts/loginpagecontroller.min.js?v=123"></script>`,
      controllerJs: 'Credentials: { Username: WP.Utils.b64EncodeUnicode(user), Password: WP.Utils.b64EncodeUnicode(pass) }',
    })
    await myChartUserPassLogin({ hostname: HOST, user: 'u', pass: 'p' })

    expect(Object.keys(postedCredentials(calls))).toEqual(['Username', 'Password'])
  })

  it('keeps LoginIdentifier when the controller JS uses LoginIdentifier', async () => {
    const { calls } = fakeMyChart({
      loginPage: `${TOKEN_INPUT}<script src="/MyChart/scripts/loginpagecontroller.min.js"></script>`,
      controllerJs: 'Credentials: { LoginIdentifier: encode(user), Password: encode(pass) }',
    })
    await myChartUserPassLogin({ hostname: HOST, user: 'u', pass: 'p' })

    expect(Object.keys(postedCredentials(calls))).toEqual(['LoginIdentifier', 'Password'])
  })

  it('keeps LoginIdentifier when the controller JS mentions both fields', async () => {
    const { calls } = fakeMyChart({
      loginPage: `${TOKEN_INPUT}<script src="/MyChart/scripts/loginpagecontroller.min.js"></script>`,
      controllerJs: 'Credentials: { LoginIdentifier: encode(user), Username: "deprecated", Password: encode(pass) }',
    })
    await myChartUserPassLogin({ hostname: HOST, user: 'u', pass: 'p' })

    expect(Object.keys(postedCredentials(calls))).toEqual(['LoginIdentifier', 'Password'])
  })

  it('keeps LoginIdentifier when the controller JS has no Credentials block', async () => {
    const { calls } = fakeMyChart({
      loginPage: `${TOKEN_INPUT}<script src="/MyChart/scripts/loginpagecontroller.min.js"></script>`,
      controllerJs: 'function doLogin() { /* minified, no credentials block */ }',
    })
    await myChartUserPassLogin({ hostname: HOST, user: 'u', pass: 'p' })

    expect(Object.keys(postedCredentials(calls))).toEqual(['LoginIdentifier', 'Password'])
  })

  it('resolves a relative controller script against the instance hostname', async () => {
    const { calls } = fakeMyChart({
      loginPage: `${TOKEN_INPUT}<script src="/MyChart/scripts/loginpagecontroller.min.js?v=abc"></script>`,
    })
    await myChartUserPassLogin({ hostname: HOST, user: 'u', pass: 'p' })

    expect(calls.map((c) => c.url)).toContain(`https://${HOST}/MyChart/scripts/loginpagecontroller.min.js?v=abc`)
  })

  it('uses an absolute controller script URL as-is', async () => {
    const { calls } = fakeMyChart({
      loginPage: `${TOKEN_INPUT}<script src="https://cdn.example.com/loginpagecontroller.min.js"></script>`,
    })
    await myChartUserPassLogin({ hostname: HOST, user: 'u', pass: 'p' })

    expect(calls.map((c) => c.url)).toContain('https://cdn.example.com/loginpagecontroller.min.js')
  })
})

describe('credential encoding', () => {
  it('base64-encodes the username and password', async () => {
    const { calls } = fakeMyChart({})
    await myChartUserPassLogin({ hostname: HOST, user: 'testuser', pass: 'testpass123!' })

    const creds = postedCredentials(calls)
    expect(atob(creds.LoginIdentifier)).toBe('testuser')
    expect(atob(creds.Password)).toBe('testpass123!')
  })

  it('posts a StandardLogin payload with the CSRF token', async () => {
    const { calls } = fakeMyChart({})
    await myChartUserPassLogin({ hostname: HOST, user: 'u', pass: 'p' })

    const doLogin = calls.find((c) => c.url.includes('DoLogin'))!
    const params = new URLSearchParams(doLogin.body)
    expect(doLogin.method).toBe('POST')
    expect(params.get('__RequestVerificationToken')).toBe('tok123')
    expect(JSON.parse(params.get('LoginInfo')!).Type).toBe('StandardLogin')
  })

  it('round-trips passwords with special characters', async () => {
    const pass = 'p@$$w0rd!#%^&*()'
    const { calls } = fakeMyChart({})
    await myChartUserPassLogin({ hostname: HOST, user: 'u', pass })

    expect(atob(postedCredentials(calls).Password)).toBe(pass)
  })

  it('encodes unicode credentials that plain btoa cannot handle', async () => {
    // b64EncodeUnicode percent-encodes first, so the decoded bytes are UTF-8.
    const user = 'user@例え.jp'
    const { calls } = fakeMyChart({})
    await myChartUserPassLogin({ hostname: HOST, user, pass: 'p' })

    const encoded = postedCredentials(calls).LoginIdentifier
    expect(() => btoa(user)).toThrow()
    // UTF-8-aware base64 decode (the deprecated escape/atob trick, minus escape).
    expect(Buffer.from(encoded, 'base64').toString('utf8')).toBe(user)
  })
})

describe('login response classification', () => {
  it('reports logged_in when the response is the MyChart home page', async () => {
    fakeMyChart({ doLogin: { body: HOME_PAGE } })
    const result = await myChartUserPassLogin({ hostname: HOST, user: 'u', pass: 'p' })
    expect(result.state).toBe('logged_in')
  })

  it('reports invalid_login on a "Login Failed" page', async () => {
    fakeMyChart({
      doLogin: { body: '<html><body>Login Failed: Invalid username or password</body></html>' },
    })
    const result = await myChartUserPassLogin({ hostname: HOST, user: 'u', pass: 'p' })
    expect(result.state).toBe('invalid_login')
    expect(result.error).toBe('Username or password is incorrect')
  })

  it('reports invalid_login on a "login unsuccessful" page', async () => {
    fakeMyChart({
      doLogin: { body: '<html><body>Your login unsuccessful. Please try again.</body></html>' },
    })
    const result = await myChartUserPassLogin({ hostname: HOST, user: 'u', pass: 'p' })
    expect(result.state).toBe('invalid_login')
  })

  it('reports invalid_login when only the response URL signals failure', async () => {
    fakeMyChart({
      doLogin: { body: '<html><body>Try again</body></html>', url: `https://${HOST}/MyChart/Authentication/LoginFailed` },
    })
    const result = await myChartUserPassLogin({ hostname: HOST, user: 'u', pass: 'p' })
    expect(result.state).toBe('invalid_login')
  })

  it('does not false-positive on an ordinary logged-in page', async () => {
    fakeMyChart({
      doLogin: { body: '<html><body>MD_HOME_INDEX<p>Secondary information about your account</p></body></html>' },
    })
    const result = await myChartUserPassLogin({ hostname: HOST, user: 'u', pass: 'p' })
    expect(result.state).toBe('logged_in')
  })

  it('reports an error when the login lands on an unrecognized page', async () => {
    fakeMyChart({ doLogin: { body: '<html><body>Something else entirely</body></html>' } })
    const result = await myChartUserPassLogin({ hostname: HOST, user: 'u', pass: 'p' })
    expect(result.state).toBe('error')
    expect(result.error).toBe('Login failed: ended up on an unexpected page')
  })

  it('requests 2FA when the response is the secondary validation page', async () => {
    const { calls } = fakeMyChart({
      doLogin: {
        body: `<html><body><div data-controller="secondaryvalidationcontroller">
          <input name="__RequestVerificationToken" value="2fa_token_123" />
          <button>Email to me</button>
        </div></body></html>`,
      },
    })
    const result = await myChartUserPassLogin({ hostname: HOST, user: 'u', pass: 'p' })
    expect(result.state).toBe('need_2fa')
    expect(result.twoFaDelivery?.method).toBe('email')

    // The page offers email only, so the scraper must ask for the email delivery method.
    const sendCode = calls.find((c) => c.url.includes('SendCode'))!
    expect(sendCode.body).toContain('deliveryMethodEmail=true')
  })

  it('falls back to SMS delivery when the 2FA page only offers a text message', async () => {
    fakeMyChart({
      doLogin: {
        body: `<html><body><div data-controller="secondaryvalidationcontroller">
          <input name="__RequestVerificationToken" value="2fa_token_123" />
          <button>Text to my phone</button>
          <p>We've sent a security code to ***-***-7204.</p>
        </div></body></html>`,
      },
    })
    const result = await myChartUserPassLogin({ hostname: HOST, user: 'u', pass: 'p' })
    expect(result.state).toBe('need_2fa')
    expect(result.twoFaDelivery?.method).toBe('sms')
    expect(result.twoFaDelivery?.contact).toBe('***-***-7204')
  })

  it('errors when the 2FA page has no CSRF token to continue with', async () => {
    fakeMyChart({
      doLogin: { body: '<html><body>secondaryvalidationcontroller</body></html>' },
    })
    const result = await myChartUserPassLogin({ hostname: HOST, user: 'u', pass: 'p' })
    expect(result.state).toBe('error')
    expect(result.error).toBe('could not find request verification token')
  })
})
