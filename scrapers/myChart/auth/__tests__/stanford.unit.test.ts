// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'bun:test'
import { myChartUserPassLogin, complete2faFlow } from '../login'
import { isStanfordHealthCare } from '../stanford'
import { machineLogin } from '../loginModes'
import { setupPasskey } from '../setupPasskey'
import { setupTotp } from '../setupTotp'
import { MyChartRequest } from '../../core/myChartRequest'
import { setTestTransport } from '../../../http'

const PORTAL = 'https://myhealth.stanfordhealthcare.org/Private/Ajax/V1/MyHealthLogin'
const MYCHART = 'https://mychart.stanfordhealthcare.org/myhealth_sso'
// Shape of a live response to an unknown username (probed against the real portal).
const BAD_LOGIN = { meta: { code: 401, errorCode: 1000, errorMessage: 'USER_MISSING_ERROR' }, action: 'redirectUrl=/', twoFactorEnabled: false }
const REFERRING_PAGE = `${MYCHART}/custom/referringpage.asp?&errorNamespace=AuthError&errorKey=genericloginfailed`

type Call = { url: string; method: string; body: Record<string, unknown> | undefined }

function fakeStanford(opts: { login: object; ssoWorks?: boolean; verifyCode?: string }) {
  const calls: Call[] = []
  let signedIn = false
  // A real fetch reports the URL it answered; a constructed Response doesn't, and the
  // SSO check reads it.
  setTestTransport(async (url, init) => {
    const resp = await route(url, init)
    Object.defineProperty(resp, 'url', { value: url })
    return resp
  })
  async function route(url: string, init: RequestInit): Promise<Response> {
    const body = typeof init.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : undefined
    calls.push({ url, method: init.method ?? 'GET', body })
    const json = (v: object) => new Response(JSON.stringify(v), { status: 200, headers: { 'Content-Type': 'application/json' } })

    if (url === PORTAL) return json(opts.login)
    if (url === `${PORTAL}/generateTwoFactorLoginCode`) return json({ meta: { code: 200 } })
    if (url === `${PORTAL}/verifyTwoFactorLoginCode`) {
      return json({ meta: { code: body?.loginCode === opts.verifyCode ? 200 : 400 } })
    }
    if (url.startsWith(`${MYCHART}/inside.asp`)) {
      if (opts.ssoWorks !== false) signedIn = true
      return new Response('', { status: 302, headers: { Location: signedIn ? './Home' : './Authentication/Login' } })
    }
    if (url === `${MYCHART}/Home`) {
      return signedIn
        ? new Response('<html>home</html>', { status: 200, headers: { 'Content-Type': 'text/html' } })
        : new Response('', { status: 302, headers: { Location: '/myhealth_sso/Authentication/Login?postloginurl=Home' } })
    }
    if (url.startsWith(`${MYCHART}/Authentication/Login`)) {
      return new Response('', { status: 302, headers: { Location: REFERRING_PAGE } })
    }
    if (url === REFERRING_PAGE) return new Response('<html></html>', { status: 200, headers: { 'Content-Type': 'text/html' } })
    return new Response('', { status: 404 })
  }
  return calls
}

let previousTelemetrySetting: string | undefined
beforeAll(() => {
  previousTelemetrySetting = process.env.MYCHART_CLI_TELEMETRY_DISABLED
  process.env.MYCHART_CLI_TELEMETRY_DISABLED = '1'
})
afterEach(() => setTestTransport(null))
afterAll(() => {
  if (previousTelemetrySetting === undefined) delete process.env.MYCHART_CLI_TELEMETRY_DISABLED
  else process.env.MYCHART_CLI_TELEMETRY_DISABLED = previousTelemetrySetting
})

describe('isStanfordHealthCare', () => {
  it('matches the portal and MyChart hosts however they are typed', () => {
    expect(isStanfordHealthCare('myhealth.stanfordhealthcare.org')).toBe(true)
    expect(isStanfordHealthCare('https://MyHealth.StanfordHealthCare.org/')).toBe(true)
    expect(isStanfordHealthCare('mychart.stanfordhealthcare.org/myhealth_sso')).toBe(true)
  })

  it('does not match other Stanford-named instances', () => {
    expect(isStanfordHealthCare('mychart.stanfordchildrens.org')).toBe(false)
    expect(isStanfordHealthCare('evil-stanfordhealthcare.org')).toBe(false)
  })
})

