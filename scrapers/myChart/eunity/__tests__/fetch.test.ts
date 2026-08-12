import { describe, it, expect, afterEach } from 'bun:test'
import * as tough from 'tough-cookie'

interface Call {
  url: string
  init: RequestInit & { headers?: Record<string, string> }
}

let handler: (url: string) => Response = () => new Response('', { status: 200 })
let calls: Call[] = []

// `fetch.ts` binds `globalThis.fetch` into a module-level `impl` at import time
// (so it can prefer expo/fetch when running inside Expo). Swapping the global
// afterwards would not reach it, so the dispatcher goes in FIRST and the module
// is imported dynamically below.
const realFetch = globalThis.fetch
globalThis.fetch = (async (url: string | URL | Request, init: RequestInit = {}) => {
  calls.push({ url: String(url), init })
  return handler(String(url))
}) as typeof globalThis.fetch

const { abortAfter, fetchWithCookies } = await import('../fetch')

globalThis.fetch = realFetch

function stubFetch(respond: (url: string) => Response) {
  handler = respond
  calls = []
  return calls
}

const ok = (setCookies: string[] = []) => {
  const headers = new Headers()
  for (const c of setCookies) headers.append('set-cookie', c)
  return new Response('body', { status: 200, headers })
}

afterEach(() => {
  handler = () => new Response('', { status: 200 })
  calls = []
})

describe('abortAfter', () => {
  it('returns a signal that is not yet aborted', () => {
    expect(abortAfter(1000).aborted).toBe(false)
  })

  it('aborts once the deadline passes', async () => {
    const signal = abortAfter(5)
    await Bun.sleep(30)
    expect(signal.aborted).toBe(true)
  })

  it('falls back to AbortController when AbortSignal.timeout is unavailable', async () => {
    // Hermes/React Native has no AbortSignal.timeout, which is the whole reason
    // this polyfill exists.
    const original = AbortSignal.timeout
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (AbortSignal as any).timeout
    try {
      const signal = abortAfter(5)
      expect(signal.aborted).toBe(false)
      await Bun.sleep(30)
      expect(signal.aborted).toBe(true)
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(AbortSignal as any).timeout = original
    }
  })
})

describe('fetchWithCookies', () => {
  const URL_ = 'https://eunity.example.org/e/AmfServicesServlet'

  it('sends no Cookie header when the jar is empty', async () => {
    const calls = stubFetch(() => ok())
    await fetchWithCookies(new tough.CookieJar(), URL_)

    expect(calls[0].init.headers?.Cookie).toBeUndefined()
  })

  it('sends cookies the jar holds for the url', async () => {
    const jar = new tough.CookieJar()
    await jar.setCookie('JSESSIONID=abc123; Path=/', URL_)

    const calls = stubFetch(() => ok())
    await fetchWithCookies(jar, URL_)

    expect(calls[0].init.headers?.Cookie).toBe('JSESSIONID=abc123')
  })

  it('joins multiple cookies with the standard separator', async () => {
    const jar = new tough.CookieJar()
    await jar.setCookie('a=1; Path=/', URL_)
    await jar.setCookie('b=2; Path=/', URL_)

    const calls = stubFetch(() => ok())
    await fetchWithCookies(jar, URL_)

    const cookie = calls[0].init.headers?.Cookie ?? ''
    expect(cookie.split('; ').sort()).toEqual(['a=1', 'b=2'])
  })

  it('does not send cookies scoped to a different host', async () => {
    const jar = new tough.CookieJar()
    await jar.setCookie('other=1; Path=/', 'https://elsewhere.example.org/')

    const calls = stubFetch(() => ok())
    await fetchWithCookies(jar, URL_)

    expect(calls[0].init.headers?.Cookie).toBeUndefined()
  })

  it('preserves caller headers alongside the Cookie header', async () => {
    const jar = new tough.CookieJar()
    await jar.setCookie('JSESSIONID=abc; Path=/', URL_)

    const calls = stubFetch(() => ok())
    await fetchWithCookies(jar, URL_, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-amf' },
    })

    expect(calls[0].init.method).toBe('POST')
    expect(calls[0].init.headers?.['Content-Type']).toBe('application/x-amf')
    expect(calls[0].init.headers?.Cookie).toBe('JSESSIONID=abc')
  })

  it('stores Set-Cookie headers back into the jar', async () => {
    const jar = new tough.CookieJar()
    stubFetch(() => ok(['JSESSIONID=fresh; Path=/']))

    await fetchWithCookies(jar, URL_)

    expect(await jar.getCookieString(URL_)).toContain('JSESSIONID=fresh')
  })

  it('stores every cookie from a multi-header response', async () => {
    const jar = new tough.CookieJar()
    stubFetch(() => ok(['a=1; Path=/', 'b=2; Path=/']))

    await fetchWithCookies(jar, URL_)

    const stored = await jar.getCookieString(URL_)
    expect(stored).toContain('a=1')
    expect(stored).toContain('b=2')
  })

  it('carries a session cookie into the next request', async () => {
    const jar = new tough.CookieJar()
    const calls = stubFetch((url) =>
      url.endsWith('/login') ? ok(['JSESSIONID=sess; Path=/']) : ok(),
    )

    await fetchWithCookies(jar, 'https://eunity.example.org/login')
    await fetchWithCookies(jar, URL_)

    expect(calls[1].init.headers?.Cookie).toBe('JSESSIONID=sess')
  })

  it('ignores a malformed Set-Cookie instead of failing the request', async () => {
    const jar = new tough.CookieJar()
    // A cookie scoped to a domain the response has no business setting.
    stubFetch(() => ok(['bad=1; Domain=evil.example.com; Path=/']))

    const response = await fetchWithCookies(jar, URL_)

    expect(response.status).toBe(200)
    expect(await jar.getCookieString(URL_)).not.toContain('bad=1')
  })

  it('returns the upstream response unchanged', async () => {
    stubFetch(() => ok())
    const response = await fetchWithCookies(new tough.CookieJar(), URL_)

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('body')
  })
})
