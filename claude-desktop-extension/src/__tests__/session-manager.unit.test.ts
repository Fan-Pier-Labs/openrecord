/**
 * Tests for the extension's multi-account session manager.
 *
 * `./memfs` replaces `fs` with a Map for the credential store's paths, so
 * `adoptSession` persisting cookies touches no disk.
 *
 * `adoptSession` also starts a 30s keepalive interval per session. Every test
 * that adopts must clear the session afterwards or the process will not exit.
 */
import { describe, it, expect, beforeEach, afterEach, afterAll, mock } from 'bun:test'
import { MyChartRequest } from '../../../scrapers/myChart/myChartRequest'
import * as memfs from './memfs'

const store = await import('../credential-store')
const sessionManager = await import('../session-manager')

afterAll(() => {
  sessionManager.clearAllSessions()
})

beforeEach(() => {
  memfs.reset()
})

afterEach(() => {
  // Stops the keepalive timers adoptSession installs.
  sessionManager.clearAllSessions()
})

function fakeSession(hostname = 'mychart.example.org') {
  const req = new MyChartRequest(hostname)
  req.firstPathPart = 'MyChart'
  req.transport = mock(async () => new Response('1', { status: 200 })) as typeof req.transport
  return req
}

describe('isConnected', () => {
  it('is false for a hostname that was never adopted', () => {
    expect(sessionManager.isConnected('mychart.example.org')).toBe(false)
  })

  it('is true after a session is adopted', async () => {
    await sessionManager.adoptSession('mychart.example.org', fakeSession())
    expect(sessionManager.isConnected('mychart.example.org')).toBe(true)
  })

  it('matches regardless of how the hostname is written', async () => {
    await sessionManager.adoptSession('mychart.example.org', fakeSession())
    expect(sessionManager.isConnected('HTTPS://MyChart.Example.ORG/MyChart')).toBe(true)
  })

  it('is false again after the session is cleared', async () => {
    await sessionManager.adoptSession('mychart.example.org', fakeSession())
    sessionManager.clearSession('mychart.example.org')
    expect(sessionManager.isConnected('mychart.example.org')).toBe(false)
  })
})

describe('adoptSession', () => {
  it('persists the cookie state to disk', async () => {
    await sessionManager.adoptSession('mychart.example.org', fakeSession())
    expect(store.readAccountSession('mychart.example.org')).toBeDefined()
  })

  it('keeps accounts independent', async () => {
    await sessionManager.adoptSession('a.example.org', fakeSession('a.example.org'))
    await sessionManager.adoptSession('b.example.org', fakeSession('b.example.org'))

    expect(sessionManager.isConnected('a.example.org')).toBe(true)
    expect(sessionManager.isConnected('b.example.org')).toBe(true)

    sessionManager.clearSession('a.example.org')
    expect(sessionManager.isConnected('a.example.org')).toBe(false)
    expect(sessionManager.isConnected('b.example.org')).toBe(true)
  })

  it('replaces an existing session for the same host', async () => {
    await sessionManager.adoptSession('mychart.example.org', fakeSession())
    await sessionManager.adoptSession('mychart.example.org', fakeSession())
    expect(sessionManager.isConnected('mychart.example.org')).toBe(true)
  })
})

describe('persistSession', () => {
  it('writes serialized cookie state under the normalized hostname', async () => {
    await sessionManager.persistSession('HTTPS://MyChart.Example.ORG/', fakeSession())
    expect(store.readAccountSession('mychart.example.org')).toBeDefined()
  })

  it('swallows a serialization failure rather than breaking the caller', async () => {
    // Losing the disk cache costs a re-login; throwing would fail the tool call.
    const req = fakeSession()
    req.serialize = (async () => {
      throw new Error('boom')
    }) as typeof req.serialize

    await expect(sessionManager.persistSession('mychart.example.org', req)).resolves.toBeUndefined()
  })
})

describe('clearAllSessions', () => {
  it('disconnects every account', async () => {
    await sessionManager.adoptSession('a.example.org', fakeSession('a.example.org'))
    await sessionManager.adoptSession('b.example.org', fakeSession('b.example.org'))

    sessionManager.clearAllSessions()

    expect(sessionManager.isConnected('a.example.org')).toBe(false)
    expect(sessionManager.isConnected('b.example.org')).toBe(false)
  })

  it('is safe to call when nothing is connected', () => {
    expect(() => sessionManager.clearAllSessions()).not.toThrow()
  })
})

describe('clearSession', () => {
  it('is safe for an unknown hostname', () => {
    expect(() => sessionManager.clearSession('nope.example.org')).not.toThrow()
  })

  it('leaves the on-disk session cache alone', async () => {
    // clearSession drops the in-memory entry; the cookie cache is what lets the
    // next call skip a full login, so it must survive.
    await sessionManager.adoptSession('mychart.example.org', fakeSession())
    sessionManager.clearSession('mychart.example.org')

    expect(store.readAccountSession('mychart.example.org')).toBeDefined()
  })
})

describe('resolveSession', () => {
  it('rejects an empty hostname with a message naming the fix', async () => {
    await expect(sessionManager.resolveSession('')).rejects.toThrow('account is required')
  })

  it('tells the user to run setup when nothing is configured', async () => {
    await expect(sessionManager.resolveSession('mychart.example.org')).rejects.toThrow(
      'No MyChart accounts configured',
    )
  })

  it('lists the configured accounts when the requested one is unknown', async () => {
    store.upsertAccount({ hostname: 'a.example.org', username: 'homer', password: 'donuts123' })

    await expect(sessionManager.resolveSession('b.example.org')).rejects.toThrow(
      /not configured. Configured accounts: a\.example\.org/,
    )
  })

  it('reuses an adopted session instead of logging in again', async () => {
    store.upsertAccount({
      hostname: 'mychart.example.org',
      username: 'homer',
      password: 'donuts123',
    })
    const adopted = fakeSession()
    await sessionManager.adoptSession('mychart.example.org', adopted)

    expect(await sessionManager.resolveSession('mychart.example.org')).toBe(adopted)
  })
})
