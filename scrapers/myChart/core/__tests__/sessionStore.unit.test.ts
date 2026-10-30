// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { describe, it, expect, afterEach } from 'bun:test'
import { sessionStore } from '../sessionStore'
import type { MyChartRequest } from '../myChartRequest'

// What /Home serves once MyChart has dropped the session: its login page.
const SIGNED_OUT_HOME = '<form action="/MyChart/Authentication/Login/DoLogin" method="post"></form>'
const SIGNED_IN_HOME = '<html><body><div id="md_home_index"></div></body></html>'

function homeResponse(body: string) {
  return { status: 200, url: 'https://test.example.com/MyChart/Home', headers: new Headers({ 'content-type': 'text/html' }), text: async () => body }
}

function makeMockRequest(overrides: { status?: number; location?: string; body?: string } = {}) {
  const status = overrides.status ?? 200
  const body = overrides.body ?? '1'
  const headers = new Headers()
  if (overrides.location) headers.set('Location', overrides.location)

  return {
    makeRequest: async ({ path }: { path?: string }) =>
      path === '/Home' ? homeResponse(SIGNED_OUT_HOME) : { status, headers, text: async () => body },
    serialize: async () => '{}',
    getCookieInfo: () => ({ count: 5, names: ['cookie1'] }),
    hostname: 'test.example.com',
    firstPathPart: '/MyChart',
  } as unknown as MyChartRequest
}

afterEach(() => {
  // Clean up sessions after each test
  for (const [token] of sessionStore.all()) {
    sessionStore.delete(token)
  }
  sessionStore.stopKeepalive()
})

describe('sessionStore', () => {
  it('set and get', () => {
    const req = makeMockRequest()
    sessionStore.set('token-1', req)
    expect(sessionStore.get('token-1')).toBe(req)
    expect(sessionStore.has('token-1')).toBe(true)
  })

  it('getEntry returns full entry', () => {
    const req = makeMockRequest()
    sessionStore.set('token-2', req, { hostname: 'custom.host' })
    const entry = sessionStore.getEntry('token-2')
    expect(entry).toBeDefined()
    expect(entry!.hostname).toBe('custom.host')
    expect(entry!.status).toBe('logged_in')
    expect(entry!.request).toBe(req)
  })

  it('get returns undefined for missing token', () => {
    expect(sessionStore.get('nonexistent')).toBeUndefined()
  })

  it('delete removes session', () => {
    sessionStore.set('token-3', makeMockRequest())
    expect(sessionStore.has('token-3')).toBe(true)
    sessionStore.delete('token-3')
    expect(sessionStore.has('token-3')).toBe(false)
  })

  it('setStatus updates status', () => {
    sessionStore.set('token-4', makeMockRequest())
    expect(sessionStore.getEntry('token-4')!.status).toBe('logged_in')
    sessionStore.setStatus('token-4', 'expired')
    expect(sessionStore.getEntry('token-4')!.status).toBe('expired')
  })

  it('active() only returns logged_in sessions', () => {
    sessionStore.set('active-1', makeMockRequest())
    sessionStore.set('expired-1', makeMockRequest())
    sessionStore.setStatus('expired-1', 'expired')
    sessionStore.set('active-2', makeMockRequest())

    const active = sessionStore.active()
    expect(active.length).toBe(2)
    expect(active.map(([id]) => id).sort()).toEqual(['active-1', 'active-2'])
  })

  it('size tracks session count', () => {
    expect(sessionStore.size).toBe(0)
    sessionStore.set('s1', makeMockRequest())
    sessionStore.set('s2', makeMockRequest())
    expect(sessionStore.size).toBe(2)
    sessionStore.delete('s1')
    expect(sessionStore.size).toBe(1)
  })
})

