/**
 * End-to-end test of the client-facing proxy layer (`proxyTools.ts`) against
 * fake-mychart: the exact list → refuse → switch → read → switch-back flow the
 * Claude Desktop extension and the mobile app drive through their
 * list_proxy_targets / switch_proxy_target tools and the per-read guard.
 *
 * Requires fake-mychart running on FAKE_MYCHART_HOST (default localhost:4000).
 *
 * Run with: bun test scrapers/myChart/__tests__/fake-mychart/proxy.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import type { MyChartRequest } from '../../core/myChartRequest'
import { myChartUserPassLogin, complete2faFlow } from '../../auth/login'
import { getMyChartProfile } from '../../chart/profile'
import { getMedications } from '../../chart/medications'
import {
  assertProxyReadContext,
  runListProxyTargets,
  runSwitchProxyTarget,
} from '../../proxy/proxyTools'
import { setMountMode, resetFakeMyChart } from './mountMode'

const HOST = process.env.FAKE_MYCHART_HOST ?? 'localhost:4000'

async function loginHomer(): Promise<MyChartRequest> {
  const result = await myChartUserPassLogin({
    hostname: HOST,
    user: 'homer',
    pass: 'donuts123',
    protocol: 'http',
  })
  expect(result.state).toBe('logged_in')
  if (result.state !== 'logged_in') throw new Error('homer login failed')
  return result.mychartRequest
}

describe('proxy tools against fake-mychart', () => {
  let session: MyChartRequest

  beforeAll(async () => {
    // Server state is global to the fake; don't inherit whatever ran last.
    await resetFakeMyChart(HOST)
    await setMountMode(HOST, 'prefixed')
    session = await loginHomer()
  }, 30_000)

  afterAll(async () => { await resetFakeMyChart(HOST) })

  it('lists Homer plus his three kids, with Homer active after a fresh login', async () => {
    const result = await runListProxyTargets(session)

    expect(result.count).toBe(4)
    const self = result.patients.find((p) => p.is_self)!
    expect(self.name).toContain('Homer')
    expect(self.is_active).toBe(true)
    expect(self.id).not.toBe('')

    const kids = result.patients.filter((p) => !p.is_self).map((p) => p.name)
    expect(kids).toContain('Bart Simpson')
    expect(kids).toHaveLength(3)
    expect(result.active_patient).toContain('Homer')
  })

  it('guards reads: self passes, a named child refuses with the fix', async () => {
    await expect(assertProxyReadContext(session)).resolves.toBeUndefined()
    await expect(assertProxyReadContext(session, 'me')).resolves.toBeUndefined()

    await expect(assertProxyReadContext(session, 'Bart')).rejects.toThrow(/switch_proxy_target/)
  })

  it('switches to Bart, verified against his profile, and scrapers read his chart', async () => {
    const result = await runSwitchProxyTarget(session, 'bart')

    expect(result.switched_to).toBe('Bart Simpson')
    expect(result.is_self).toBe(false)
    // The proxy dropdown says "Bart Simpson"; the profile page carries the
    // legal name. The verification layer accepts the short form.
    expect(result.verified_profile_name).toContain('Simpson')

    const profile = await getMyChartProfile(session)
    expect(profile?.name).toContain('Bart')

    // A category read now genuinely serves the child's data.
    await expect(assertProxyReadContext(session, 'Bart')).resolves.toBeUndefined()
    const meds = await getMedications(session)
    expect(JSON.stringify(meds)).not.toContain('Lisinopril') // Homer's, not Bart's
  })

  it('refuses an unqualified (account holder) read while switched to Bart', async () => {
    await expect(assertProxyReadContext(session)).rejects.toThrow(/Bart/)
  })

  it('switches back to the account holder with "me"', async () => {
    const result = await runSwitchProxyTarget(session, 'me')

    expect(result.is_self).toBe(true)
    expect(result.switched_to).toContain('Homer')

    await expect(assertProxyReadContext(session)).resolves.toBeUndefined()
    const profile = await getMyChartProfile(session)
    expect(profile?.name).toContain('Homer')
  })

  it('refuses to guess on an ambiguous name', async () => {
    await expect(runSwitchProxyTarget(session, 'Simpson')).rejects.toThrow(/matches/)
  })

  it('treats marge (no proxy access) as a single-record account', async () => {
    const login = await myChartUserPassLogin({
      hostname: HOST,
      user: 'marge',
      pass: 'donuts123',
      protocol: 'http',
    })
    expect(login.state).toBe('need_2fa')
    if (login.state !== 'need_2fa') return
    const finished = await complete2faFlow({
      mychartRequest: login.mychartRequest,
      code: '123456',
      isTOTP: true,
    })
    expect(finished.state).toBe('logged_in')
    if (finished.state !== 'logged_in') return
    const marge = finished.mychartRequest

    // MyChart still lists the account holder's own record on the proxy
    // surface even when there is nothing to switch to.
    const listed = await runListProxyTargets(marge)
    expect(listed.count).toBe(1)
    expect(listed.patients[0]!.is_self).toBe(true)
    expect(listed.message).toContain('No other patient records')

    await expect(assertProxyReadContext(marge)).resolves.toBeUndefined()
    await expect(assertProxyReadContext(marge, 'me')).resolves.toBeUndefined()
    await expect(assertProxyReadContext(marge, 'Bart')).rejects.toThrow(/No patient record matches 'Bart'/)
    await expect(runSwitchProxyTarget(marge, 'Bart')).rejects.toThrow(/No patient record matches 'Bart'/)
  }, 20_000)
})
