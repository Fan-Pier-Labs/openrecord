// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * fake-mychart's outbox: every SendCode delivers a fresh code there instead of
 * to a phone or inbox, and Validate accepts it. A sign-in can then be finished
 * the way a patient finishes it, by reading the code that was sent.
 *
 * Requires fake-mychart running on FAKE_MYCHART_HOST (default localhost:4000).
 */

import { describe, it, expect, beforeEach } from 'bun:test'
import { myChartUserPassLogin, complete2faFlow } from '../../auth/login'
import { resetFakeMyChart } from './mountMode'
import { readOutbox } from './outbox'

const HOST = process.env.FAKE_MYCHART_HOST ?? 'localhost:4000'

const margeLogin = (skipSendCode = false) =>
  myChartUserPassLogin({ hostname: HOST, user: 'marge', pass: 'donuts123', protocol: 'http', skipSendCode })

describe('fake-mychart outbox', () => {
  beforeEach(async () => {
    process.env.MYCHART_CLI_TELEMETRY_DISABLED = '1'
    await resetFakeMyChart(HOST)
  })

  it('delivers one code per SendCode, and that code finishes the sign-in', async () => {
    const login = await margeLogin()
    expect(login.state).toBe('need_2fa')

    const sent = await readOutbox(HOST, 'marge')
    expect(sent).toHaveLength(1)
    expect(sent[0]!.code).toMatch(/^\d{6}$/)
    expect(sent[0]!.channel).toBe(login.twoFaDelivery!.method)

    const done = await complete2faFlow({ mychartRequest: login.mychartRequest, code: sent[0]!.code })
    expect(done.state).toBe('logged_in')
  }, 15_000)

  it('stays empty when the sign-in skips SendCode', async () => {
    expect((await margeLogin(true)).state).toBe('need_2fa')
    expect(await readOutbox(HOST, 'marge')).toEqual([])
  }, 15_000)

  it('rejects a code it never sent', async () => {
    const login = await margeLogin()
    const sent = (await readOutbox(HOST, 'marge'))[0]!.code
    // Neither the code that was sent nor the fixed 123456 test code.
    const wrong = sent === '999999' ? '999998' : '999999'
    const done = await complete2faFlow({ mychartRequest: login.mychartRequest, code: wrong })
    expect(done.state).toBe('invalid_2fa')
  }, 15_000)

  it('is emptied by /reset', async () => {
    await margeLogin()
    expect(await readOutbox(HOST, 'marge')).toHaveLength(1)
    await resetFakeMyChart(HOST)
    expect(await readOutbox(HOST, 'marge')).toEqual([])
  }, 15_000)

  it('serves a page to a browser', async () => {
    await margeLogin()
    const code = (await readOutbox(HOST, 'marge'))[0]!.code
    const res = await fetch(`http://${HOST}/outbox`, { headers: { Accept: 'text/html' } })
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(await res.text()).toContain(code)
  }, 15_000)
})
