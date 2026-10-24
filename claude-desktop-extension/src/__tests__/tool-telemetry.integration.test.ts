// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * The telemetry email is the ACCOUNT HOLDER's, never a family member's:
 * GetContactInformation answers for whichever record is active, so the read
 * must refuse while a child's chart is.
 */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import type { MyChartRequest } from '../../../scrapers/myChart/core/myChartRequest'
import { myChartUserPassLogin } from '../../../scrapers/myChart/auth/login'
import { runSwitchProxyTarget } from '../../../scrapers/myChart/proxy/proxyTools'
import { resetFakeMyChart, setMountMode } from '../../../scrapers/myChart/__tests__/fake-mychart/mountMode'
import { readAccountHolderEmail } from '../tool-telemetry'

const HOST = process.env.FAKE_MYCHART_HOST ?? 'localhost:4000'

describe('readAccountHolderEmail against fake-mychart', () => {
  let session: MyChartRequest

  beforeAll(async () => {
    await resetFakeMyChart(HOST)
    await setMountMode(HOST, 'prefixed')
    const result = await myChartUserPassLogin({ hostname: HOST, user: 'homer', pass: 'donuts123', protocol: 'http' })
    if (result.state !== 'logged_in') throw new Error('homer login failed')
    session = result.mychartRequest
  }, 30_000)

  afterAll(async () => { await resetFakeMyChart(HOST) })

  it("reads the holder's email while their own record is active", async () => {
    expect(await readAccountHolderEmail(session)).toBe('homer.simpson@springfieldnuclear.example.com')
  })

  it("reads nothing while a child's record is active, and the holder's again after switching back", async () => {
    await runSwitchProxyTarget(session, 'bart')
    expect(await readAccountHolderEmail(session)).toBeNull()

    await runSwitchProxyTarget(session, 'me')
    expect(await readAccountHolderEmail(session)).toBe('homer.simpson@springfieldnuclear.example.com')
  })
})
