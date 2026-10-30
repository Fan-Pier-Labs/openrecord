// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { describe, it, expect, afterEach, setSystemTime } from 'bun:test'
import { AutoReloginPausedError, renewMyChartSession, resumeAutomaticRelogin } from '../sessionRenewal'
import type { MyChartRequest } from '../myChartRequest'

function makeRequest() {
  const state = { logins: 0 }
  const request = {
    hostname: 'test.example.com',
    reauthenticate: async () => { state.logins++; return true },
  } as unknown as MyChartRequest
  return { request, state }
}

afterEach(() => {
  setSystemTime()
})

describe('renewMyChartSession hourly cap', () => {
  it('signs in 10 times in an hour, then refuses without signing in', async () => {
    const { request, state } = makeRequest()
    for (let i = 0; i < 10; i++) expect(await renewMyChartSession(request)).toBe(true)

    await expect(renewMyChartSession(request)).rejects.toBeInstanceOf(AutoReloginPausedError)
    expect(state.logins).toBe(10)
  })

  it('signs in again once the user resumes it', async () => {
    const { request, state } = makeRequest()
    for (let i = 0; i < 10; i++) await renewMyChartSession(request)
    await expect(renewMyChartSession(request)).rejects.toBeInstanceOf(AutoReloginPausedError)

    resumeAutomaticRelogin(request)
    expect(await renewMyChartSession(request)).toBe(true)
    expect(state.logins).toBe(11)
  })

  it('stops counting attempts more than an hour old', async () => {
    const { request, state } = makeRequest()
    setSystemTime(new Date('2026-10-30T10:00:00Z'))
    for (let i = 0; i < 10; i++) await renewMyChartSession(request)

    setSystemTime(new Date('2026-10-30T11:00:01Z'))
    expect(await renewMyChartSession(request)).toBe(true)
    expect(state.logins).toBe(11)
  })

  it('counts concurrent callers sharing one sign-in as one attempt', async () => {
    const { request, state } = makeRequest()
    for (let i = 0; i < 10; i++) {
      await Promise.all([renewMyChartSession(request), renewMyChartSession(request), renewMyChartSession(request)])
    }
    expect(state.logins).toBe(10)
  })
})
