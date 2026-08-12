import { describe, it, expect, afterEach } from 'bun:test'
import { createPreAuthRequest } from '../preAuthRequest'
import { setTestTransport } from '../../http'

/**
 * `createPreAuthRequest` is the bootstrap the signup and account-recovery
 * scrapers share: it works out the protocol and the mount prefix for an
 * instance the caller has no session on yet, so the pre-login endpoints get
 * the same URLs a browser would use.
 *
 * The protocol rule is the interesting part — it is duplicated from the login
 * bootstrap on purpose, and if the two ever disagree, signup silently talks
 * https to a local fake-mychart that only speaks http.
 */

const TOKEN_PAGE = '<input name="__RequestVerificationToken" value="tok" />'

type Call = { url: string }

/**
 * A server that bounces `/` to `/<prefix>/` and serves a login page under it —
 * the shortest chain `determineFirstPathPart` accepts.
 */
function fakeInstance({ prefix = 'MyChart', reachable = true }: { prefix?: string; reachable?: boolean } = {}) {
  const calls: Call[] = []
  setTestTransport(async (url: string) => {
    calls.push({ url })
    if (!reachable) return new Response('', { status: 500 })
    const path = new URL(url).pathname
    if (path === '/' || path === '') {
      return new Response('', { status: 302, headers: { Location: `/${prefix}/` } })
    }
    // The second hop of MyChart's canonical bounce: /<prefix>/ → the login
    // page. Only the last hop names the route, which is why discovery follows
    // the whole chain rather than reading the first Location.
    if (path.toLowerCase() === `/${prefix.toLowerCase()}/`) {
      return new Response('', {
        status: 302,
        headers: { Location: `/${prefix}/Authentication/Login` },
      })
    }
    // Only the real mount serves a login page. Discovery falls back to probing
    // the common prefixes, so a fake that answered any of them would let a
    // wrong guess pass — the same trap fake-mychart avoids by 404ing the
    // prefixes it isn't mounted under.
    if (path.toLowerCase() === `/${prefix.toLowerCase()}/authentication/login`) {
      return new Response(TOKEN_PAGE, { status: 200 })
    }
    return new Response('', { status: 404 })
  })
  return { calls }
}

afterEach(() => {
  setTestTransport(null)
})

describe('createPreAuthRequest — protocol selection', () => {
  it('uses http for localhost, which is where fake-mychart runs', async () => {
    const { calls } = fakeInstance()
    const req = await createPreAuthRequest({ hostname: 'localhost:4000' })
    expect(req).not.toBeNull()
    expect(req!.protocol).toBe('http')
    expect(calls[0].url.startsWith('http://')).toBe(true)
  })

  it('uses http for a dot-less hostname, which is a Docker service name', async () => {
    fakeInstance()
    const req = await createPreAuthRequest({ hostname: 'fake-mychart:3000' })
    expect(req!.protocol).toBe('http')
  })

  it('uses https for a real hostname', async () => {
    fakeInstance()
    const req = await createPreAuthRequest({ hostname: 'mychart.example.org' })
    expect(req!.protocol).toBe('https')
  })

  it('lets an explicit protocol win over the hostname heuristic', async () => {
    fakeInstance()
    const req = await createPreAuthRequest({ hostname: 'localhost:4000', protocol: 'https' })
    expect(req!.protocol).toBe('https')
  })
})

describe('createPreAuthRequest — mount discovery', () => {
  it('discovers the mount prefix from the redirect chain', async () => {
    fakeInstance({ prefix: 'MyChart' })
    const req = await createPreAuthRequest({ hostname: 'mychart.example.org' })
    expect(req!.firstPathPart).toBe('MyChart')
  })

  it('discovers a non-standard prefix', async () => {
    fakeInstance({ prefix: 'UCSFMyChart' })
    const req = await createPreAuthRequest({ hostname: 'mychart.example.org' })
    expect(req!.firstPathPart).toBe('UCSFMyChart')
  })

  it('takes the prefix from the input when the caller spelled one out', async () => {
    const { calls } = fakeInstance({ prefix: 'MyChart' })
    const req = await createPreAuthRequest({ hostname: 'mychart.example.org/UCSFMyChart' })
    expect(req!.firstPathPart).toBe('UCSFMyChart')
    // A prefix given by the caller is authoritative, so the root chain is never
    // walked — a request that skips discovery is the whole point of passing one.
    expect(calls.some((c) => new URL(c.url).pathname === '/')).toBe(false)
  })

  /**
   * `createPreAuthRequest` has a `if (!resolved) return null` branch, and it is
   * currently unreachable: `determineFirstPathPart` returns the request even on
   * its own "Could not work out where MyChart is mounted" path, never null.
   * So a host where discovery fails outright yields a request with no prefix,
   * and signup/recovery go on to build URLs against the domain root.
   *
   * This test pins the behavior that actually ships rather than the one the
   * signature promises. Tightening the return to null is a change to the login
   * bootstrap that three other call sites share, so it belongs in its own PR —
   * when that lands, this expectation flips to `toBeNull()`.
   */
  it('currently yields a prefix-less request when discovery fails outright', async () => {
    fakeInstance({ reachable: false })
    const req = await createPreAuthRequest({ hostname: 'mychart.example.org' })
    expect(req).not.toBeNull()
    expect(req!.firstPathPart).toBeNull()
  })

  it('rejects a missing hostname instead of building a request for nowhere', async () => {
    await expect(createPreAuthRequest({ hostname: '' })).rejects.toThrow('Missing hostname')
  })
})
