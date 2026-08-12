import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test'
import * as fs from 'fs'
import * as path from 'path'
import { CookieJar } from 'tough-cookie'
import { BROWSER_HEADERS, PLATFORM_OWNS_COOKIES, platformFetch, scraperFetch, setTestTransport } from '../../http'
import { hostLimiterStats, resetHostLimiters } from '../../../shared/hostConcurrency'
import { MAX_CONCURRENT_REQUESTS_PER_HOST as LIMIT } from '../../../shared/env'
import { silenceLogger, resetLogSink } from '../../../shared/logger'

/**
 * scraperFetch is the only outbound path the scrapers have, so these tests pin
 * down the three things every caller inherits by using it: the browser header
 * block, the cookie jar, and the per-host permit. A regression in any of them
 * is invisible at the call sites — the request still works, it just stops
 * looking like a browser or stops being rate limited.
 */

const tick = () => new Promise((r) => setTimeout(r, 0))

function deferred<T = void>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

/** Records what reached the wire and answers 200. */
function recorder() {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const transport = async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return new Response('ok', { status: 200 })
  }
  const headersOf = (i = 0) => calls[i].init.headers as Record<string, string>
  return { calls, transport, headersOf }
}

describe('scraperFetch', () => {
  beforeEach(() => {
    silenceLogger()
    resetHostLimiters()
  })

  afterEach(() => {
    resetHostLimiters()
    resetLogSink()
  })

  describe('browser headers', () => {
    it('sends the Chrome header block on every request', async () => {
      const { transport, headersOf } = recorder()
      await scraperFetch('https://mychart.example.org/Home', {}, { transport })

      for (const [key, value] of Object.entries(BROWSER_HEADERS)) {
        expect(headersOf()[key]).toBe(value)
      }
    })

    it('merges caller headers in, and lets them win over the block', async () => {
      const { transport, headersOf } = recorder()
      await scraperFetch(
        'https://mychart.example.org/Home',
        { headers: { 'X-Requested-With': 'XMLHttpRequest', 'User-Agent': 'custom-agent' } },
        { transport },
      )

      expect(headersOf()['X-Requested-With']).toBe('XMLHttpRequest')
      expect(headersOf()['User-Agent']).toBe('custom-agent')
      // Untouched defaults are still there.
      expect(headersOf()['Sec-Fetch-Mode']).toBe('navigate')
    })

    it('does not mutate BROWSER_HEADERS when a caller overrides one', async () => {
      const { transport } = recorder()
      await scraperFetch('https://mychart.example.org/Home', { headers: { 'Dnt': '0' } }, { transport })
      expect(BROWSER_HEADERS['Dnt']).toBe('1')
    })

    it('defaults a POST body to JSON, but leaves a declared Content-Type alone', async () => {
      const { transport, headersOf } = recorder()

      await scraperFetch('https://mychart.example.org/api', { method: 'POST', body: '{"a":1}' }, { transport })
      expect(headersOf(0)['Content-Type']).toBe('application/json')

      await scraperFetch(
        'https://mychart.example.org/api',
        { method: 'POST', body: 'a=1', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
        { transport },
      )
      expect(headersOf(1)['Content-Type']).toBe('application/x-www-form-urlencoded')
    })

    it('leaves a GET without a body alone', async () => {
      const { transport, headersOf } = recorder()
      await scraperFetch('https://mychart.example.org/Home', {}, { transport })
      expect(headersOf()['Content-Type']).toBeUndefined()
    })
  })

  describe('cookie jar', () => {
    it('sends the jar cookies and stores the ones the response sets', async () => {
      const jar = new CookieJar()
      await jar.setCookie('session=abc; path=/', 'https://mychart.example.org/')

      const seen: (string | undefined)[] = []
      const transport = async (url: string, init: RequestInit) => {
        seen.push((init.headers as Record<string, string>)['Cookie'])
        return new Response('', {
          status: 200,
          headers: { 'Set-Cookie': 'NSC_load_balancer=xyz; path=/' },
        })
      }

      await scraperFetch('https://mychart.example.org/Home', {}, { cookieJar: jar, transport })
      expect(seen[0]).toBe('session=abc')

      // The cookie the response set comes back on the next request.
      await scraperFetch('https://mychart.example.org/Home', {}, { cookieJar: jar, transport })
      expect(seen[1]).toContain('NSC_load_balancer=xyz')
      expect(seen[1]).toContain('session=abc')
    })

    it('does not leak cookies to a different host', async () => {
      const jar = new CookieJar()
      await jar.setCookie('session=abc; path=/', 'https://mychart.example.org/')

      const { transport, headersOf } = recorder()
      await scraperFetch('https://eunity.example.net/e/viewer', {}, { cookieJar: jar, transport })
      expect(headersOf()['Cookie']).toBeUndefined()
    })

    it('sends no Cookie header and records nothing when no jar is given', async () => {
      // iOS keeps its own cookie store, so the jar steps aside there.
      const transport = async () =>
        new Response('', { status: 200, headers: { 'Set-Cookie': 'session=abc; path=/' } })

      const { transport: plain, headersOf } = recorder()
      await scraperFetch('https://mychart.example.org/Home', {}, { transport: plain })
      expect(headersOf()['Cookie']).toBeUndefined()

      const jar = new CookieJar()
      await scraperFetch('https://mychart.example.org/Home', {}, { transport })
      expect(jar.serializeSync()!.cookies).toHaveLength(0)
    })

    it('skips a malformed Set-Cookie instead of failing the request', async () => {
      const jar = new CookieJar()
      const transport = async () =>
        new Response('', { status: 200, headers: { 'Set-Cookie': 'not a cookie at all' } })

      const res = await scraperFetch('https://mychart.example.org/Home', {}, { cookieJar: jar, transport })
      expect(res.status).toBe(200)
    })
  })

  describe('per-host limit', () => {
    it('caps in-flight requests to one host, whoever the caller is', async () => {
      // The imaging scraper and a category scrape aimed at the same host share
      // one budget, because the far end counts connections, not callers.
      const gate = deferred()
      let inFlight = 0
      let peak = 0

      const transport = async () => {
        inFlight += 1
        peak = Math.max(peak, inFlight)
        await gate.promise
        inFlight -= 1
        return new Response('{}', { status: 200 })
      }

      const runs = Array.from({ length: LIMIT * 3 }, (_, i) =>
        scraperFetch(`https://mychart.example.org/Clinical/${i}`, {}, { transport }),
      )

      await tick()
      expect(peak).toBe(LIMIT)

      gate.resolve()
      await Promise.all(runs)
      expect(peak).toBe(LIMIT)
    })

    it('gives a second host its own budget', async () => {
      const { transport } = recorder()
      await scraperFetch('https://mychart.example.org/Home', {}, { transport })
      await scraperFetch('https://eunity.example.net/e/viewer', {}, { transport })

      expect(Object.keys(hostLimiterStats()).sort()).toEqual([
        'eunity.example.net',
        'mychart.example.org',
      ])
    })

    it('releases the permit when the transport rejects', async () => {
      const transport = async () => {
        throw new Error('ECONNRESET')
      }

      await expect(
        scraperFetch('https://mychart.example.org/Home', {}, { transport }),
      ).rejects.toThrow('ECONNRESET')

      expect(hostLimiterStats()['mychart.example.org']).toEqual({
        inFlight: 0,
        queued: 0,
        limit: LIMIT,
      })
    })

    it('releases the permit before the jar is written, so a bad cookie cannot strand one', async () => {
      const jar = new CookieJar()
      const transport = async () =>
        new Response('', { status: 200, headers: { 'Set-Cookie': 'x=1; path=/' } })

      await scraperFetch('https://mychart.example.org/Home', {}, { cookieJar: jar, transport })
      expect(hostLimiterStats()['mychart.example.org'].inFlight).toBe(0)
    })
  })

  describe('transport resolution', () => {
    afterEach(() => setTestTransport(null))

    it('runs on a platform that does not own cookies, so the jar is live here', () => {
      // Every other test in this file assumes the Node/Bun branch. If this
      // ever flips, the jar assertions above are testing nothing.
      expect(PLATFORM_OWNS_COOKIES).toBe(false)
    })

    it('sends everything to the test transport once one is installed', async () => {
      // The seam that replaced `fetchFn` on myChartUserPassLogin: reachable
      // without threading a fetch through the production signature.
      const seen: string[] = []
      setTestTransport(async (url) => {
        seen.push(url)
        return new Response('scripted', { status: 200 })
      })

      const res = await scraperFetch('https://mychart.example.org/Home')
      expect(await res.text()).toBe('scripted')
      expect(seen).toEqual(['https://mychart.example.org/Home'])
    })

    it('lets the test transport win over a per-session one', async () => {
      setTestTransport(async () => new Response('global', { status: 200 }))
      const res = await scraperFetch(
        'https://mychart.example.org/Home',
        {},
        { transport: async () => new Response('session', { status: 200 }) },
      )
      expect(await res.text()).toBe('global')
    })

    it('restores the real network when cleared', async () => {
      setTestTransport(async () => new Response('scripted', { status: 200 }))
      setTestTransport(null)

      const realFetch = globalThis.fetch
      globalThis.fetch = mock(async () => new Response('real', { status: 200 })) as typeof globalThis.fetch
      try {
        const res = await scraperFetch('https://mychart.example.org/Home')
        expect(await res.text()).toBe('real')
      } finally {
        globalThis.fetch = realFetch
      }
    })

    it('still applies headers, jar and the permit underneath a test transport', async () => {
      // The seam sits below all three, so installing it must not turn any of
      // them off — otherwise tests would pass on requests production never sends.
      const jar = new CookieJar()
      await jar.setCookie('session=abc; path=/', 'https://mychart.example.org/')
      let headers: Record<string, string> = {}

      setTestTransport(async (_url, init) => {
        headers = init.headers as Record<string, string>
        return new Response('', { status: 200 })
      })

      await scraperFetch('https://mychart.example.org/Home', {}, { cookieJar: jar })
      expect(headers['User-Agent']).toBe(BROWSER_HEADERS['User-Agent'])
      expect(headers['Cookie']).toBe('session=abc')
      expect(hostLimiterStats()['mychart.example.org'].limit).toBe(LIMIT)
    })
  })

  describe('default transport', () => {
    it('resolves globalThis.fetch per call rather than capturing it at import', async () => {
      // Capturing it at import time would silently un-mock every test that
      // stubs the global, and break Expo's fetch swap at startup.
      const realFetch = globalThis.fetch
      let called = ''
      globalThis.fetch = mock(async (url: string | URL | Request) => {
        called = url.toString()
        return new Response('ok', { status: 200 })
      }) as typeof globalThis.fetch

      try {
        await platformFetch('https://mychart.example.org/Home', {})
      } finally {
        globalThis.fetch = realFetch
      }

      expect(called).toBe('https://mychart.example.org/Home')
    })

    it('is what scraperFetch uses when no transport is supplied', async () => {
      const realFetch = globalThis.fetch
      let seenUserAgent = ''
      globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
        seenUserAgent = (init?.headers as Record<string, string>)['User-Agent']
        return new Response('ok', { status: 200 })
      }) as typeof globalThis.fetch

      try {
        await scraperFetch('https://mychart.example.org/Home')
      } finally {
        globalThis.fetch = realFetch
      }

      expect(seenUserAgent).toBe(BROWSER_HEADERS['User-Agent'])
    })
  })
})

