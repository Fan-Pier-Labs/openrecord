/**
 * Mount discovery against every shape a real deployment uses to announce where
 * MyChart lives.
 *
 * Discovery is the one thing that has to work before anything else can, and it
 * is the part of the scraper with the widest gap between "handles the fixture"
 * and "handles the internet". Every mode exercised here is a shape observed on
 * a live instance and named in `fake-mychart/src/lib/mount.ts`; several of them
 * are ones the scraper used to get wrong, each in its own way:
 *
 *   - `default-asp` sent `firstPathPart` to the literal string "DefaultAsp"
 *   - `moved-host` was treated as a redirect out to a marketing page
 *   - `landing-page` was never read for links unless the redirect left the host
 *   - `script` was not handled at all
 *
 * The test is deliberately end-to-end rather than a unit test of the parser:
 * what matters is that after discovery the session can actually log in and read
 * a chart, which is what catches a prefix that parses but doesn't resolve.
 *
 * The fake-mychart server must be running on localhost:4000 (or
 * FAKE_MYCHART_HOST). Locally: `cd fake-mychart && PORT=4000 bun run dev`.
 *
 * Run with: bun test scrapers/myChart/__tests__/fake-mychart/discovery.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { myChartUserPassLogin } from '../../login'
import { getMyChartProfile } from '../../profile'
import { platformFetch } from '../../../http'
import { setMountMode, setDiscoveryMode, resetFakeMyChart, type MountMode, type DiscoveryMode } from './mountMode'

const HOST = process.env.FAKE_MYCHART_HOST ?? 'localhost:4000'

/**
 * Another name for the same server. `moved-host` needs a destination that the
 * scraper sees as a different host but that still answers — the loopback
 * address and `localhost` are exactly that pair.
 */
const MOVED_HOST = HOST.replace(/^localhost/, '127.0.0.1')

/**
 * What each shape should resolve to, per mount mode. `null` is a root-mounted
 * instance: no prefix at all, not an empty string and not a failure.
 */
const CASES: { discovery: DiscoveryMode; mode: MountMode; prefix: string | null; host?: string }[] = [
  { discovery: 'default-asp', mode: 'prefixed', prefix: 'MyChart' },
  { discovery: 'default-asp', mode: 'root', prefix: null },
  { discovery: 'script', mode: 'prefixed', prefix: 'MyChart' },
  { discovery: 'script', mode: 'root', prefix: null },
  { discovery: 'landing-page', mode: 'prefixed', prefix: 'MyChart' },
  { discovery: 'landing-page', mode: 'root', prefix: null },
  { discovery: 'moved-host', mode: 'prefixed', prefix: 'MyChart', host: MOVED_HOST },
  { discovery: 'moved-host', mode: 'root', prefix: null, host: MOVED_HOST },
]

// These settings are global to the fake's process, so leaving one set would
// silently change what every later suite is testing against — and inheriting
// one would silently change what this suite is testing against.
beforeAll(async () => { await resetFakeMyChart(HOST) })
afterAll(async () => { await resetFakeMyChart(HOST) })

for (const { discovery, mode, prefix, host } of CASES) {
  describe(`discovery: ${discovery} (${mode} mount)`, () => {
    it('finds the mount and logs in through it', async () => {
      await setMountMode(HOST, mode)
      await setDiscoveryMode(HOST, discovery, discovery === 'moved-host' ? { movedHost: MOVED_HOST } : undefined)

      const result = await myChartUserPassLogin({
        hostname: HOST,
        user: 'homer',
        pass: 'donuts123',
        protocol: 'http',
      })

      expect(result.state).toBe('logged_in')
      expect(result.mychartRequest.firstPathPart).toBe(prefix)
      expect(result.mychartRequest.hostname).toBe(host ?? HOST)

      // A prefix that parses is not the same as a prefix that resolves — only
      // reading real data off the session proves discovery landed somewhere
      // the rest of the scraper can use.
      const profile = await getMyChartProfile(result.mychartRequest)
      expect(profile?.name).toContain('Homer')
    }, 30_000)
  })
}

describe('discovery: the DefaultAsp bounce', () => {
  it('hops through DefaultAsp before naming the login route', async () => {
    // The bug this guards: the first hop names no route, so anything reading a
    // single hop concludes the prefix is "DefaultAsp" (root-mounted) or stops
    // one hop short. Walk it by hand to pin the shape, not just the outcome.
    await setMountMode(HOST, 'root')
    await setDiscoveryMode(HOST, 'default-asp')

    const first = await fetch(`http://${HOST}/`, { redirect: 'manual' })
    expect(first.status).toBe(302)
    // Bare and relative, exactly as adams.mychartcc.com sends it.
    expect(first.headers.get('location')).toBe('DefaultAsp')

    const second = await fetch(`http://${HOST}/DefaultAsp`, { redirect: 'manual' })
    expect(second.status).toBe(302)
    expect(second.headers.get('location')).toBe('/Authentication/Login?')
  }, 15_000)

  it('reaches the login page under a prefix too', async () => {
    await setMountMode(HOST, 'prefixed')
    await setDiscoveryMode(HOST, 'default-asp')

    const hop = await fetch(`http://${HOST}/MyChart/DefaultAsp`, { redirect: 'manual' })
    expect(hop.status).toBe(302)
    expect(hop.headers.get('location')).toBe('/MyChart/Authentication/Login?')
  }, 15_000)
})

describe('discovery: landing page', () => {
  it('announces the mount only through links — no redirect, no refresh tag', async () => {
    await setMountMode(HOST, 'prefixed')
    await setDiscoveryMode(HOST, 'landing-page')

    const res = await fetch(`http://${HOST}/`, { redirect: 'manual' })
    expect(res.status).toBe(200)
    expect(res.headers.get('location')).toBe(null)

    const body = await res.text()
    expect(body).not.toContain('http-equiv="refresh"')
    expect(body).toContain(`/MyChart/`)
    // A sister organization's portal on another host is also linked, so
    // "first link wins" is not good enough.
    expect(body).toContain('mychart.sisterorg.example')
  }, 15_000)
})

describe('discovery: moved host', () => {
  it('rejects moved-host mode with nowhere to move to', async () => {
    const res = await fetch(`http://${HOST}/mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ discovery: 'moved-host', movedHost: null }),
    })
    expect(res.status).toBe(400)
  }, 15_000)

  it('carries the session to the new host for every later request', async () => {
    await setMountMode(HOST, 'prefixed')
    await setDiscoveryMode(HOST, 'moved-host', { movedHost: MOVED_HOST })

    const result = await myChartUserPassLogin({
      hostname: HOST,
      user: 'homer',
      pass: 'donuts123',
      protocol: 'http',
    })
    expect(result.state).toBe('logged_in')

    const requested: string[] = []
    const session = result.mychartRequest
    // Spy on the URLs but still hit the real server.
    session.transport = (url, init) => {
      requested.push(url)
      return platformFetch(url, init)
    }

    await getMyChartProfile(session)

    expect(requested.length).toBeGreaterThan(0)
    // Not one straggler left pointing at the hostname the user typed.
    expect(requested.every(u => u.includes(MOVED_HOST))).toBe(true)
  }, 30_000)
})
