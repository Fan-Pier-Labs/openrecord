import { describe, it, expect, mock } from 'bun:test'
import { MyChartRequest } from '../myChartRequest'

describe('MyChartRequest', () => {
  describe('constructor', () => {
    it('sets hostname', () => {
      const req = new MyChartRequest('mychart.example.com')
      expect(req.hostname).toBe('mychart.example.com')
    })

    it('initializes firstPathPart as null (no prefix discovered yet)', () => {
      const req = new MyChartRequest('mychart.example.com')
      expect(req.firstPathPart).toBeNull()
    })

    it('creates a cookie jar', () => {
      const req = new MyChartRequest('mychart.example.com')
      expect(req.cookieJar).toBeDefined()
    })

    it('installs no transport override — the platform picks one per request', () => {
      // A non-null transport here would mean production code had injected a
      // fetch, which is the thing scrapers/http.ts exists to decide.
      const req = new MyChartRequest('mychart.example.com')
      expect(req.transport).toBeNull()
    })

    it('strips https:// prefix from hostname', () => {
      const req = new MyChartRequest('https://mychart.example.com')
      expect(req.hostname).toBe('mychart.example.com')
    })

    it('strips full URL with path to just hostname', () => {
      const req = new MyChartRequest('https://mychart.example.com/MyChart/Home')
      expect(req.hostname).toBe('mychart.example.com')
    })

    it('strips http:// prefix from hostname', () => {
      const req = new MyChartRequest('http://mychart.example.com')
      expect(req.hostname).toBe('mychart.example.com')
    })

    it('trims whitespace from hostname', () => {
      const req = new MyChartRequest('  mychart.example.com  ')
      expect(req.hostname).toBe('mychart.example.com')
    })

    it('leaves bare hostname unchanged', () => {
      const req = new MyChartRequest('mychart.example.com')
      expect(req.hostname).toBe('mychart.example.com')
    })
  })

  describe('setFirstPathPart', () => {
    it('sets the first path part', () => {
      const req = new MyChartRequest('mychart.example.com')
      req.setFirstPathPart('MyChart')
      expect(req.firstPathPart).toBe('MyChart')
    })

    it('can be updated multiple times', () => {
      const req = new MyChartRequest('mychart.example.com')
      req.setFirstPathPart('MyChart')
      req.setFirstPathPart('MyChart-PRD')
      expect(req.firstPathPart).toBe('MyChart-PRD')
    })
  })

  describe('makeRequest', () => {
    it('throws when neither url nor path is provided', async () => {
      const req = new MyChartRequest('mychart.example.com')
      await expect(req.makeRequest({})).rejects.toThrow(
        'Either url or path must be defined'
      )
    })

    it('constructs URL from hostname + firstPathPart + path', async () => {
      const req = new MyChartRequest('mychart.example.com')
      req.setFirstPathPart('MyChart')

      let capturedUrl = ''
      req.transport = mock(async (url: string | URL | Request) => {
        capturedUrl = url.toString()
        return new Response('', { status: 200 })
      }) as typeof req.transport

      await req.makeRequest({ path: '/Home' })
      expect(capturedUrl).toBe('https://mychart.example.com/MyChart/Home')
    })

    it('uses url directly when provided instead of building from path', async () => {
      const req = new MyChartRequest('mychart.example.com')
      req.setFirstPathPart('MyChart')

      let capturedUrl = ''
      req.transport = mock(async (url: string | URL | Request) => {
        capturedUrl = url.toString()
        return new Response('', { status: 200 })
      }) as typeof req.transport

      await req.makeRequest({ url: 'https://other.com/custom/path' })
      expect(capturedUrl).toBe('https://other.com/custom/path')
    })

    it('defaults to GET method', async () => {
      const req = new MyChartRequest('mychart.example.com')

      let capturedConfig: RequestInit | undefined
      req.transport = mock(async (_url: string | URL | Request, init?: RequestInit) => {
        capturedConfig = init
        return new Response('', { status: 200 })
      }) as typeof req.transport

      await req.makeRequest({ path: '/Home' })
      expect(capturedConfig?.method).toBe('GET')
    })

    it('sends Chrome-like user agent header', async () => {
      const req = new MyChartRequest('mychart.example.com')

      let capturedHeaders: Record<string, string> = {}
      req.transport = mock(async (_url: string | URL | Request, init?: RequestInit) => {
        capturedHeaders = init?.headers as Record<string, string>
        return new Response('', { status: 200 })
      }) as typeof req.transport

      await req.makeRequest({ path: '/Home' })
      expect(capturedHeaders['User-Agent']).toContain('Chrome')
      expect(capturedHeaders['User-Agent']).toContain('Mozilla')
    })

    it('merges custom headers with defaults', async () => {
      const req = new MyChartRequest('mychart.example.com')

      let capturedHeaders: Record<string, string> = {}
      req.transport = mock(async (_url: string | URL | Request, init?: RequestInit) => {
        capturedHeaders = init?.headers as Record<string, string>
        return new Response('', { status: 200 })
      }) as typeof req.transport

      await req.makeRequest({
        path: '/Home',
        headers: { 'X-Custom': 'value', '__RequestVerificationToken': 'abc' }
      })
      expect(capturedHeaders['X-Custom']).toBe('value')
      expect(capturedHeaders['__RequestVerificationToken']).toBe('abc')
      expect(capturedHeaders['User-Agent']).toBeDefined()
    })

    it('custom headers override defaults', async () => {
      const req = new MyChartRequest('mychart.example.com')

      let capturedHeaders: Record<string, string> = {}
      req.transport = mock(async (_url: string | URL | Request, init?: RequestInit) => {
        capturedHeaders = init?.headers as Record<string, string>
        return new Response('', { status: 200 })
      }) as typeof req.transport

      await req.makeRequest({
        path: '/Home',
        headers: { 'User-Agent': 'custom-agent' }
      })
      expect(capturedHeaders['User-Agent']).toBe('custom-agent')
    })

    it('sets redirect to manual', async () => {
      const req = new MyChartRequest('mychart.example.com')

      let capturedConfig: RequestInit | undefined
      req.transport = mock(async (_url: string | URL | Request, init?: RequestInit) => {
        capturedConfig = init
        return new Response('', { status: 200 })
      }) as typeof req.transport

      await req.makeRequest({ path: '/Home' })
      expect(capturedConfig?.redirect).toBe('manual')
    })

    it('follows 302 redirects by default', async () => {
      const req = new MyChartRequest('mychart.example.com')
      const calls: string[] = []

      req.transport = mock(async (url: string | URL | Request) => {
        calls.push(url.toString())
        if (calls.length === 1) {
          return new Response('', {
            status: 302,
            headers: { 'Location': 'https://mychart.example.com/MyChart/Home' }
          })
        }
        return new Response('Final page', { status: 200 })
      }) as typeof req.transport

      const resp = await req.makeRequest({ path: '/Login' })
      expect(calls).toHaveLength(2)
      expect(calls[1]).toBe('https://mychart.example.com/MyChart/Home')
      expect(await resp.text()).toBe('Final page')
    })

    it('follows 301 redirects by default', async () => {
      const req = new MyChartRequest('mychart.example.com')
      const calls: string[] = []

      req.transport = mock(async (url: string | URL | Request) => {
        calls.push(url.toString())
        if (calls.length === 1) {
          return new Response('', {
            status: 301,
            headers: { 'Location': '/new-location' }
          })
        }
        return new Response('Redirected', { status: 200 })
      }) as typeof req.transport

      await req.makeRequest({ path: '/old' })
      expect(calls).toHaveLength(2)
    })

    it('does not follow redirects when followRedirects is false', async () => {
      const req = new MyChartRequest('mychart.example.com')
      const calls: string[] = []

      req.transport = mock(async (url: string | URL | Request) => {
        calls.push(url.toString())
        return new Response('', {
          status: 302,
          headers: { 'Location': '/somewhere' }
        })
      }) as typeof req.transport

      const resp = await req.makeRequest({ path: '/test', followRedirects: false })
      expect(calls).toHaveLength(1)
      expect(resp.status).toBe(302)
    })

    it('throws when redirect has no Location header', async () => {
      const req = new MyChartRequest('mychart.example.com')

      req.transport = mock(async () => {
        return new Response('', { status: 302 })
      }) as typeof req.transport

      await expect(req.makeRequest({ path: '/test' })).rejects.toThrow(
        "302 didn't have a location header"
      )
    })

    it('switches to GET and drops body on redirect', async () => {
      const req = new MyChartRequest('mychart.example.com')
      const capturedConfigs: RequestInit[] = []

      req.transport = mock(async (_url: string | URL | Request, init?: RequestInit) => {
        capturedConfigs.push(init!)
        if (capturedConfigs.length === 1) {
          return new Response('', {
            status: 302,
            headers: { 'Location': '/redirected' }
          })
        }
        return new Response('OK', { status: 200 })
      }) as typeof req.transport

      await req.makeRequest({ path: '/submit', method: 'POST', body: 'data=123' })
      expect(capturedConfigs[0].method).toBe('POST')
      expect(capturedConfigs[0].body).toBe('data=123')
      expect(capturedConfigs[1].method).toBe('GET')
      expect(capturedConfigs[1].body).toBeUndefined()
    })

    it('auto-sets Content-Type to application/json for POST with body', async () => {
      const req = new MyChartRequest('mychart.example.com')

      let capturedHeaders: Record<string, string> = {}
      req.transport = mock(async (_url: string | URL | Request, init?: RequestInit) => {
        capturedHeaders = init?.headers as Record<string, string>
        return new Response('', { status: 200 })
      }) as typeof req.transport

      await req.makeRequest({ path: '/api', method: 'POST', body: '{"key":"val"}' })
      expect(capturedHeaders['Content-Type']).toBe('application/json')
    })

    it('does not override explicit Content-Type', async () => {
      const req = new MyChartRequest('mychart.example.com')

      let capturedHeaders: Record<string, string> = {}
      req.transport = mock(async (_url: string | URL | Request, init?: RequestInit) => {
        capturedHeaders = init?.headers as Record<string, string>
        return new Response('', { status: 200 })
      }) as typeof req.transport

      await req.makeRequest({
        path: '/api',
        method: 'POST',
        body: 'field=value',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      })
      expect(capturedHeaders['Content-Type']).toBe('application/x-www-form-urlencoded')
    })

    it('follows 303/307/308 redirects too', async () => {
      for (const status of [303, 307, 308]) {
        const req = new MyChartRequest('mychart.example.com')
        const calls: string[] = []
        req.transport = mock(async (url: string | URL | Request) => {
          calls.push(url.toString())
          if (calls.length === 1) {
            return new Response('', { status, headers: { 'Location': '/moved' } })
          }
          return new Response('Final', { status: 200 })
        }) as typeof req.transport

        const res = await req.makeRequest({ path: '/Home' })
        expect(res.status).toBe(200)
        expect(calls[1]).toBe('https://mychart.example.com/moved')
      }
    })

    it('keeps the method and body across a 307, but turns a 303 into a GET', async () => {
      for (const [status, expectedMethod] of [[307, 'POST'], [303, 'GET']] as const) {
        const req = new MyChartRequest('mychart.example.com')
        const methods: (string | undefined)[] = []
        let calls = 0
        req.transport = mock(async (_url: string | URL | Request, init?: RequestInit) => {
          methods.push(init?.method)
          if (++calls === 1) {
            return new Response('', { status, headers: { 'Location': '/moved' } })
          }
          return new Response('Final', { status: 200 })
        }) as typeof req.transport

        await req.makeRequest({ path: '/DoLogin', method: 'POST', body: 'x=1' })
        expect(methods[1]).toBe(expectedMethod)
      }
    })

    it('keeps cookies set by a redirect response and sends them on the next hop', async () => {
      // Real instances set their load-balancer and bot-check cookies on the
      // 302 itself (NetScaler's NSC_*, Cloudflare's __cf_bm), and expect them
      // back on the hop that follows. The jar is wired into every response,
      // redirects included — this pins that down.
      // Deliberately does NOT replace transport: the jar wiring is the
      // thing under test, so the stub goes underneath it at global fetch.
      const req = new MyChartRequest('mychart.example.com')
      const cookiesSeen: (string | undefined)[] = []
      let calls = 0

      const realFetch = globalThis.fetch
      globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
        cookiesSeen.push((init?.headers as Record<string, string>)?.['Cookie'])
        if (++calls === 1) {
          return new Response('', {
            status: 302,
            headers: {
              'Location': 'https://mychart.example.com/MyChart/Authentication/Login',
              'Set-Cookie': 'NSC_load_balancer=abc123; path=/',
            },
          })
        }
        return new Response('Login page', { status: 200 })
      }) as typeof globalThis.fetch

      try {
        await req.makeRequest({ url: 'https://mychart.example.com/MyChart/' })
      } finally {
        globalThis.fetch = realFetch
      }

      expect(cookiesSeen[0]).toBeUndefined()
      expect(cookiesSeen[1]).toBe('NSC_load_balancer=abc123')
      expect(req.getCookieInfo().count).toBe(1)
    })

    it('gives up on a URL that redirects to itself instead of recursing forever', async () => {
      // mychart.crossingrivers.org answers /CRH/ with a 301 to /CRH/. Without a
      // cap this recursion never terminates.
      const req = new MyChartRequest('mychart.example.com')
      let calls = 0
      req.transport = mock(async () => {
        calls++
        return new Response('', { status: 301, headers: { 'Location': 'https://mychart.example.com/loop' } })
      }) as typeof req.transport

      const res = await req.makeRequest({ url: 'https://mychart.example.com/loop' })
      expect(res.status).toBe(301)
      expect(calls).toBeLessThanOrEqual(21)
    })
  })

  describe('setHostname', () => {
    it('sends subsequent requests to the new host', async () => {
      const req = new MyChartRequest('patients.mycslink.org')
      req.setHostname('mycslink.cedars-sinai.org')
      req.setFirstPathPart('mycslink')

      const calls: string[] = []
      req.transport = mock(async (url: string | URL | Request) => {
        calls.push(url.toString())
        return new Response('ok', { status: 200 })
      }) as typeof req.transport

      await req.makeRequest({ path: '/Authentication/Login' })
      expect(calls[0]).toBe('https://mycslink.cedars-sinai.org/mycslink/Authentication/Login')
    })

    it('normalizes a full URL down to the host', () => {
      const req = new MyChartRequest('mychart.example.com')
      req.setHostname('https://mychart.other.org/MyChart')
      expect(req.hostname).toBe('mychart.other.org')
    })
  })

  describe('serialization', () => {
    it('serializes and unserializes a request', async () => {
      const req = new MyChartRequest('mychart.example.com')
      req.setFirstPathPart('MyChart')

      const serialized = await req.serialize()
      const parsed = JSON.parse(serialized)
      expect(parsed.hostname).toBe('mychart.example.com')
      expect(parsed.firstPathPart).toBe('MyChart')
      expect(parsed.cookies).toBeDefined()
    })

    it('unserializes back to a working MyChartRequest', async () => {
      const req = new MyChartRequest('test.example.com')
      req.setFirstPathPart('MyChart-PRD')

      const serialized = await req.serialize()
      const restored = await MyChartRequest.unserialize(serialized)
      expect(restored).not.toBeNull()
      expect(restored!.hostname).toBe('test.example.com')
      expect(restored!.firstPathPart).toBe('MyChart-PRD')
      expect(restored!.transport).toBeNull()
    })
  })
})
