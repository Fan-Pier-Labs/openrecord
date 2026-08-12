import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { MyChartRequest } from '../myChartRequest'
import { hostLimiterStats, resetHostLimiters } from '../../../shared/hostConcurrency'
import { MAX_CONCURRENT_REQUESTS_PER_HOST as LIMIT } from '../../../shared/env'
import { silenceLogger, resetLogSink } from '../../../shared/logger'

/**
 * The per-host cap applied inside makeRequest.
 *
 * A full scrape fans out ~30 scrapers at once against one hospital, so the cap
 * exists to keep that burst from looking like an attack. These tests cover the
 * two things that would make it useless or harmful: not actually capping, and
 * deadlocking on redirects.
 */

const tick = () => new Promise((r) => setTimeout(r, 0))

function deferred<T = void>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

describe('makeRequest per-host concurrency', () => {
  beforeEach(() => {
    silenceLogger()
    resetHostLimiters()
  })

  afterEach(() => {
    resetHostLimiters()
    resetLogSink()
  })

  it('caps simultaneous requests from independent sessions to the same host', async () => {
    // Two users' sessions against one hospital — separate MyChartRequest
    // objects, one shared limiter, because the far end counts connections.
    const gate = deferred()
    let inFlight = 0
    let peak = 0

    const sessions = Array.from({ length: 4 }, () => {
      const req = new MyChartRequest('mychart.example.org')
      req.transport = (async () => {
        inFlight += 1
        peak = Math.max(peak, inFlight)
        await gate.promise
        inFlight -= 1
        return new Response('{}', { status: 200 })
      }) as typeof req.transport
      return req
    })

    // Each session fires more requests than the whole host is allowed.
    const perSession = LIMIT
    const runs = sessions.flatMap((req) =>
      Array.from({ length: perSession }, (_, i) => req.makeRequest({ path: `/Clinical/${i}` })),
    )

    await tick()
    expect(peak).toBe(LIMIT)

    gate.resolve()
    await Promise.all(runs)
    expect(peak).toBe(LIMIT)
  })

  it('does not deadlock when saturated requests all follow redirects', async () => {
    // The permit is taken per fetch, not per makeRequest call. If it were held
    // across the redirect recursion, every one of these would be holding a
    // permit while waiting for a second one, and nothing would ever complete.
    const req = new MyChartRequest('mychart.example.org')
    const hops = 3

    req.transport = (async (url: string | URL | Request) => {
      const href = url.toString()
      const hop = Number(new URL(href).searchParams.get('hop') ?? '0')
      // Yield, so a naive implementation reliably saturates before any
      // request gets to its second hop.
      await tick()
      if (hop < hops) {
        return new Response('', {
          status: 302,
          headers: { Location: `https://mychart.example.org/Home?hop=${hop + 1}` },
        })
      }
      return new Response('{}', { status: 200 })
    }) as typeof req.transport

    const concurrent = LIMIT * 2
    const responses = await Promise.all(
      Array.from({ length: concurrent }, () => req.makeRequest({ path: '/Home?hop=0' })),
    )

    expect(responses).toHaveLength(concurrent)
    expect(responses.every((r) => r.status === 200)).toBe(true)
    expect(hostLimiterStats()['mychart.example.org']).toEqual({
      inFlight: 0,
      queued: 0,
      limit: LIMIT,
    })
  })

  it('charges a cross-host redirect to the host it lands on', async () => {
    // patients.mycslink.org → mycslink.cedars-sinai.org: the second host gets
    // its own budget instead of spending the vanity hostname's.
    const req = new MyChartRequest('patients.mycslink.org')

    req.transport = (async (url: string | URL | Request) => {
      const href = url.toString()
      if (href.includes('patients.mycslink.org')) {
        return new Response('', {
          status: 302,
          headers: { Location: 'https://mycslink.cedars-sinai.org/MyChart/Home' },
        })
      }
      return new Response('{}', { status: 200 })
    }) as typeof req.transport

    const resp = await req.makeRequest({ path: '/Home' })
    expect(resp.status).toBe(200)

    const stats = hostLimiterStats()
    expect(Object.keys(stats).sort()).toEqual([
      'mycslink.cedars-sinai.org',
      'patients.mycslink.org',
    ])
  })

  it('releases the permit when the underlying fetch rejects', async () => {
    const req = new MyChartRequest('mychart.example.org')
    req.transport = (async () => {
      throw new Error('ECONNRESET')
    }) as typeof req.transport

    await expect(req.makeRequest({ path: '/Home' })).rejects.toThrow('ECONNRESET')
    expect(hostLimiterStats()['mychart.example.org']).toEqual({
      inFlight: 0,
      queued: 0,
      limit: LIMIT,
    })
  })

  it('releases the permit when a redirect arrives with no Location header', async () => {
    const req = new MyChartRequest('mychart.example.org')
    req.transport = (async () =>
      new Response('', { status: 302 })) as typeof req.transport

    await expect(req.makeRequest({ path: '/Home' })).rejects.toThrow(
      "302 didn't have a location header",
    )
    expect(hostLimiterStats()['mychart.example.org'].inFlight).toBe(0)
  })

  it('still enforces the cap across a redirect loop that hits the hop limit', async () => {
    // mychart.crossingrivers.org redirects /MyChart/ to itself forever. The cap
    // must survive the 20-hop bailout without stranding permits.
    const req = new MyChartRequest('mychart.example.org')
    req.transport = (async () =>
      new Response('', {
        status: 302,
        headers: { Location: 'https://mychart.example.org/MyChart/' },
      })) as typeof req.transport

    const responses = await Promise.all(
      Array.from({ length: LIMIT + 5 }, () => req.makeRequest({ path: '/MyChart/' })),
    )

    expect(responses.every((r) => r.status === 302)).toBe(true)
    expect(hostLimiterStats()['mychart.example.org']).toEqual({
      inFlight: 0,
      queued: 0,
      limit: LIMIT,
    })
  })
})
