/**
 * Tests for the signup / account-recovery scrapers against fake-mychart.
 *
 * Exercises the no-account / forgot-login onboarding branches (Vision
 * Implementation plan §7) end-to-end: self-signup (identity), activation-code
 * signup, and unified account recovery. The contract these hit is modeled on
 * the live Denver Health reverse-engineering captured in
 * claude-memory/mychart-signup-recovery-api.md.
 *
 * Requires fake-mychart running on FAKE_MYCHART_HOST (default localhost:4000).
 * Each test resets state first so ordering doesn't matter.
 *
 * Run with: bun test scrapers/myChart/__tests__/fake-mychart/signup-recovery.test.ts
 */

import { describe, it, expect, beforeEach } from 'bun:test'
import {
  submitSignupRequest,
  verifyActivationCode,
  verifySignupContactCode,
  createSignupCredentials,
} from '../../signup'
import {
  getAccountRecoverySettings,
  sendAccountRecoveryCode,
  verifyAccountRecoveryCode,
  resetAccountPassword,
} from '../../accountRecovery'
import { myChartUserPassLogin } from '../../login'

const HOST = process.env.FAKE_MYCHART_HOST ?? 'localhost:4000'
const BASE = `http://${HOST}`

async function postReset(): Promise<void> {
  const r = await fetch(`${BASE}/reset`, { method: 'POST' })
  if (!r.ok) throw new Error(`/reset failed: ${r.status}`)
}

const identity = (over: Partial<Parameters<typeof submitSignupRequest>[0]['identity']> = {}) => ({
  firstName: 'Lisa',
  lastName: 'Simpson',
  dateOfBirth: '05/09/1981',
  email: 'lisa@example.com',
  gender: 'Female' as const,
  address: { street: '742 Evergreen Terrace', city: 'Springfield', state: '6', zip: '80204' },
  ...over,
})

describe('fake-mychart signup + account recovery', () => {
  beforeEach(postReset)

  // ── Self-signup (identity match) ──────────────────────────────────
  it('self-signup creates a logged-in-able account after contact verification', async () => {
    const sr = await submitSignupRequest({ hostname: HOST, identity: identity() })
    expect(sr.state).toBe('need_contact_verification')
    expect(sr.signupToken).toBeTruthy()
    expect(sr.deliveryMasked).toBe('li***@example.com')

    const cv = await verifySignupContactCode({
      mychartRequest: sr.mychartRequest,
      signupToken: sr.signupToken!,
      code: '123456',
    })
    expect(cv.state).toBe('verified')

    const ca = await createSignupCredentials({
      mychartRequest: sr.mychartRequest,
      signupToken: sr.signupToken!,
      username: 'lisasimpson',
      password: 'Sax0phone!',
    })
    expect(ca.state).toBe('created')

    const login = await myChartUserPassLogin({
      hostname: HOST,
      user: 'lisasimpson',
      pass: 'Sax0phone!',
      protocol: 'http',
    })
    expect(login.state).toBe('logged_in')
  }, 20_000)

  it('self-signup with a wrong contact code cannot create the account', async () => {
    const sr = await submitSignupRequest({ hostname: HOST, identity: identity() })
    const cv = await verifySignupContactCode({
      mychartRequest: sr.mychartRequest,
      signupToken: sr.signupToken!,
      code: '000000',
    })
    expect(cv.state).toBe('invalid')

    const ca = await createSignupCredentials({
      mychartRequest: sr.mychartRequest,
      signupToken: sr.signupToken!,
      username: 'lisasimpson',
      password: 'Sax0phone!',
    })
    // Account creation is blocked until contact is verified.
    expect(ca.state).not.toBe('created')
  }, 20_000)

  it('self-signup rejects an email that already has an account', async () => {
    const sr = await submitSignupRequest({
      hostname: HOST,
      identity: identity({ email: 'homer@springfield.net' }),
    })
    expect(sr.state).toBe('account_exists')
  }, 15_000)

  // ── Activation-code signup ────────────────────────────────────────
  it('valid activation code lets you create an account without separate contact verification', async () => {
    const act = await verifyActivationCode({ hostname: HOST, code: 'ABCDE-FGHIJ-KLMNO' })
    expect(act.state).toBe('valid')
    expect(act.signupToken).toBeTruthy()

    const ca = await createSignupCredentials({
      mychartRequest: act.mychartRequest,
      signupToken: act.signupToken!,
      username: 'bartman',
      password: 'Eatmyshorts1!',
    })
    expect(ca.state).toBe('created')

    const login = await myChartUserPassLogin({
      hostname: HOST,
      user: 'bartman',
      pass: 'Eatmyshorts1!',
      protocol: 'http',
    })
    expect(login.state).toBe('logged_in')
  }, 20_000)

  it('invalid activation code is rejected', async () => {
    const act = await verifyActivationCode({ hostname: HOST, code: 'ZZZZZ-ZZZZZ-ZZZZZ' })
    expect(act.state).toBe('invalid')
  }, 15_000)

  // ── Account recovery (unified username + password) ────────────────
  it('recovery settings expose email + SMS with the consent string', async () => {
    const rs = await getAccountRecoverySettings({ hostname: HOST, contactInfo: 'homer@springfield.net' })
    expect(rs.settings?.allowEmail).toBe(true)
    expect(rs.settings?.allowSMS).toBe(true)
    expect(rs.settings?.consentStrings.showSMSConsent).toBe(true)
    expect(rs.settings?.consentStrings.callToAction).toContain('Denver Health')
  }, 15_000)

  it('recovery reveals the username and resets the password', async () => {
    const rs = await getAccountRecoverySettings({ hostname: HOST, contactInfo: 'homer@springfield.net' })
    expect(rs.settings).not.toBeNull()

    const send = await sendAccountRecoveryCode({
      mychartRequest: rs.mychartRequest,
      contactInfo: 'homer@springfield.net',
    })
    expect(send.state).toBe('sent')
    expect(send.deliveryMasked).toBe('ho***@springfield.net')

    const vr = await verifyAccountRecoveryCode({
      mychartRequest: rs.mychartRequest,
      contactInfo: 'homer@springfield.net',
      code: '123456',
    })
    expect(vr.state).toBe('verified')
    expect(vr.username).toBe('homer')

    const reset = await resetAccountPassword({
      mychartRequest: rs.mychartRequest,
      recoveryToken: vr.recoveryToken!,
      newPassword: 'NewDonuts456!',
    })
    expect(reset.state).toBe('reset')

    const login = await myChartUserPassLogin({
      hostname: HOST,
      user: 'homer',
      pass: 'NewDonuts456!',
      protocol: 'http',
    })
    expect(login.state).toBe('logged_in')
  }, 20_000)

  it('recovery for an unknown contact never verifies (no account enumeration)', async () => {
    const rs = await getAccountRecoverySettings({ hostname: HOST, contactInfo: 'nobody@nowhere.com' })
    // Settings still come back (Epic never confirms existence)…
    expect(rs.settings).not.toBeNull()
    const send = await sendAccountRecoveryCode({
      mychartRequest: rs.mychartRequest,
      contactInfo: 'nobody@nowhere.com',
    })
    expect(send.state).toBe('sent')
    // …but no code can ever be verified for a contact with no account.
    const vr = await verifyAccountRecoveryCode({
      mychartRequest: rs.mychartRequest,
      contactInfo: 'nobody@nowhere.com',
      code: '123456',
    })
    expect(vr.state).toBe('invalid')
  }, 15_000)
})
