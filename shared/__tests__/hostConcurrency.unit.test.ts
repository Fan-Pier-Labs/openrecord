import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import {
  withHostLimit,
  hostKeyForUrl,
  hostLimiterStats,
  resetHostLimiters,
} from '../hostConcurrency'
import {
  MAX_CONCURRENT_REQUESTS_PER_HOST as LIMIT,
  DEFAULT_MAX_CONCURRENT_REQUESTS_PER_HOST,
  __parseMaxConcurrencyForTest as parseMaxConcurrency,
} from '../env'
import { silenceLogger, resetLogSink } from '../logger'

/** A promise plus the handles to settle it, so a test can hold a request open. */
function deferred<T = void>() {
  let resolve!: (value: T) => void
  let reject!: (err: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** Let the microtask queue drain so queued acquires can settle. */
const tick = () =>
  new Promise((r) => {
    setTimeout(r, 0)
  })

describe('hostKeyForUrl', () => {
  it('reduces a URL to its host', () => {
    expect(hostKeyForUrl('https://mychart.example.org/MyChart/Clinical/Allergies')).toBe(
      'mychart.example.org',
    )
  })

  it('keeps the port, so two local servers are two hosts', () => {
    expect(hostKeyForUrl('http://localhost:4000/MyChart')).toBe('localhost:4000')
    expect(hostKeyForUrl('http://localhost:4000/MyChart')).not.toBe(
      hostKeyForUrl('http://localhost:4001/MyChart'),
    )
  })

  it('lowercases so casing does not split one host into two buckets', () => {
    expect(hostKeyForUrl('https://MyChart.Example.ORG/x')).toBe('mychart.example.org')
  })

  it('ignores path and query, which carry record ids', () => {
    expect(hostKeyForUrl('https://a.org/x?patientId=WP-123')).toBe(
      hostKeyForUrl('https://a.org/y?patientId=WP-999'),
    )
  })

  it('falls back to the raw string when the URL will not parse', () => {
    expect(hostKeyForUrl('not a url')).toBe('not a url')
  })
})

describe('withHostLimit', () => {
  beforeEach(() => {
    silenceLogger()
    resetHostLimiters()
  })

  afterEach(() => {
    resetHostLimiters()
    resetLogSink()
  })

  it('never lets more than the limit run at once against one host', async () => {
    const overshoot = LIMIT + 15
    let inFlight = 0
    let peak = 0
    const gate = deferred()

    const runs = Array.from({ length: overshoot }, () =>
      withHostLimit('https://mychart.example.org/x', async () => {
        inFlight += 1
        peak = Math.max(peak, inFlight)
        await gate.promise
        inFlight -= 1
      }),
    )

    // Give every call a chance to grab a permit before releasing any of them.
    await tick()
    expect(peak).toBe(LIMIT)
    expect(hostLimiterStats()['mychart.example.org']).toEqual({
      inFlight: LIMIT,
      queued: overshoot - LIMIT,
      limit: LIMIT,
    })

    gate.resolve()
    await Promise.all(runs)

    expect(peak).toBe(LIMIT)
    expect(hostLimiterStats()['mychart.example.org']).toEqual({
      inFlight: 0,
      queued: 0,
      limit: LIMIT,
    })
  })

  it('admits queued callers in the order they arrived', async () => {
    const started: number[] = []
    const gates = new Map<number, ReturnType<typeof deferred<void>>>()

    // Saturate the host, then queue three more behind it.
    const total = LIMIT + 3
    const runs = Array.from({ length: total }, (_, i) => {
      const gate = deferred()
      gates.set(i, gate)
      return withHostLimit('https://mychart.example.org/x', async () => {
        started.push(i)
        await gate.promise
      })
    })

    await tick()
    expect(started).toEqual(Array.from({ length: LIMIT }, (_, i) => i))

    // Release the holders one at a time; each should admit the oldest waiter.
    for (let i = 0; i < 3; i++) {
      gates.get(i)!.resolve()
      await tick()
      expect(started[LIMIT + i]).toBe(LIMIT + i)
    }

    for (const gate of gates.values()) gate.resolve()
    await Promise.all(runs)
  })

  it('releases the permit when the request throws, rather than leaking it', async () => {
    const boom = withHostLimit('https://mychart.example.org/x', async () => {
      throw new Error('connection reset')
    })

    await expect(boom).rejects.toThrow('connection reset')
    expect(hostLimiterStats()['mychart.example.org']).toEqual({
      inFlight: 0,
      queued: 0,
      limit: LIMIT,
    })

    // A leaked permit would show up as the next batch being one short.
    const gate = deferred()
    const runs = Array.from({ length: LIMIT }, () =>
      withHostLimit('https://mychart.example.org/x', () => gate.promise),
    )
    await tick()
    expect(hostLimiterStats()['mychart.example.org']!.inFlight).toBe(LIMIT)

    gate.resolve()
    await Promise.all(runs)
  })

  it('propagates the resolved value', async () => {
    const value = await withHostLimit('https://mychart.example.org/x', async () => 'ok')
    expect(value).toBe('ok')
  })

  it('gives each host its own budget', async () => {
    const gate = deferred()
    let bStarted = false

    // Saturate host A.
    const aRuns = Array.from({ length: LIMIT }, () =>
      withHostLimit('https://a.example.org/x', () => gate.promise),
    )
    await tick()

    // Host B must be unaffected by A being full.
    const bRun = withHostLimit('https://b.example.org/x', async () => {
      bStarted = true
    })
    await tick()
    expect(bStarted).toBe(true)
    await bRun

    gate.resolve()
    await Promise.all(aRuns)
  })

  it('treats a redirect onto another host as that host, not the original', async () => {
    const gate = deferred()
    const runs = Array.from({ length: LIMIT }, () =>
      withHostLimit('https://patients.mycslink.org/x', () => gate.promise),
    )
    await tick()

    let movedStarted = false
    const moved = withHostLimit('https://mycslink.cedars-sinai.org/x', async () => {
      movedStarted = true
    })
    await tick()
    expect(movedStarted).toBe(true)
    await moved

    gate.resolve()
    await Promise.all(runs)
  })
})

describe('concurrency limit configuration', () => {
  it('defaults to 10 when unset', () => {
    expect(parseMaxConcurrency(undefined)).toBe(10)
    expect(DEFAULT_MAX_CONCURRENT_REQUESTS_PER_HOST).toBe(10)
  })

  it('accepts a positive integer override', () => {
    expect(parseMaxConcurrency('4')).toBe(4)
    expect(parseMaxConcurrency('1')).toBe(1)
  })

  it('falls back to the default rather than disabling the limit on bad input', () => {
    for (const bad of ['0', '-5', 'unlimited', '', '2.5', 'NaN']) {
      expect(parseMaxConcurrency(bad)).toBe(DEFAULT_MAX_CONCURRENT_REQUESTS_PER_HOST)
    }
  })
})