describe('Stanford MyHealth login', () => {
  it('logs in through the portal API and SSO hop without touching /Authentication/Login', async () => {
    const calls = fakeStanford({ login: { action: 'Private', meta: { code: 200 } } })
    const result = await myChartUserPassLogin({ hostname: 'myhealth.stanfordhealthcare.org', user: 'pat', pass: 'pw' })

    expect(result.state).toBe('logged_in')
    expect(result.mychartRequest.hostname).toBe('mychart.stanfordhealthcare.org')
    expect(result.mychartRequest.firstPathPart).toBe('myhealth_sso')
    expect(calls[0]).toMatchObject({ url: PORTAL, method: 'POST', body: { username: 'pat', password: 'pw' } })
    expect(calls.some((c) => c.url.includes('DoLogin'))).toBe(false)
  })

  it('reports a rejected login as invalid_login', async () => {
    fakeStanford({ login: BAD_LOGIN })
    const result = await myChartUserPassLogin({ hostname: 'myhealth.stanfordhealthcare.org', user: 'nobody', pass: 'pw' })
    expect(result.state).toBe('invalid_login')
  })

  it('does not call a failed SSO hop a login, though it ends on a 200 page', async () => {
    fakeStanford({ login: { action: 'Private', meta: { code: 200 } }, ssoWorks: false })
    const result = await myChartUserPassLogin({ hostname: 'myhealth.stanfordhealthcare.org', user: 'pat', pass: 'pw' })
    expect(result.state).toBe('error')
  })

  it('sends a 2FA code, verifies it with the same deviceId, then enters MyChart', async () => {
    const calls = fakeStanford({
      login: { twoFactorRequired: true, twoFactorGlobalSwitch: 'ENABLED', twoFactorEnabled: true, emailAddress: 'p**t@example.com', meta: { code: 200 } },
      verifyCode: '123456',
    })
    const login = await myChartUserPassLogin({ hostname: 'myhealth.stanfordhealthcare.org', user: 'twofa-user', pass: 'pw' })
    expect(login.state).toBe('need_2fa')
    expect(login.twoFaDelivery).toEqual({ method: 'email', contact: 'p**t@example.com' })
    expect(calls.find((c) => c.url.endsWith('/generateTwoFactorLoginCode'))?.body).toEqual({ userName: 'twofa-user', sendType: 'EMAIL' })

    const wrong = await complete2faFlow({ mychartRequest: login.mychartRequest, code: '000000' })
    expect(wrong.state).toBe('invalid_2fa')

    const right = await complete2faFlow({ mychartRequest: login.mychartRequest, code: ' 123456 ' })
    expect(right.state).toBe('logged_in')
    const verify = calls.filter((c) => c.url.endsWith('/verifyTwoFactorLoginCode')).at(-1)!
    expect(verify.body?.deviceId).toBe(calls[0]!.body?.deviceId)
  })

  it('sends a saved trustedDeviceId, and leaves the id it used on the request for the client to save', async () => {
    const calls = fakeStanford({ login: { action: 'Private', meta: { code: 200 } } })
    const saved = await myChartUserPassLogin({ hostname: 'myhealth.stanfordhealthcare.org', user: 'pat', pass: 'pw', trustedDeviceId: 'saved-id' })
    expect(calls[0]!.body?.deviceId).toBe('saved-id')
    expect(saved.mychartRequest.trustedDeviceId).toBe('saved-id')

    const fresh = await myChartUserPassLogin({ hostname: 'myhealth.stanfordhealthcare.org', user: 'pat', pass: 'pw' })
    expect(fresh.mychartRequest.trustedDeviceId).toMatch(/^[0-9a-f-]{36}$/)
    expect(fresh.mychartRequest.trustedDeviceId).not.toBe('saved-id')
  })

  it('reaches the portal from a silent re-login with the saved id, and never sends a code there', async () => {
    const calls = fakeStanford({ login: { twoFactorRequired: true, meta: { code: 200 } } })
    const outcome = await machineLogin({ hostname: 'myhealth.stanfordhealthcare.org', username: 'pat', password: 'pw', trustedDeviceId: 'saved-id' })
    expect(outcome.state).toBe('needs_human')
    expect(calls[0]!.body?.deviceId).toBe('saved-id')
    expect(calls.some((c) => c.url.endsWith('/generateTwoFactorLoginCode'))).toBe(false)
  })

  it('refuses to register a passkey or an authenticator, which Stanford logins would never use', async () => {
    const req = new MyChartRequest('mychart.stanfordhealthcare.org')
    await expect(setupPasskey(req)).rejects.toThrow('own MyHealth login')
    await expect(setupTotp(req, 'pw')).rejects.toThrow('own MyHealth login')
  })

  it('never asks the portal to send a code when skipSendCode is set', async () => {
    const calls = fakeStanford({ login: { twoFactorRequired: true, meta: { code: 200 } } })
    const login = await myChartUserPassLogin({ hostname: 'myhealth.stanfordhealthcare.org', user: 'pat', pass: 'pw', skipSendCode: true })
    expect(login.state).toBe('need_2fa')
    expect(calls.some((c) => c.url.endsWith('/generateTwoFactorLoginCode'))).toBe(false)
  })
})
