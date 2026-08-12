import { describe, it, expect, afterEach, mock } from 'bun:test'
import { DEFAULT_HEADERS, rawRequest, follow302sAndReturnFinalUrl } from '../../request'

const realFetch = globalThis.fetch

interface Call {
  url: string
  init: RequestInit
}

/**
 * Stubs global fetch with a routing table of url-fragment → Response factory,
 * and records every call so header/redirect behaviour can be asserted.
 */
function stubFetch(routes: Array<[string, () => Response]>) {
  const calls: Call[] = []
  globalThis.fetch = mock(async (url: string | URL | Request, init: RequestInit = {}) => {
    const href = String(url)
    calls.push({ url: href, init })
    for (const [fragment, respond] of routes) {
      if (href.includes(fragment)) return respond()
    }
    return new Response('', { status: 200 })
  }) as typeof globalThis.fetch
  return calls
}

const redirect = (status: number, location: string | null) =>
  new Response('', { status, headers: location === null ? {} : { location } })

afterEach(() => {
  globalThis.fetch = realFetch
})

describe('DEFAULT_HEADERS', () => {
  it('presents as a real Chrome browser', () => {
    // MyChart edge rules reject requests missing browser-shaped headers, so
    // these are load-bearing rather than decorative.
    expect(DEFAULT_HEADERS['User-Agent']).toContain('Chrome/')
    expect(DEFAULT_HEADERS['Sec-Fetch-Mode']).toBe('navigate')
    expect(DEFAULT_HEADERS['Sec-Fetch-Dest']).toBe('document')
    expect(DEFAULT_HEADERS['Upgrade-Insecure-Requests']).toBe('1')
    expect(DEFAULT_HEADERS['Sec-Ch-Ua']).toContain('Chromium')
  })
})

describe('rawRequest', () => {
  it('sends the default browser headers', async () => {
    const calls = stubFetch([])
    await rawRequest('https://mychart.example.org/')

    expect(calls).toHaveLength(1)
    expect(calls[0].init.headers).toMatchObject({
      'User-Agent': DEFAULT_HEADERS['User-Agent'],
    })
  })

  it('lets caller options override the defaults', async () => {
    const calls = stubFetch([])
    await rawRequest('https://mychart.example.org/', { method: 'POST' })

    expect(calls[0].init.method).toBe('POST')
  })
})

describe('follow302sAndReturnFinalUrl', () => {
  it('returns the original url when nothing redirects', async () => {
    stubFetch([['mychart.example.org', () => new Response('', { status: 200 })]])

    expect(await follow302sAndReturnFinalUrl('https://mychart.example.org/')).toBe(
      'https://mychart.example.org/',
    )
  })

  it('follows a 302 to its destination', async () => {
    stubFetch([
      ['/start', () => redirect(302, 'https://mychart.example.org/MyChart/')],
      ['/MyChart/', () => new Response('', { status: 200 })],
    ])

    expect(await follow302sAndReturnFinalUrl('https://mychart.example.org/start')).toBe(
      'https://mychart.example.org/MyChart/',
    )
  })

  it('follows a 301 as well as a 302', async () => {
    stubFetch([
      ['/old', () => redirect(301, 'https://mychart.example.org/new')],
      ['/new', () => new Response('', { status: 200 })],
    ])

    expect(await follow302sAndReturnFinalUrl('https://mychart.example.org/old')).toBe(
      'https://mychart.example.org/new',
    )
  })

  it('follows a multi-hop chain to the end', async () => {
    // MyChart's canonical bounce only names the mount on its last hop.
    stubFetch([
      ['/a', () => redirect(302, '/b')],
      ['/b', () => redirect(302, '/c')],
      ['/c', () => new Response('', { status: 200 })],
    ])

    expect(await follow302sAndReturnFinalUrl('https://mychart.example.org/a')).toBe(
      'https://mychart.example.org/c',
    )
  })

  it('resolves a relative Location against the current url', async () => {
    stubFetch([
      ['/deep/start', () => redirect(302, 'MyChart/home')],
      ['/deep/MyChart/home', () => new Response('', { status: 200 })],
    ])

    expect(await follow302sAndReturnFinalUrl('https://mychart.example.org/deep/start')).toBe(
      'https://mychart.example.org/deep/MyChart/home',
    )
  })

  it('follows a redirect that moves to another host', async () => {
    stubFetch([
      ['vanity.example.org', () => redirect(302, 'https://real.example.org/MyChart/')],
      ['real.example.org', () => new Response('', { status: 200 })],
    ])

    expect(await follow302sAndReturnFinalUrl('https://vanity.example.org/')).toBe(
      'https://real.example.org/MyChart/',
    )
  })

  it('does not treat a 200 or a 404 as a redirect', async () => {
    stubFetch([['/missing', () => new Response('', { status: 404 })]])

    expect(await follow302sAndReturnFinalUrl('https://mychart.example.org/missing')).toBe(
      'https://mychart.example.org/missing',
    )
  })

  it('throws when a redirect has no Location header', async () => {
    stubFetch([['/broken', () => redirect(302, null)]])

    await expect(follow302sAndReturnFinalUrl('https://mychart.example.org/broken')).rejects.toThrow(
      'No location header',
    )
  })

  it('requests manual redirect handling so each hop is observable', async () => {
    const calls = stubFetch([])
    await follow302sAndReturnFinalUrl('https://mychart.example.org/')

    expect(calls[0].init.redirect).toBe('manual')
  })
})
