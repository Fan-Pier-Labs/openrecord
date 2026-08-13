/**
 * Tests for the in-flight 2FA login store.
 *
 * Entries hold a live MyChartRequest plus the user's password while they read a
 * code off their phone, so the behaviour that matters is that an id is
 * single-use and that nothing outlives its TTL. The clock is faked rather than
 * waiting out the 10-minute expiry.
 */
import { describe, it, expect, beforeEach, afterEach, setSystemTime } from 'bun:test'
import type { MyChartRequest } from '../../../scrapers/myChart/myChartRequest'
import { addPending, takePending, discardPending } from '../pending-logins'

const TTL_MS = 10 * 60_000

const START = new Date('2026-03-01T12:00:00.000Z').getTime()
let now = START

/**
 * Move the faked clock forward.
 *
 * `setSystemTime` rather than reassigning `Date.now`: it fakes the whole Date
 * surface, so the store is free to read the clock any way it likes without
 * these tests quietly reverting to real time and taking ten minutes to notice.
 */
function advance(ms: number): void {
  now += ms
  setSystemTime(new Date(now))
}

beforeEach(() => {
  now = START
  setSystemTime(new Date(now))
})

afterEach(() => {
  setSystemTime()
})

const session = () => ({}) as MyChartRequest

const entry = (username = 'homer') => ({
  hostname: 'mychart.example.org',
  username,
  password: 'donuts123',
  mychartRequest: session(),
})

describe('addPending', () => {
  it('returns an id that retrieves the entry', () => {
    const id = addPending(entry())
    expect(takePending(id)?.username).toBe('homer')
  })

  it('gives every attempt a distinct id', () => {
    expect(addPending(entry('a'))).not.toBe(addPending(entry('b')))
  })

  it('keeps concurrent attempts independent', () => {
    const a = addPending(entry('homer'))
    const b = addPending(entry('marge'))

    expect(takePending(a)?.username).toBe('homer')
    expect(takePending(b)?.username).toBe('marge')
  })
})

describe('takePending', () => {
  it('is single-use — a replayed id returns nothing', () => {
    // The id reaches the model in chat, so it must not stay redeemable.
    const id = addPending(entry())

    expect(takePending(id)).not.toBeNull()
    expect(takePending(id)).toBeNull()
  })

  it('returns null for an id that was never issued', () => {
    expect(takePending('not-a-real-id')).toBeNull()
  })

  it('carries the session and credentials back to the caller', () => {
    const req = session()
    const id = addPending({ ...entry(), mychartRequest: req })

    const taken = takePending(id)
    expect(taken?.mychartRequest).toBe(req)
    expect(taken?.password).toBe('donuts123')
    expect(taken?.hostname).toBe('mychart.example.org')
  })
})

describe('expiry', () => {
  it('still resolves just before the TTL elapses', () => {
    const id = addPending(entry())
    advance(TTL_MS - 1)

    expect(takePending(id)).not.toBeNull()
  })

  it('drops an entry once the TTL has passed', () => {
    const id = addPending(entry())
    advance(TTL_MS + 1)

    expect(takePending(id)).toBeNull()
  })

  it('sweeps stale entries when a new attempt starts', () => {
    // gc runs on add, so a stale password does not sit in memory indefinitely
    // just because nobody called takePending.
    const stale = addPending(entry('stale'))
    advance(TTL_MS + 1)
    addPending(entry('fresh'))

    expect(takePending(stale)).toBeNull()
  })

  it('leaves an unexpired entry alone while sweeping', () => {
    const old = addPending(entry('old'))
    advance(TTL_MS - 1)
    addPending(entry('new'))

    expect(takePending(old)?.username).toBe('old')
  })
})

describe('discardPending', () => {
  it('makes the id unusable', () => {
    const id = addPending(entry())
    discardPending(id)

    expect(takePending(id)).toBeNull()
  })

  it('is safe for an unknown id', () => {
    expect(() => discardPending('nope')).not.toThrow()
  })

  it('leaves other attempts untouched', () => {
    const a = addPending(entry('a'))
    const b = addPending(entry('b'))

    discardPending(a)

    expect(takePending(b)?.username).toBe('b')
  })
})
