/**
 * Integration tests for auto-accepting Terms & Conditions against an instance
 * that demands them.
 *
 * Requires the same fake-mychart on localhost:4000 every other suite uses; the
 * T&C behaviour is switched on here rather than baked into the server at boot.
 * It used to need a second server on another port started with
 * FAKE_MYCHART_REQUIRE_TERMS=true, which meant a second CI job and a directory
 * of its own to be globbed separately.
 *
 * `requireTerms` is global to the server process, so it goes off again in
 * afterAll — leaving it on would send every later suite to a T&C page it was
 * not written for.
 *
 * Run with: bun run test:fake-mychart
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { myChartUserPassLogin, complete2faFlow } from '../../login'
import { getMyChartProfile } from '../../profile'
import { setupTotp } from '../../setupTotp'
import { setRequireTerms } from './mountMode'

const HOST = process.env.FAKE_MYCHART_HOST ?? 'localhost:4000'

describe('terms-and-conditions auto-accept', () => {

  beforeAll(async () => { await setRequireTerms(HOST, true) })
  afterAll(async () => { await setRequireTerms(HOST, false) })

  /**
   * Everything below asserts that login *survives* the T&C gate — and every one
   * of those assertions passes just as happily against an instance that never
   * gates at all. That was tolerable when a whole server was booted with
   * FAKE_MYCHART_REQUIRE_TERMS=true; now that it's a knob this suite flips
   * itself, a knob that silently stopped working would leave the suite green
   * and testing nothing.
   *
   * So: prove the gate is up before trusting anything that follows. Logging in
   * by hand rather than through the scraper is the point — the scraper accepts
   * the terms for you, which is exactly what would hide a missing gate.
   */
  it('the fake really is gating on terms (canary for the rest of this suite)', async () => {
    const loginPage = await fetch(`http://${HOST}/MyChart/Authentication/Login`)
    const cookie = loginPage.headers.getSetCookie().map(c => c.split(';')[0]).join('; ')
    const token = (await loginPage.text()).match(/name="__RequestVerificationToken"[^>]*value="([^"]*)"/)?.[1]
    expect(token).toBeTruthy()

    const b64 = (s: string) => Buffer.from(s).toString('base64')
    const loginInfo = encodeURIComponent(JSON.stringify({
      Type: 'StandardLogin',
      Credentials: { LoginIdentifier: b64('homer'), Password: b64('donuts123') },
    }))
    const res = await fetch(`http://${HOST}/MyChart/Authentication/Login/DoLogin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie },
      body: `__RequestVerificationToken=${token}&DeviceId=&postLoginUrl=&LoginInfo=${loginInfo}`,
    })

    expect(await res.text()).toContain('Terms and Conditions')
  })

  describe('login without 2FA', () => {
    it('login auto-accepts T&C and returns logged_in', async () => {
      const result = await myChartUserPassLogin({
        hostname: HOST,
        user: 'homer',
        pass: 'donuts123',
        protocol: 'http',
      })
      expect(result.state).toBe('logged_in')
    }, 30_000)

    it('scrapers work after auto-accepted T&C', async () => {
      const result = await myChartUserPassLogin({
        hostname: HOST,
        user: 'homer',
        pass: 'donuts123',
        protocol: 'http',
      })
      expect(result.state).toBe('logged_in')

      const profile = await getMyChartProfile(result.mychartRequest)
      expect(profile).not.toBeNull()
      expect(profile!.name).toBe('Homer Jay Simpson')
    }, 30_000)
  })

  describe('login with 2FA', () => {
    it('2FA completion auto-accepts T&C and returns logged_in', async () => {
      const loginResult = await myChartUserPassLogin({
        hostname: HOST,
        user: 'homer',
        pass: 'donuts123',
        protocol: 'http',
        skipSendCode: true,
      })

      // With REQUIRE_2FA + REQUIRE_TERMS, login should first need 2FA
      // If the server doesn't require 2FA, it goes straight to logged_in (auto-accepted)
      if (loginResult.state === 'need_2fa') {
        const twofaResult = await complete2faFlow({
          mychartRequest: loginResult.mychartRequest,
          code: '123456',
        })
        expect(twofaResult.state).toBe('logged_in')

        const profile = await getMyChartProfile(twofaResult.mychartRequest)
        expect(profile).not.toBeNull()
        expect(profile!.name).toBe('Homer Jay Simpson')
      } else {
        // Server doesn't require 2FA, T&C was auto-accepted
        expect(loginResult.state).toBe('logged_in')
      }
    }, 30_000)
  })

  describe('TOTP setup after auto-accepted terms', () => {
    it('TOTP setup works after T&C is auto-accepted', async () => {
      const loginResult = await myChartUserPassLogin({
        hostname: HOST,
        user: 'homer',
        pass: 'donuts123',
        protocol: 'http',
      })
      expect(loginResult.state).toBe('logged_in')

      const result = await setupTotp(loginResult.mychartRequest, 'donuts123')
      expect(result.secret).not.toBeNull()
      expect(typeof result.secret).toBe('string')
      expect(result.secret!.length).toBeGreaterThan(0)
    }, 30_000)
  })
})
