/**
 * End-to-end tests for the credential-setup scrapers against a live
 * fake-mychart: setupTotp / disableTotp and setupPasskey / listPasskeys /
 * deletePasskey.
 *
 * These call the scraper functions directly, so a break shows up here rather
 * than as a confusing CLI-output assertion. `tests/integration/ci/cli-passkey.integration.test.ts`
 * covers the same ground one layer up, through the built CLI binary.
 *
 * The TOTP half is a real cryptographic round trip: fake-mychart mints a fresh
 * secret, and its VerifyCode endpoint rejects any code that isn't a valid TOTP
 * for it. A scraper that fabricated a six-digit code would fail here.
 *
 * Requires fake-mychart running on FAKE_MYCHART_HOST (default localhost:4000).
 *
 * Run with: bun run test:integration
 */

import { describe, it, expect, beforeEach, afterAll } from 'bun:test'
import { myChartUserPassLogin } from '../../login'
import { type MyChartRequest } from '../../myChartRequest'
import { setupTotp, disableTotp } from '../../setupTotp'
import { setupPasskey, listPasskeys, deletePasskey } from '../../setupPasskey'
import { myChartPasskeyLogin } from '../../login'
import { generateTotpCode } from '../../totp'
import { resetFakeMyChart } from './mountMode'

const HOST = process.env.FAKE_MYCHART_HOST ?? 'localhost:4000'
const USER = 'homer'
const PASS = 'donuts123'

async function login(): Promise<MyChartRequest> {
  const result = await myChartUserPassLogin({
    hostname: HOST,
    user: USER,
    pass: PASS,
    protocol: 'http',
  })
  if (result.state !== 'logged_in') {
    throw new Error(`login failed: ${result.state} ${result.error ?? ''}`)
  }
  return result.mychartRequest
}

/** Ask the server directly whether TOTP is on, bypassing the scraper. */
async function serverSaysTotpEnabled(req: MyChartRequest): Promise<boolean> {
  const resp = await req.makeRequest({
    path: '/api/secondary-validation/GetTwoFactorInfo',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', '__RequestVerificationToken': 'tok-test' },
    body: '{}',
  })
  const info = await resp.json() as { IsTotpEnabled?: boolean }
  return info.IsTotpEnabled ?? false
}

// Every test starts from the seed state; TOTP opt-in and registered passkeys
// both persist in the server's memory otherwise.
beforeEach(async () => { await resetFakeMyChart(HOST) })
afterAll(async () => { await resetFakeMyChart(HOST) })

// ---------------------------------------------------------------------------
// TOTP
// ---------------------------------------------------------------------------

