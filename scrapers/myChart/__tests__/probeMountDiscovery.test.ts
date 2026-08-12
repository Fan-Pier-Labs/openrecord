import { describe, it, expect, afterEach, mock } from 'bun:test'
import { timeBoundedRequest } from '../../list-all-mycharts/probe-mount-discovery'

/**
 * The probe is the only production caller that wraps `MyChartRequest.transport`
 * to add behaviour of its own (a per-request timeout, so one hung host can't
 * stall a 750-host sweep).
 *
 * It is also not covered by anything else: the sweep it belongs to talks to
 * real hospitals, so a break here shows up as "every host unreachable" in a
 * run nobody does on every commit. These tests hold the wrapper to its two
 * jobs — still reach the network, and still carry the timeout.
 */

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
})

describe('timeBoundedRequest', () => {
  it('still reaches the network through the wrapper', async () => {
    // The wrapper used to bind the request's existing transport. Once the
    // default became "let the platform decide", there was nothing to bind and
    // every probe threw before it sent anything.
    const seen: string[] = []
    globalThis.fetch = mock(async (url: string | URL | Request) => {
      seen.push(url.toString())
      return new Response('<html>login</html>', { status: 200 })
    }) as typeof globalThis.fetch

    const req = timeBoundedRequest('mychart.example.org')
    const res = await req.makeRequest({ url: 'https://mychart.example.org/Authentication/Login' })

    expect(res.status).toBe(200)
    expect(seen).toEqual(['https://mychart.example.org/Authentication/Login'])
  })

  it('attaches an abort signal to every request', async () => {
    const signals: (AbortSignal | null | undefined)[] = []
    globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      signals.push(init?.signal)
      return new Response('', { status: 200 })
    }) as typeof globalThis.fetch

    const req = timeBoundedRequest('mychart.example.org')
    await req.makeRequest({ url: 'https://mychart.example.org/Authentication/Login' })

    expect(signals[0]).toBeInstanceOf(AbortSignal)
    expect(signals[0]!.aborted).toBe(false)
  })

  it('keeps the browser headers the wrapped transport sits underneath', async () => {
    let headers: Record<string, string> = {}
    globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      headers = init?.headers as Record<string, string>
      return new Response('', { status: 200 })
    }) as typeof globalThis.fetch

    await timeBoundedRequest('mychart.example.org').makeRequest({
      url: 'https://mychart.example.org/Authentication/Login',
    })

    expect(headers['User-Agent']).toContain('Chrome')
  })
})