describe('scrapers have exactly one outbound path', () => {
  /**
   * The cap, the jar and the header block only hold if there is nowhere else
   * to make a request from. A second raw-fetch path doesn't announce itself —
   * it keeps working, it just isn't limited — so this fails the build instead
   * of waiting for an instance to end up in blockedInstances.ts.
   */
  const SCRAPERS_DIR = path.resolve(import.meta.dir, '../..')
  const CHOKEPOINT = path.join(SCRAPERS_DIR, 'http.ts')

  // A bare `fetch(...)` call, or a reference to a global/imported one. The
  // lookbehind skips `.fetch(` and `prefetch(`; `scraperFetch(` and
  // `platformFetch(` don't match either, since the capital F is load bearing.
  const RAW_FETCH = /(?<![.\w$])fetch\s*\(|globalThis\.fetch|require\(['"]expo\/fetch['"]\)|from\s+['"]node-fetch['"]/

  function sourceFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        return entry.name === '__tests__' || entry.name === 'node_modules' ? [] : sourceFiles(full)
      }
      return entry.isFile() && full.endsWith('.ts') && full !== CHOKEPOINT ? [full] : []
    })
  }

  it('makes no network call outside scrapers/http.ts', () => {
    const offenders = sourceFiles(SCRAPERS_DIR).flatMap((file) =>
      fs
        .readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, i) =>
          // Comments describe the rule; only code breaks it.
          RAW_FETCH.test(line) && !/^\s*(\/\/|\*|\/\*)/.test(line)
            ? [`${path.relative(SCRAPERS_DIR, file)}:${i + 1}: ${line.trim()}`]
            : [],
        ),
    )

    expect(offenders).toEqual([])
  })

  it('finds the network call it is meant to find', () => {
    // Guards the guard: if the pattern ever stops matching, the test above
    // passes vacuously and the invariant loses its only static protection.
    expect(RAW_FETCH.test(fs.readFileSync(CHOKEPOINT, 'utf8'))).toBe(true)
  })

  it('scans a meaningful number of files', () => {
    // A broken walk would also make the guard pass vacuously.
    expect(sourceFiles(SCRAPERS_DIR).length).toBeGreaterThan(30)
  })
})