describe('setupTotp against fake-mychart', () => {
  it('enables TOTP and returns a secret that generates working codes', async () => {
    const req = await login()
    expect(await serverSaysTotpEnabled(req)).toBe(false)

    const result = await setupTotp(req, PASS)

    expect(result.error).toBeUndefined()
    expect(result.secret).toBeTruthy()
    expect(await serverSaysTotpEnabled(req)).toBe(true)

    // The server only opted in because the code the scraper derived from this
    // secret verified. Prove the secret is usable again afterwards.
    const code = await generateTotpCode(result.secret!)
    expect(code).toMatch(/^\d{6}$/)
    const verify = await req.makeRequest({
      path: '/api/secondary-validation/VerifyCode',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', '__RequestVerificationToken': 'tok-test' },
      body: JSON.stringify({ Code: code }),
    })
    expect(verify.status).toBe(200)
  }, 30_000)

  it('is rejected when the code does not match the issued secret', async () => {
    // Guards the guard: if fake-mychart ever went back to waving through any
    // six digits, the round trip above would stop proving anything.
    const req = await login()
    await req.makeRequest({
      path: '/api/secondary-validation/TotpQrCode',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', '__RequestVerificationToken': 'tok-test' },
      body: '{}',
    })

    const verify = await req.makeRequest({
      path: '/api/secondary-validation/VerifyCode',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', '__RequestVerificationToken': 'tok-test' },
      body: JSON.stringify({ Code: '000000' }),
    })
    expect(verify.status).not.toBe(200)
  }, 30_000)

  it('issues a different secret on each setup', async () => {
    const first = await setupTotp(await login(), PASS)
    await resetFakeMyChart(HOST)
    const second = await setupTotp(await login(), PASS)

    expect(first.secret).toBeTruthy()
    expect(second.secret).toBeTruthy()
    expect(first.secret).not.toBe(second.secret)
  }, 30_000)

  it('refuses to set up TOTP twice on the same account', async () => {
    const req = await login()
    expect((await setupTotp(req, PASS)).secret).toBeTruthy()

    const second = await setupTotp(req, PASS)

    expect(second.secret).toBeNull()
    expect(second.error).toContain('already enabled')
    // The first secret must still be the live one.
    expect(await serverSaysTotpEnabled(req)).toBe(true)
  }, 30_000)

  it('fails on a wrong password without enabling TOTP', async () => {
    const req = await login()

    const result = await setupTotp(req, 'not-the-password')

    expect(result.secret).toBeNull()
    expect(result.error).toBeTruthy()
    expect(await serverSaysTotpEnabled(req)).toBe(false)
  }, 30_000)

  it('round-trips: setup then disable leaves the account as it started', async () => {
    const req = await login()

    const { secret } = await setupTotp(req, PASS)
    expect(await serverSaysTotpEnabled(req)).toBe(true)

    expect(await disableTotp(req, PASS, secret!)).toBe(true)
    expect(await serverSaysTotpEnabled(req)).toBe(false)
  }, 30_000)

  it('does not disable TOTP when given the wrong secret', async () => {
    const req = await login()
    await setupTotp(req, PASS)

    // A valid Base32 secret, just not this account's.
    const disabled = await disableTotp(req, PASS, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')

    expect(disabled).toBe(false)
    expect(await serverSaysTotpEnabled(req)).toBe(true)
  }, 30_000)

  it('does not disable TOTP when given the wrong password', async () => {
    const req = await login()
    const { secret } = await setupTotp(req, PASS)

    expect(await disableTotp(req, 'not-the-password', secret!)).toBe(false)
    expect(await serverSaysTotpEnabled(req)).toBe(true)
  }, 30_000)
})

// ---------------------------------------------------------------------------
// Passkeys
// ---------------------------------------------------------------------------

describe('setupPasskey against fake-mychart', () => {
  it('registers a passkey that then appears in the account list', async () => {
    const req = await login()
    expect(await listPasskeys(req)).toEqual([])

    const credential = await setupPasskey(req)

    expect(credential).not.toBeNull()
    expect(credential!.credentialId.length).toBeGreaterThan(0)
    // fake-mychart sends an empty rp.id, so the authenticator derives it from
    // the origin — hostname only, no port, per the WebAuthn spec.
    expect(credential!.rpId).toBe(new URL(`http://${HOST}`).hostname)
    expect(credential!.signCount).toBe(0)

    const passkeys = await listPasskeys(req) as Array<{ rawId: string }>
    expect(passkeys.length).toBe(1)
    // The server must have stored the same credential id the scraper kept.
    expect(passkeys[0].rawId).toBe(credential!.credentialId)
  }, 30_000)

  it('produces a credential that can actually log in', async () => {
    // The real acceptance test for registration: the server verifies the
    // assertion signature against the public key it stored during setup.
    const credential = await setupPasskey(await login())
    expect(credential).not.toBeNull()

    const result = await myChartPasskeyLogin({
      hostname: HOST,
      credential: credential!,
      protocol: 'http',
    })

    expect(result.state).toBe('logged_in')
  }, 30_000)

  it('registers a second passkey alongside the first', async () => {
    const req = await login()

    const first = await setupPasskey(req)
    const second = await setupPasskey(req)

    expect(first).not.toBeNull()
    expect(second).not.toBeNull()
    expect(second!.credentialId).not.toBe(first!.credentialId)

    const passkeys = await listPasskeys(req) as Array<{ rawId: string; name: string }>
    expect(passkeys.length).toBe(2)
    expect(passkeys.map(p => p.rawId).sort())
      .toEqual([first!.credentialId, second!.credentialId].sort())
  }, 30_000)

  it('deletes a passkey and leaves the others in place', async () => {
    const req = await login()
    const keep = await setupPasskey(req)
    const remove = await setupPasskey(req)

    expect(await deletePasskey(req, remove!.credentialId)).toBe(true)

    const passkeys = await listPasskeys(req) as Array<{ rawId: string }>
    expect(passkeys.map(p => p.rawId)).toEqual([keep!.credentialId])
  }, 30_000)

  it('reports an empty list for an account with no passkeys', async () => {
    // Distinct from null, which means the request itself failed.
    expect(await listPasskeys(await login())).toEqual([])
  }, 30_000)
})
