import { describe, it, expect } from 'bun:test'
import { CookieJar } from 'tough-cookie'
import { cookieHeaderFor, storeSetCookies } from '../../cookies'

/**
 * The half of the cookie contract tough-cookie deliberately doesn't implement:
 * getting the strings off a Response and into the jar.
 *
 * The interesting case is React Native, which has no `Headers.getSetCookie()`
 * and folds every Set-Cookie into one comma-joined string. Bun and Node both
 * have the method, so the fallback never runs under test unless a test builds
 * a response without it — which is what these do. It is live code on device:
 * the eUnity imaging scraper carries its own jar and runs in the app.
 */

/** A Response whose headers look like React Native's — no getSetCookie(). */
function rnResponse(setCookieHeader: string): Response {
  return {
    headers: {
      get: (name: string) => (name.toLowerCase() === 'set-cookie' ? setCookieHeader : null),
    },
  } as unknown as Response
}

const URL_ = 'https://eunity.example.net/e/viewer'

describe('storeSetCookies', () => {
  it('reads separate headers when the runtime exposes getSetCookie', async () => {
    const jar = new CookieJar()
    const res = new Response('', {
      headers: [
        ['Set-Cookie', 'JSESSIONID=abc; path=/'],
        ['Set-Cookie', 'route=node2; path=/'],
      ],
    })

    await storeSetCookies(jar, URL_, res)
    expect(await cookieHeaderFor(jar, URL_)).toContain('JSESSIONID=abc')
    expect(await cookieHeaderFor(jar, URL_)).toContain('route=node2')
  })

  it('splits a comma-joined header on the React Native path', async () => {
    const jar = new CookieJar()
    await storeSetCookies(jar, URL_, rnResponse('JSESSIONID=abc; path=/, route=node2; path=/'))

    const header = await cookieHeaderFor(jar, URL_)
    expect(header).toContain('JSESSIONID=abc')
    expect(header).toContain('route=node2')
  })

  it('does not split inside an Expires date', async () => {
    // `Expires=Wed, 09 Jun 2027 …` contains the same delimiter the header uses
    // between cookies.
    //
    // Asserting both cookies arrived is NOT enough — a naive `split(',')`
    // produces those too, because tough-cookie shrugs off the orphaned date
    // fragment. What it silently loses is the expiry: the cookie survives as a
    // session cookie that disappears on the next process, which is the kind of
    // thing that shows up as "imaging works, then stops working". So check the
    // date came through intact.
    const jar = new CookieJar()
    await storeSetCookies(
      jar,
      URL_,
      rnResponse('JSESSIONID=abc; Expires=Wed, 09 Jun 2027 10:18:14 GMT; path=/, route=node2; path=/'),
    )

    const header = await cookieHeaderFor(jar, URL_)
    expect(header).toContain('JSESSIONID=abc')
    expect(header).toContain('route=node2')

    const jsession = (await jar.getCookies(URL_)).find((c) => c.key === 'JSESSIONID')
    expect(jsession!.expires).toBeInstanceOf(Date)
    expect((jsession!.expires as Date).toISOString()).toBe('2027-06-09T10:18:14.000Z')
  })

  it('is a no-op when the response sets nothing', async () => {
    const jar = new CookieJar()
    await storeSetCookies(jar, URL_, rnResponse(''))
    expect(await cookieHeaderFor(jar, URL_)).toBeNull()
  })

  it('keeps the good cookies when one is unparseable', async () => {
    const jar = new CookieJar()
    await storeSetCookies(jar, URL_, new Response('', { headers: { 'Set-Cookie': 'not a cookie' } }))
    await storeSetCookies(jar, URL_, new Response('', { headers: { 'Set-Cookie': 'JSESSIONID=abc; path=/' } }))

    expect(await cookieHeaderFor(jar, URL_)).toContain('JSESSIONID=abc')
  })
})

describe('cookieHeaderFor', () => {
  it('returns null rather than an empty string when the jar has nothing', async () => {
    // scraperFetch tests this for truthiness before setting a header; an empty
    // string would send a bare `Cookie:` on every first request.
    expect(await cookieHeaderFor(new CookieJar(), URL_)).toBeNull()
  })

  it('only offers cookies that match the URL', async () => {
    const jar = new CookieJar()
    await jar.setCookie('session=abc; path=/', 'https://mychart.example.org/')

    expect(await cookieHeaderFor(jar, 'https://mychart.example.org/Home')).toBe('session=abc')
    expect(await cookieHeaderFor(jar, URL_)).toBeNull()
  })
})
