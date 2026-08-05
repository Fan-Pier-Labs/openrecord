/**
 * Integration tests covering both ways a real MyChart instance can be deployed.
 *
 * Real instances come in two shapes and the scraper has to discover which
 * before it can build a single URL:
 *
 *   - **Path-prefixed**: `/` redirects to `/MyChart/` (uhhospitals.org,
 *     UCSF, and most others). The first path segment is a deployment prefix.
 *   - **Root-mounted**: `/` redirects to `./Authentication/Login?`
 *     (mychart.clevelandclinic.org). There is no prefix — the first path
 *     segment is already a MyChart controller name.
 *
 * The second shape used to break login entirely: "Authentication" was stored
 * as the prefix and prepended to paths that already began with it, producing
 * `/Authentication/Authentication/Login/DoLogin` → 404 → "ended up on an
 * unexpected page".
 *
 * Requires two fake-mychart servers:
 *   - localhost:4000 (or FAKE_MYCHART_HOST)             — default, path-prefixed
 *   - localhost:4002 (or FAKE_MYCHART_ROOT_MOUNT_HOST)  — FAKE_MYCHART_ROOT_MOUNT=true
 *
 * Run with: bun test scrapers/myChart/__tests__/fake-mychart/mount-modes.test.ts
 */

import { describe, it, expect } from 'bun:test'
import { myChartUserPassLogin } from '../../login'
import { getMyChartProfile } from '../../profile'
import { getMedications } from '../../medications'

const PREFIXED_HOST = process.env.FAKE_MYCHART_HOST ?? 'localhost:4000'
const ROOT_HOST = process.env.FAKE_MYCHART_ROOT_MOUNT_HOST ?? 'localhost:4002'

async function login(hostname: string) {
  return myChartUserPassLogin({ hostname, user: 'homer', pass: 'donuts123', protocol: 'http' })
}

describe('path-prefixed instance (/MyChart/)', () => {
  it('serves its root redirect as an absolute URL carrying the prefix', async () => {
    const res = await fetch(`http://${PREFIXED_HOST}/`, { redirect: 'manual' })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('/MyChart/')
  })

  it('does not serve MyChart routes at the domain root', async () => {
    const res = await fetch(`http://${PREFIXED_HOST}/Authentication/Login`, { redirect: 'manual' })
    expect(res.status).toBe(404)
  })

  it('logs in and discovers the prefix', async () => {
    const result = await login(PREFIXED_HOST)
    expect(result.state).toBe('logged_in')
    expect(result.mychartRequest.firstPathPart).toBe('MyChart')
  }, 30_000)

  it('scrapes through the prefix', async () => {
    const result = await login(PREFIXED_HOST)
    expect(result.state).toBe('logged_in')

    const profile = await getMyChartProfile(result.mychartRequest)
    expect(profile).not.toBeNull()
    expect(profile!.name).toBe('Homer Jay Simpson')

    const meds = await getMedications(result.mychartRequest)
    expect(meds.medications.length).toBeGreaterThan(0)
  }, 30_000)
})

describe('root-mounted instance (Cleveland Clinic shape)', () => {
  it('serves its root redirect as a relative URL straight to a controller', async () => {
    // Byte-for-byte what mychart.clevelandclinic.org sends. Both the relative
    // form and the trailing "?" are part of the real response.
    const res = await fetch(`http://${ROOT_HOST}/`, { redirect: 'manual' })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('./Authentication/Login?')
  })

  it('serves MyChart routes at the domain root', async () => {
    const res = await fetch(`http://${ROOT_HOST}/Authentication/Login`)
    expect(res.status).toBe(200)
  })

  it('logs in with an empty prefix instead of mistaking the controller for one', async () => {
    const result = await login(ROOT_HOST)
    expect(result.state).toBe('logged_in')
    // The regression: this used to be 'Authentication'.
    expect(result.mychartRequest.firstPathPart).toBe('')
  }, 30_000)

  it('builds URLs without a doubled controller segment or a double slash', async () => {
    const result = await login(ROOT_HOST)
    expect(result.state).toBe('logged_in')

    const requested: string[] = []
    const session = result.mychartRequest
    const underlying = session.fetchWithCookieJar.bind(session)
    session.fetchWithCookieJar = (url, init) => {
      requested.push(String(url))
      return underlying(url, init)
    }

    const profile = await getMyChartProfile(session)
    expect(profile).not.toBeNull()
    expect(profile!.name).toBe('Homer Jay Simpson')

    expect(requested.length).toBeGreaterThan(0)
    for (const url of requested) {
      expect(url).not.toContain('/Authentication/Authentication/')
      // No `//` beyond the one in `http://`.
      expect(url.slice('http://'.length)).not.toContain('//')
    }
  }, 30_000)

  it('scrapes from the domain root', async () => {
    const result = await login(ROOT_HOST)
    expect(result.state).toBe('logged_in')

    const meds = await getMedications(result.mychartRequest)
    expect(meds.medications.length).toBeGreaterThan(0)
  }, 30_000)
})
