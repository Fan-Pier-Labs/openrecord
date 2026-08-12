import { describe, it, expect, afterEach } from 'bun:test'
import { silentLogin, wireSilentReauthentication } from '../silentLogin'
import { MyChartRequest } from '../myChartRequest'
import { setTestTransport } from '../../http'

/**
 * `silentLogin` is the ladder every client climbs when a session dies
 * mid-scrape: passkey first, then password, then a stored TOTP secret for the
 * 2FA step. Nobody is at the keyboard, so each rung has to either succeed or
 * say precisely why it couldn't — a silent failure here surfaces as an empty
 * chart rather than an error.
 *
 * Driven against a scripted MyChart via `setTestTransport`, so the real URL
 * building, headers and per-host limiter all still run.
 */

const HOST = 'mychart.example.com'
const TOKEN_INPUT = '<input name="__RequestVerificationToken" value="tok123" />'
const HOME_PAGE = '<html><body>MD_HOME_INDEX</body></html>'
// The marker the real page carries, and the one login.ts matches on — spelled
// lowercase because that check is case-sensitive.
const TWO_FA_PAGE =
  `<html><body><div>secondaryvalidationcontroller</div>${TOKEN_INPUT}</body></html>`
const FAILED_PAGE = '<html><body>Login/LoginFailed</body></html>'

// Marge's seeded secret — the standard RFC 6238 test vector fake-mychart uses.
const TOTP_SECRET = 'JBSWY3DPEHPK3PXP'

type Server = {
  /** Body the DoLogin POST answers with. */
  doLogin?: string
  /** Whether the 2FA Validate endpoint accepts the submitted code. */
  totpAccepted?: boolean
  /** Fail every passkey challenge request, as an instance with none would. */
  passkeyWorks?: boolean
}

function fakeMyChart(server: Server = {}) {
  const calls: string[] = []
  setTestTransport(async (url: string) => {
    calls.push(url)
    const path = new URL(url).pathname.toLowerCase()

    if (path === '/' || path === '') {
      return new Response('', { status: 302, headers: { Location: '/MyChart/' } })
    }
    if (url.toLowerCase().includes('loginpagecontroller')) {
      return new Response('', { status: 200 })
    }
    if (path.includes('getpasskeygetparams')) {
      return server.passkeyWorks
        ? new Response(JSON.stringify({ Success: true }), { status: 200 })
        : new Response('', { status: 500 })
    }
    if (path.includes('/secondaryvalidation/validate')) {
      return new Response(
        JSON.stringify(
          server.totpAccepted
            ? { Success: true }
            : { Success: false, TwoFactorCodeFailReason: 'codewrong' },
        ),
        { status: 200 },
      )
    }
    if (path.includes('/secondaryvalidation/sendcode')) {
      return new Response(JSON.stringify({ Success: true }), { status: 200 })
    }
    if (path.includes('/secondaryvalidation/getsmsconsentstrings')) {
      return new Response('{}', { status: 200 })
    }
    if (path.includes('/authentication/login/dologin')) {
      return new Response(server.doLogin ?? HOME_PAGE, { status: 200 })
    }
    if (path.includes('/authentication/secondaryvalidation')) {
      return new Response(TWO_FA_PAGE, { status: 200 })
    }
    if (path.includes('/authentication/login')) {
      return new Response(TOKEN_INPUT, { status: 200 })
    }
    if (path.includes('/home')) {
      return new Response(HOME_PAGE, { status: 200 })
    }
    return new Response('', { status: 404 })
  })
  return { calls }
}

afterEach(() => {
  setTestTransport(null)
})

