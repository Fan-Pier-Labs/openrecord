/**
 * Tests for the extension's multi-account session manager.
 *
 * `./memfs` replaces `fs` with a Map for the credential store's paths, so
 * `adoptSession` persisting cookies touches no disk.
 *
 * `adoptSession` also starts a 30s keepalive interval per session. Every test
 * that adopts must clear the session afterwards or the process will not exit.
 *
 * Sessions are keyed by (hostname, username). The public API takes an account
 * ref — `username@hostname`, or a bare hostname when that resolves to exactly
 * one saved login.
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
  // Refs resolve against the account list, so tests register their accounts.
  store.upsertAccount({ hostname: 'mychart.example.org', username: 'homer', password: 'donuts123' })
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
  it('is false for an account that was never adopted', () => {
    expect(sessionManager.isConnected('homer@mychart.example.org')).toBe(false)
  })

  it('is true after a session is adopted', async () => {
    await sessionManager.adoptSession('mychart.example.org', 'homer', fakeSession())
    expect(sessionManager.isConnected('homer@mychart.example.org')).toBe(true)
  })

  it('resolves a bare hostname when only one login is saved for it', async () => {
    await sessionManager.adoptSession('mychart.example.org', 'homer', fakeSession())
    expect(sessionManager.isConnected('HTTPS://MyChart.Example.ORG/MyChart')).toBe(true)
  })

  it('is per login, not per hostname', async () => {
    store.upsertAccount({ hostname: 'mychart.example.org', username: 'marge', password: 'donuts123' })
    await sessionManager.adoptSession('mychart.example.org', 'homer', fakeSession())

    expect(sessionManager.isConnected('homer@mychart.example.org')).toBe(true)
    expect(sessionManager.isConnected('marge@mychart.example.org')).toBe(false)
  })

  it('is false again after the session is cleared', async () => {
    await sessionManager.adoptSession('mychart.example.org', 'homer', fakeSession())
    sessionManager.clearSession('homer@mychart.example.org')
    expect(sessionManager.isConnected('homer@mychart.example.org')).toBe(false)
  })
})

describe('adoptSession', () => {
  it('persists the cookie state to disk under the login', async () => {
    await sessionManager.adoptSession('mychart.example.org', 'homer', fakeSession())
    expect(store.readAccountSession('mychart.example.org', 'homer')).toBeDefined()
  })

  it('keeps accounts independent', async () => {
    store.upsertAccount({ hostname: 'a.example.org', username: 'homer', password: 'x' })
    store.upsertAccount({ hostname: 'b.example.org', username: 'homer', password: 'x' })
    await sessionManager.adoptSession('a.example.org', 'homer', fakeSession('a.example.org'))
    await sessionManager.adoptSession('b.example.org', 'homer', fakeSession('b.example.org'))

    expect(sessionManager.isConnected('a.example.org')).toBe(true)
    expect(sessionManager.isConnected('b.example.org')).toBe(true)

    sessionManager.clearSession('a.example.org')
    expect(sessionManager.isConnected('a.example.org')).toBe(false)
    expect(sessionManager.isConnected('b.example.org')).toBe(true)
  })

  it('keeps two logins on one hostname independent', async () => {
    store.upsertAccount({ hostname: 'mychart.example.org', username: 'marge', password: 'x' })
    await sessionManager.adoptSession('mychart.example.org', 'homer', fakeSession())
    await sessionManager.adoptSession('mychart.example.org', 'marge', fakeSession())

    sessionManager.clearSession('homer@mychart.example.org')

    expect(sessionManager.isConnected('homer@mychart.example.org')).toBe(false)
    expect(sessionManager.isConnected('marge@mychart.example.org')).toBe(true)
  })

  it('replaces an existing session for the same login', async () => {
    await sessionManager.adoptSession('mychart.example.org', 'homer', fakeSession())
    await sessionManager.adoptSession('mychart.example.org', 'homer', fakeSession())
    expect(sessionManager.isConnected('homer@mychart.example.org')).toBe(true)
  })
})

describe('persistSession', () => {
  it('writes serialized cookie state under the normalized hostname and username', async () => {
    await sessionManager.persistSession('HTTPS://MyChart.Example.ORG/', ' Homer ', fakeSession())
    expect(store.readAccountSession('mychart.example.org', 'homer')).toBeDefined()
  })

  it('swallows a serialization failure rather than breaking the caller', async () => {
    // Losing the disk cache costs a re-login; throwing would fail the tool call.
    const req = fakeSession()
    req.serialize = (async () => {
      throw new Error('boom')
    }) as typeof req.serialize

    await expect(
      sessionManager.persistSession('mychart.example.org', 'homer', req),
    ).resolves.toBeUndefined()
  })
})

describe('clearAllSessions', () => {
  it('disconnects every account', async () => {
    store.upsertAccount({ hostname: 'a.example.org', username: 'homer', password: 'x' })
    store.upsertAccount({ hostname: 'b.example.org', username: 'homer', password: 'x' })
    await sessionManager.adoptSession('a.example.org', 'homer', fakeSession('a.example.org'))
    await sessionManager.adoptSession('b.example.org', 'homer', fakeSession('b.example.org'))

    sessionManager.clearAllSessions()

    expect(sessionManager.isConnected('a.example.org')).toBe(false)
    expect(sessionManager.isConnected('b.example.org')).toBe(false)
  })

  it('is safe to call when nothing is connected', () => {
    expect(() => sessionManager.clearAllSessions()).not.toThrow()
  })
})

describe('clearSession', () => {
  it('is safe for an unknown account', () => {
    expect(() => sessionManager.clearSession('nope.example.org')).not.toThrow()
  })

  it('leaves the on-disk session cache alone', async () => {
    // clearSession drops the in-memory entry; the cookie cache is what lets the
    // next call skip a full login, so it must survive.
    await sessionManager.adoptSession('mychart.example.org', 'homer', fakeSession())
    sessionManager.clearSession('homer@mychart.example.org')

    expect(store.readAccountSession('mychart.example.org', 'homer')).toBeDefined()
  })
})

describe('resolveSession', () => {
  it('rejects an empty ref with a message naming the fix', async () => {
    await expect(sessionManager.resolveSession('')).rejects.toThrow('account is required')
  })

  it('tells the user to run setup when nothing is configured', async () => {
    memfs.reset() // drop the beforeEach account
    await expect(sessionManager.resolveSession('mychart.example.org')).rejects.toThrow(
      'No MyChart accounts configured',
    )
  })

  it('lists the configured account ids when the requested one is unknown', async () => {
    await expect(sessionManager.resolveSession('b.example.org')).rejects.toThrow(
      /not configured. Configured accounts: homer@mychart\.example\.org/,
    )
  })

  it('refuses a bare hostname that several logins share, naming them', async () => {
    store.upsertAccount({ hostname: 'mychart.example.org', username: 'marge', password: 'x' })

    await expect(sessionManager.resolveSession('mychart.example.org')).rejects.toThrow(
      /matches several saved logins: homer@mychart\.example\.org, marge@mychart\.example\.org/,
    )
  })

  it('reuses an adopted session instead of logging in again', async () => {
    const adopted = fakeSession()
    await sessionManager.adoptSession('mychart.example.org', 'homer', adopted)

    expect(await sessionManager.resolveSession('homer@mychart.example.org')).toBe(adopted)
  })

  it('resolves a bare hostname to its one login\'s session', async () => {
    const adopted = fakeSession()
    await sessionManager.adoptSession('mychart.example.org', 'homer', adopted)

    expect(await sessionManager.resolveSession('mychart.example.org')).toBe(adopted)
  })
})