describe('sessionStore keepalive', () => {
  it('runKeepalive marks expired sessions when keepalive returns 0', async () => {
    const req = makeMockRequest({ status: 200, body: '0' })
    sessionStore.set('expire-me', req)
    await sessionStore.runKeepalive()
    expect(sessionStore.getEntry('expire-me')!.status).toBe('expired')
  })

  it('runKeepalive keeps alive sessions on 200', async () => {
    const req = makeMockRequest({ status: 200 })
    sessionStore.set('keep-me', req)
    await sessionStore.runKeepalive()
    expect(sessionStore.getEntry('keep-me')!.status).toBe('logged_in')
  })

  it('runKeepalive marks error only after 3 consecutive throws', async () => {
    const req = {
      makeRequest: async () => { throw new Error('fail') },
      getCookieInfo: () => ({ count: 0, names: [] }),
      hostname: 'test.example.com',
    } as unknown as MyChartRequest
    sessionStore.set('error-me', req)
    await sessionStore.runKeepalive()
    expect(sessionStore.getEntry('error-me')!.status).toBe('logged_in') // 1st failure — not yet
    await sessionStore.runKeepalive()
    expect(sessionStore.getEntry('error-me')!.status).toBe('logged_in') // 2nd failure — not yet
    await sessionStore.runKeepalive()
    expect(sessionStore.getEntry('error-me')!.status).toBe('error') // 3rd failure → marked error
  })

  it('runKeepalive calls both keepalive endpoints per session', async () => {
    let callCount = 0
    const req = {
      makeRequest: async () => { callCount++; return { status: 200, headers: new Headers(), text: async () => '1' } },
      getCookieInfo: () => ({ count: 5, names: [] }),
      hostname: 'test.example.com',
    } as unknown as MyChartRequest
    sessionStore.set('count-me', req)
    await sessionStore.runKeepalive()
    expect(callCount).toBe(2)
  })

  describe('renewal', () => {
    function makeRenewableRequest() {
      const state = { body: '0', home: SIGNED_OUT_HOME, homeFetches: 0, renewals: 0 }
      const request = {
        makeRequest: async ({ path }: { path?: string }) => {
          if (path !== '/Home') return { status: 200, headers: new Headers(), text: async () => state.body }
          state.homeFetches++
          return homeResponse(state.home)
        },
        getCookieInfo: () => ({ count: 5, names: [] }),
        hostname: 'test.example.com',
        reauthenticate: async () => { state.renewals++; return true },
      } as unknown as MyChartRequest
      return { request, state }
    }

    it('stops renewing a session the heartbeat reports dead again right after a renewal', async () => {
      const { request, state } = makeRenewableRequest()
      sessionStore.set('loop', request)

      await sessionStore.runKeepalive()
      expect(state.renewals).toBe(1)
      expect(sessionStore.getEntry('loop')!.status).toBe('logged_in')

      await sessionStore.runKeepalive()
      expect(state.renewals).toBe(1)
      expect(sessionStore.getEntry('loop')!.status).toBe('expired')

      // A real request renewing it puts it back in rotation, but the
      // heartbeat still doesn't log in again on its own.
      sessionStore.registerForKeepalive(request)
      await sessionStore.runKeepalive()
      expect(state.renewals).toBe(1)
      expect(sessionStore.getEntry('loop')!.status).toBe('expired')
    })

    it('renews again once a ping has reported the renewed session alive', async () => {
      const { request, state } = makeRenewableRequest()
      sessionStore.set('recovers', request)

      await sessionStore.runKeepalive()
      state.body = '1'
      await sessionStore.runKeepalive()
      state.body = '0'
      await sessionStore.runKeepalive()

      expect(state.renewals).toBe(2)
      expect(sessionStore.getEntry('recovers')!.status).toBe('logged_in')
    })

    it('believes a signed-in /Home over a heartbeat that says the session is dead', async () => {
      const { request, state } = makeRenewableRequest()
      state.home = SIGNED_IN_HOME
      sessionStore.set('lying-heartbeat', request)

      await sessionStore.runKeepalive()
      await sessionStore.runKeepalive()

      expect(state.renewals).toBe(0)
      expect(state.homeFetches).toBe(1)
      expect(sessionStore.getEntry('lying-heartbeat')!.status).toBe('logged_in')
    })
  })

  it('startKeepalive is idempotent', () => {
    const stop1 = sessionStore.startKeepalive()
    const stop2 = sessionStore.startKeepalive()
    stop1()
    stop2() // should not throw
  })

  it('stopKeepalive is safe when not started', () => {
    sessionStore.stopKeepalive() // should not throw
  })
})
