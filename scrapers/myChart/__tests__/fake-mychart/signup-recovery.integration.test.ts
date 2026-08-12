/**
 * End-to-end test of the pre-login onboarding scrapers — self-signup,
 * activation-code enrollment and account recovery — against fake-mychart, the
 * same way the mobile app's no-account / forgot-login branches drive them.
 *
 * These endpoints run before an account exists, so they are the one part of
 * the POST surface that fake-mychart deliberately leaves open to a request
 * with no session cookie (see `isPreLoginEndpoint` in the fake's route).
 *
 * Self-contained: every account it creates gets a unique email and username,
 * so the seeded homer/marge state other tests depend on is left alone.
 *
 * Requires fake-mychart running on FAKE_MYCHART_HOST (default localhost:4000).
 *
 * Run with: bun test scrapers/myChart/__tests__/fake-mychart/signup-recovery.test.ts
 */

import { describe, it, expect } from 'bun:test'
import { myChartUserPassLogin } from '../../login'
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

const HOST = process.env.FAKE_MYCHART_HOST ?? 'localhost:4000'

const uniq = Date.now().toString(36)
const signupEmail = `signup-${uniq}@example.com`
const signupUser = `signup_${uniq}`
const recoverEmail = `recover-${uniq}@example.com`
const recoverUser = `recover_${uniq}`

describe('Signup and account recovery', () => {
  it('self-signup creates a usable account after email verification', async () => {
    const sr = await submitSignupRequest({
      hostname: HOST,
      protocol: 'http',
      identity: {
        firstName: 'Test', lastName: 'Signup', dateOfBirth: '01/01/1980',
        email: signupEmail, gender: 'Unknown',
        address: { street: '1 Test St', city: 'Denver', state: '6', zip: '80204' },
      },
    })
    expect(sr.state).toBe('need_contact_verification')

    const cv = await verifySignupContactCode({
      mychartRequest: sr.mychartRequest, signupToken: sr.signupToken!, code: '123456',
    })
    expect(cv.state).toBe('verified')

    const ca = await createSignupCredentials({
      mychartRequest: sr.mychartRequest, signupToken: sr.signupToken!,
      username: signupUser, password: 'Sup3rSecret!',
    })
    expect(ca.state).toBe('created')

    const login = await myChartUserPassLogin({
      hostname: HOST, user: signupUser, pass: 'Sup3rSecret!', protocol: 'http',
    })
    expect(login.state).toBe('logged_in')
  })

  it('self-signup rejects an email that already has an account', async () => {
    const sr = await submitSignupRequest({
      hostname: HOST,
      protocol: 'http',
      identity: {
        firstName: 'Homer', lastName: 'Simpson', dateOfBirth: '05/12/1956',
        email: 'homer@springfield.net', gender: 'Male',
        address: { street: '742 Evergreen Terrace', city: 'Springfield', state: '6', zip: '80204' },
      },
    })
    expect(sr.state).toBe('account_exists')
  })

  it('valid activation code creates an account', async () => {
    const act = await verifyActivationCode({
      hostname: HOST, code: 'ABCDE-FGHIJ-KLMNO', protocol: 'http',
    })
    expect(act.state).toBe('valid')
    const ca = await createSignupCredentials({
      mychartRequest: act.mychartRequest, signupToken: act.signupToken!,
      username: `activate_${uniq}`, password: 'Eatmyshorts1!',
    })
    expect(ca.state).toBe('created')
  })

  it('invalid activation code is rejected', async () => {
    const act = await verifyActivationCode({
      hostname: HOST, code: 'ZZZZZ-ZZZZZ-ZZZZZ', protocol: 'http',
    })
    expect(act.state).toBe('invalid')
  })

  it('account recovery resets the password and reveals the username', async () => {
    // Create a throwaway account so recovery doesn't mutate seeded users.
    const sr = await submitSignupRequest({
      hostname: HOST,
      protocol: 'http',
      identity: {
        firstName: 'Test', lastName: 'Recover', dateOfBirth: '02/02/1990',
        email: recoverEmail, gender: 'Unknown',
        address: { street: '2 Test St', city: 'Denver', state: '6', zip: '80204' },
      },
    })
    await verifySignupContactCode({ mychartRequest: sr.mychartRequest, signupToken: sr.signupToken!, code: '123456' })
    await createSignupCredentials({
      mychartRequest: sr.mychartRequest, signupToken: sr.signupToken!,
      username: recoverUser, password: 'OldPassw0rd!',
    })

    // Now recover it.
    const rs = await getAccountRecoverySettings({ hostname: HOST, contactInfo: recoverEmail, protocol: 'http' })
    expect(rs.settings?.allowEmail).toBe(true)

    const send = await sendAccountRecoveryCode({ mychartRequest: rs.mychartRequest, contactInfo: recoverEmail })
    expect(send.state).toBe('sent')

    const vr = await verifyAccountRecoveryCode({ mychartRequest: rs.mychartRequest, contactInfo: recoverEmail, code: '123456' })
    expect(vr.state).toBe('verified')
    expect(vr.username).toBe(recoverUser.toLowerCase())

    const reset = await resetAccountPassword({ mychartRequest: rs.mychartRequest, recoveryToken: vr.recoveryToken!, newPassword: 'BrandN3wPass!' })
    expect(reset.state).toBe('reset')

    const login = await myChartUserPassLogin({ hostname: HOST, user: recoverUser, pass: 'BrandN3wPass!', protocol: 'http' })
    expect(login.state).toBe('logged_in')
  })
})