describe('silentLogin — what it refuses to do', () => {
  it('fails with a specific reason when nothing is stored', async () => {
    fakeMyChart()
    const outcome = await silentLogin({ hostname: HOST, protocol: 'https' })
    expect(outcome).toEqual({ state: 'failed', reason: 'no stored credentials' })
  })

  it('says the passkey was the thing that failed when there is no password to fall back to', async () => {
    fakeMyChart({ passkeyWorks: false })
    const outcome = await silentLogin({
      hostname: HOST,
      protocol: 'https',
      passkey: {
        credentialId: 'abc',
        privateKeyPem: 'not-a-key',
        rpId: HOST,
        userHandle: 'homer',
        signCount: 0,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    })
    expect(outcome.state).toBe('failed')
    expect(outcome).toHaveProperty(
      'reason',
      'passkey login failed and no password is available',
    )
  })

  it('refuses rather than guessing when 2FA is demanded and no TOTP secret is stored', async () => {
    fakeMyChart({ doLogin: TWO_FA_PAGE })
    const outcome = await silentLogin({
      hostname: HOST,
      protocol: 'https',
      username: 'homer',
      password: 'donuts123',
    })
    expect(outcome).toEqual({
      state: 'failed',
      reason: '2FA required and no TOTP secret is stored',
    })
  })

  it('reports the rejection when the generated TOTP code is refused', async () => {
    fakeMyChart({ doLogin: TWO_FA_PAGE, totpAccepted: false })
    const outcome = await silentLogin({
      hostname: HOST,
      protocol: 'https',
      username: 'homer',
      password: 'donuts123',
      totpSecret: TOTP_SECRET,
    })
    expect(outcome.state).toBe('failed')
    expect((outcome as { reason: string }).reason).toContain('TOTP code rejected')
  })

  it('surfaces a plain bad-password rejection as such', async () => {
    fakeMyChart({ doLogin: FAILED_PAGE })
    const outcome = await silentLogin({
      hostname: HOST,
      protocol: 'https',
      username: 'homer',
      password: 'wrong',
    })
    expect(outcome.state).toBe('failed')
    expect((outcome as { reason: string }).reason).toContain('login failed')
  })
})

describe('silentLogin — the happy rungs', () => {
  it('logs in with username and password', async () => {
    fakeMyChart()
    const outcome = await silentLogin({
      hostname: HOST,
      protocol: 'https',
      username: 'homer',
      password: 'donuts123',
    })
    expect(outcome.state).toBe('logged_in')
  })

  it('completes the 2FA step from the stored TOTP secret, with no user present', async () => {
    fakeMyChart({ doLogin: TWO_FA_PAGE, totpAccepted: true })
    const outcome = await silentLogin({
      hostname: HOST,
      protocol: 'https',
      username: 'homer',
      password: 'donuts123',
      totpSecret: TOTP_SECRET,
    })
    expect(outcome.state).toBe('logged_in')
  })

  it('falls back to the password when the passkey is rejected', async () => {
    fakeMyChart({ passkeyWorks: false })
    const outcome = await silentLogin({
      hostname: HOST,
      protocol: 'https',
      username: 'homer',
      password: 'donuts123',
      passkey: {
        credentialId: 'abc',
        privateKeyPem: 'not-a-key',
        rpId: HOST,
        userHandle: 'homer',
        signCount: 0,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    })
    expect(outcome.state).toBe('logged_in')
  })
})

describe('wireSilentReauthentication', () => {
  it('adopts the renewed session onto the SAME request object', async () => {
    fakeMyChart()
    const request = new MyChartRequest(HOST)
    request.firstPathPart = 'MyChart'

    let renewedWith: MyChartRequest | null = null
    wireSilentReauthentication(
      request,
      () => ({ hostname: HOST, protocol: 'https', username: 'homer', password: 'donuts123' }),
      (r) => {
        renewedWith = r
      },
    )

    expect(await request.reauthenticate!()).toBe(true)
    // Everything mid-scrape holds a reference to `request`, so the renewed
    // state has to land on it rather than on a replacement object.
    expect(renewedWith).toBe(request)
  })

  it('returns false — never throws — when the ladder cannot log back in', async () => {
    fakeMyChart()
    const request = new MyChartRequest(HOST)
    request.firstPathPart = 'MyChart'

    wireSilentReauthentication(request, () => ({ hostname: HOST, protocol: 'https' }))

    expect(await request.reauthenticate!()).toBe(false)
  })

  it('re-reads the credentials at renewal time, not at wiring time', async () => {
    fakeMyChart()
    const request = new MyChartRequest(HOST)
    request.firstPathPart = 'MyChart'

    // A passkey registered mid-session, or a password the user just changed,
    // has to be picked up by the next renewal — which is why getParams is a
    // callback rather than a value.
    let stored: { username?: string; password?: string } = {}
    wireSilentReauthentication(request, () => ({ hostname: HOST, protocol: 'https', ...stored }))

    expect(await request.reauthenticate!()).toBe(false)
    stored = { username: 'homer', password: 'donuts123' }
    expect(await request.reauthenticate!()).toBe(true)
  })
})
