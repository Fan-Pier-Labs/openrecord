import { describe, it, expect, mock } from 'bun:test'
import { areCookiesValid, parse2faDeliveryMethods, parseFirstPathPartFromLocation, parseFirstPathPartFromHtml, parseMetaRefreshTarget, parseFirstPathPartFromInput, extractMountsFromLinks, parseScriptRedirectTarget, determineFirstPathPart, parseLoginPageFields, usernameFieldFromControllerJs, detectUsernameField, probeFirstPathPartByTryingCommonLoginPaths, landsOnMyChartRoute } from '../login'
import { MyChartRequest } from '../myChartRequest'

/**
 * The T&C detection condition used in login.ts (post-login and post-2FA):
 *   urlLower.includes('termsconditions') || (bodyLower.includes('terms and conditions') && !urlLower.includes('/home'))
 *
 * We test the condition logic directly here since it's not extracted into a function.
 */
function shouldDetectTermsAndConditions(url: string, body: string): boolean {
  const urlLower = url.toLowerCase()
  const bodyLower = body.toLowerCase()
  return urlLower.includes('termsconditions') || (bodyLower.includes('terms and conditions') && !urlLower.includes('/home'))
}

describe('T&C detection logic', () => {
  it('detects T&C when URL contains termsconditions', () => {
    expect(shouldDetectTermsAndConditions(
      'https://ucsfmychart.ucsfmedicalcenter.org/UCSFMyChart/Authentication/TermsConditions',
      '<html><body>Please accept</body></html>'
    )).toBe(true)
  })

  it('detects T&C when body contains "terms and conditions" and URL is not Home', () => {
    expect(shouldDetectTermsAndConditions(
      'https://ucsfmychart.ucsfmedicalcenter.org/UCSFMyChart/Authentication/Login',
      '<html><body>Please accept the Terms and Conditions</body></html>'
    )).toBe(true)
  })

  it('does NOT detect T&C when Home page body mentions termsconditions in asset URLs', () => {
    // This is the false positive that caused the UCSF bug — Home page references
    // "termsconditions" in CSS/JS URLs but is not actually the T&C page
    const homePage = `<html><head>
      <link rel="stylesheet" href="/UCSFMyChart/en-us/styles/common.css" />
      <script src="/UCSFMyChart/areas/authentication/scripts/termsconditions.min.js"></script>
    </head><body>Welcome Home</body></html>`
    expect(shouldDetectTermsAndConditions(
      'https://ucsfmychart.ucsfmedicalcenter.org/UCSFMyChart/Home/',
      homePage
    )).toBe(false)
  })

  it('does NOT detect T&C on Home page even if body has "terms and conditions" text', () => {
    // Footer link on home page saying "Terms and Conditions" should not trigger
    const homePage = `<html><body>
      <div>Welcome Home</div>
      <footer><a href="/terms">Terms and Conditions</a></footer>
    </body></html>`
    expect(shouldDetectTermsAndConditions(
      'https://ucsfmychart.ucsfmedicalcenter.org/UCSFMyChart/Home/',
      homePage
    )).toBe(false)
  })

  it('does NOT detect T&C on normal pages without any T&C references', () => {
    expect(shouldDetectTermsAndConditions(
      'https://ucsfmychart.ucsfmedicalcenter.org/UCSFMyChart/Home/',
      '<html><body>md_home_index</body></html>'
    )).toBe(false)
  })

  it('detects T&C when URL has termsconditions even on /home path', () => {
    // Edge case: URL itself contains termsconditions — always detect
    expect(shouldDetectTermsAndConditions(
      'https://example.com/MyChart/Authentication/TermsConditions?redirect=/home',
      '<html><body>Accept terms</body></html>'
    )).toBe(true)
  })
})

describe('areCookiesValid', () => {
  it('returns true when response is 200', async () => {
    const req = new MyChartRequest('mychart.example.com')
    req.firstPathPart = 'MyChart'
    req.fetchWithCookieJar = mock(async () => {
      return new Response('Home page', { status: 200 })
    }) as typeof req.fetchWithCookieJar

    expect(await areCookiesValid(req)).toBe(true)
  })

  it('returns false when response is 302 redirect', async () => {
    const req = new MyChartRequest('mychart.example.com')
    req.firstPathPart = 'MyChart'
    req.fetchWithCookieJar = mock(async () => {
      return new Response('', {
        status: 302,
        headers: { 'Location': '/MyChart/Authentication/Login' }
      })
    }) as typeof req.fetchWithCookieJar

    expect(await areCookiesValid(req)).toBe(false)
  })
})

describe('parse2faDeliveryMethods', () => {
  it('detects SMS-only when page has only "Text to my phone" button', () => {
    const html = `<html><body>
      <div>secondaryvalidationcontroller</div>
      <button>Text to my phone</button>
    </body></html>`
    const result = parse2faDeliveryMethods(html)
    expect(result.hasEmail).toBe(false)
    expect(result.hasSms).toBe(true)
  })

  it('detects email-only when page has only "Email to me" button', () => {
    const html = `<html><body>
      <div>secondaryvalidationcontroller</div>
      <button>Email to me</button>
    </body></html>`
    const result = parse2faDeliveryMethods(html)
    expect(result.hasEmail).toBe(true)
    expect(result.hasSms).toBe(false)
  })

  it('detects both email and SMS when both buttons present', () => {
    const html = `<html><body>
      <div>secondaryvalidationcontroller</div>
      <button>Email to me</button>
      <button>Text to my phone</button>
    </body></html>`
    const result = parse2faDeliveryMethods(html)
    expect(result.hasEmail).toBe(true)
    expect(result.hasSms).toBe(true)
  })

  it('detects neither when no delivery method buttons found', () => {
    const html = `<html><body>
      <div>secondaryvalidationcontroller</div>
      <p>Enter your code</p>
    </body></html>`
    const result = parse2faDeliveryMethods(html)
    expect(result.hasEmail).toBe(false)
    expect(result.hasSms).toBe(false)
  })

  it('extracts masked phone number from page text', () => {
    const html = `<html><body>
      <button>Text to my phone</button>
      <div>We've sent a security code to ***-***-7204.</div>
    </body></html>`
    const result = parse2faDeliveryMethods(html)
    expect(result.hasSms).toBe(true)
    expect(result.smsContact).toBe('***-***-7204')
  })

  it('extracts masked email from page text', () => {
    const html = `<html><body>
      <button>Email to me</button>
      <div>Code sent to ry***@gmail.com</div>
    </body></html>`
    const result = parse2faDeliveryMethods(html)
    expect(result.hasEmail).toBe(true)
    expect(result.emailContact).toBe('ry***@gmail.com')
  })

  it('handles case-insensitive button text', () => {
    const html = `<html><body>
      <button>EMAIL ME A CODE</button>
      <button>TEXT MY PHONE</button>
    </body></html>`
    const result = parse2faDeliveryMethods(html)
    expect(result.hasEmail).toBe(true)
    expect(result.hasSms).toBe(true)
  })

  it('detects SMS from button with "sms" keyword', () => {
    const html = `<html><body>
      <button>Send SMS code</button>
    </body></html>`
    const result = parse2faDeliveryMethods(html)
    expect(result.hasSms).toBe(true)
  })
})

describe('parseFirstPathPartFromLocation', () => {
  it('extracts path part from same-host redirect', () => {
    expect(parseFirstPathPartFromLocation(
      'https://mychart.example.com/MyChart/',
      'mychart.example.com'
    )).toBe('MyChart')
  })

  it('extracts path part from relative redirect', () => {
    expect(parseFirstPathPartFromLocation(
      '/UCSFMyChart/',
      'ucsfmychart.ucsfmedicalcenter.org'
    )).toBe('UCSFMyChart')
  })

  it('extracts path part from cross-domain redirect URL', () => {
    // Note: parseFirstPathPartFromLocation doesn't filter cross-domain —
    // that's handled by determineFirstPathPart
    expect(parseFirstPathPartFromLocation(
      'https://uchealth.org/access-my-health-connection/',
      'mychart.uchealth.org'
    )).toBe('access-my-health-connection')
  })

  it('returns null for root redirect with no path', () => {
    expect(parseFirstPathPartFromLocation(
      'https://mychart.example.com/',
      'mychart.example.com'
    )).toBe(null)
  })

  it('handles a path part with a hyphen', () => {
    expect(parseFirstPathPartFromLocation(
      '/MyChart-PRD/Authentication/Login',
      'mychart.example.com'
    )).toBe('MyChart-PRD')
  })

  it('handles a path with no trailing slash or segments', () => {
    expect(parseFirstPathPartFromLocation('/MyChart', 'mychart.example.com')).toBe('MyChart')
  })

  it('returns null for an absolute URL with no path at all', () => {
    expect(parseFirstPathPartFromLocation(
      'https://mychart.example.com',
      'mychart.example.com'
    )).toBe(null)
  })

  it('ignores query parameters', () => {
    expect(parseFirstPathPartFromLocation(
      '/MyChart/Login?redirect=home',
      'mychart.example.com'
    )).toBe('MyChart')
  })

  it('preserves the instance-specific casing of the path part', () => {
    expect(parseFirstPathPartFromLocation('/mychart/', 'h.com')).toBe('mychart')
    expect(parseFirstPathPartFromLocation('/chart/', 'h.com')).toBe('chart')
    expect(parseFirstPathPartFromLocation('/epicmychart/', 'h.com')).toBe('epicmychart')
  })

  it('returns null when the redirect goes straight to a MyChart route (root-mounted instance)', () => {
    // Cleveland Clinic redirects / -> ./Authentication/Login?, meaning MyChart is
    // served from the domain root. Treating "Authentication" as the path prefix
    // produced /Authentication/Authentication/Login, which 404s.
    expect(parseFirstPathPartFromLocation(
      './Authentication/Login?',
      'mychart.clevelandclinic.org'
    )).toBe(null)
  })

  it('takes everything in front of the route when a prefix and a route appear together', () => {
    expect(parseFirstPathPartFromLocation(
      '/prd/Authentication/Login',
      'mychart.example.com'
    )).toBe('prd')
  })

  it('still extracts a real prefix that merely resembles a route name', () => {
    expect(parseFirstPathPartFromLocation(
      '/MyChartAuthentication/',
      'mychart.example.com'
    )).toBe('MyChartAuthentication')
  })
})

describe('landsOnMyChartRoute', () => {
  it('recognizes a MyChart route case-insensitively', () => {
    expect(landsOnMyChartRoute('/Authentication/Login')).toBe(true)
    expect(landsOnMyChartRoute('/authentication/login')).toBe(true)
    expect(landsOnMyChartRoute('/prd/Authentication/Login')).toBe(true)
  })

  it('does not fire on a bare deployment prefix', () => {
    expect(landsOnMyChartRoute('/MyChart/')).toBe(false)
    expect(landsOnMyChartRoute('/UCSFMyChart/')).toBe(false)
    expect(landsOnMyChartRoute('/')).toBe(false)
  })
})

describe('parseFirstPathPartFromHtml', () => {
  it('extracts path from meta refresh tag', () => {
    const html = '<html><head><meta http-equiv="REFRESH" content="0;URL=/MyChart/"></head></html>'
    expect(parseFirstPathPartFromHtml(html)).toBe('MyChart')
  })

  it('returns null when no meta refresh tag', () => {
    const html = '<html><body>Hello</body></html>'
    expect(parseFirstPathPartFromHtml(html)).toBe(null)
  })

  it('extracts a path part with a hyphen', () => {
    const html = `<meta http-equiv="REFRESH" content="0; URL=/MyChart-PRD/" />`
    expect(parseFirstPathPartFromHtml(html)).toBe('MyChart-PRD')
  })

  it('handles a lowercase url= key', () => {
    const html = `<meta http-equiv="REFRESH" content="0; url=/MyChart/" />`
    expect(parseFirstPathPartFromHtml(html)).toBe('MyChart')
  })

  it('returns null for empty HTML', () => {
    expect(parseFirstPathPartFromHtml('')).toBe(null)
  })

  it('returns null when the meta refresh has no URL part', () => {
    expect(parseFirstPathPartFromHtml('<meta http-equiv="REFRESH" content="5" />')).toBe(null)
  })

  it('handles a non-MyChart path part', () => {
    const html = `<meta http-equiv="REFRESH" content="0; URL=/PatientPortal/" />`
    expect(parseFirstPathPartFromHtml(html)).toBe('PatientPortal')
  })

  it('handles extra whitespace in the content attribute', () => {
    const html = `<meta http-equiv="REFRESH" content="0;  URL=/MyChart/" />`
    expect(parseFirstPathPartFromHtml(html)).toBe('MyChart')
  })

  it('strips leading and trailing slashes from the path part', () => {
    const result = parseFirstPathPartFromHtml('<meta http-equiv="REFRESH" content="0; URL=/MyChart/" />')
    expect(result).toBe('MyChart')
    expect(result).not.toContain('/')
  })

  // Renown's root page refreshes to an absolute URL. Stripping every `/` used to
  // fold the host into the prefix and produce `https:mychart.renown.orgmychart`.
  it('extracts the path part from an absolute refresh URL', () => {
    const html = '<meta http-equiv="refresh" content="1 ;url=https://mychart.renown.org/mychart">'
    expect(parseFirstPathPartFromHtml(html)).toBe('mychart')
  })

  // Captured verbatim from GET https://mychart.renown.org/ — a public redirect
  // stub, no session or patient data in it. Kept byte-for-byte (uppercase tags,
  // the space before the `;`, the lowercase `url=`) because every one of those
  // quirks is something the parser has to survive.
  it('handles the real Renown root page', () => {
    const html = `<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN" "http://www.w3.org/TR/html4/loose.dtd">
<HTML>
<HEAD>
<TITLE>MyChart - Login Page</TITLE>
<meta http-equiv="refresh" content="1 ;url=https://mychart.renown.org/mychart">

</HEAD>
<BODY>
<!-- this is a redirect to MyChart -->
</BODY>
</HTML>`
    expect(parseFirstPathPartFromHtml(html)).toBe('mychart')
    expect(parseFirstPathPartFromHtml(html, 'mychart.renown.org')).toBe('mychart')
  })

  it('extracts the path part from an absolute refresh URL with a deeper path', () => {
    const html = '<meta http-equiv="refresh" content="0; URL=https://mychart.example.org/MyChart-PRD/Authentication/Login">'
    expect(parseFirstPathPartFromHtml(html)).toBe('MyChart-PRD')
  })

  it('returns null for an absolute refresh URL mounted at the domain root', () => {
    const html = '<meta http-equiv="refresh" content="0; URL=https://mychart.example.org/">'
    expect(parseFirstPathPartFromHtml(html)).toBe(null)
  })

  it('returns null when the refresh goes straight to a root-mounted MyChart route', () => {
    // Nothing in front of /Authentication/, so there is no prefix to report.
    const html = '<meta http-equiv="refresh" content="0; URL=/Authentication/Login">'
    expect(parseFirstPathPartFromHtml(html)).toBe(null)
  })

  it('takes everything in front of a MyChart route as the prefix', () => {
    const html = '<meta http-equiv="refresh" content="0; URL=https://mychart.example.org/prd/Authentication/Login">'
    expect(parseFirstPathPartFromHtml(html)).toBe('prd')
  })

  it('keeps a query string out of the path part', () => {
    const html = '<meta http-equiv="refresh" content="0; URL=/MyChart/Authentication/Login?mode=stdfile&option=termsandconditions">'
    expect(parseFirstPathPartFromHtml(html)).toBe('MyChart')
  })

  it('handles a quoted refresh target', () => {
    const html = `<meta http-equiv="refresh" content="0; url='https://mychart.example.org/MyChart/'">`
    expect(parseFirstPathPartFromHtml(html)).toBe('MyChart')
  })

  it('accepts an absolute refresh URL that stays on the expected host', () => {
    const html = '<meta http-equiv="refresh" content="1 ;url=https://mychart.renown.org/mychart">'
    expect(parseFirstPathPartFromHtml(html, 'mychart.renown.org')).toBe('mychart')
  })

  it('rejects a refresh that points at a different host', () => {
    const html = '<meta http-equiv="refresh" content="0; URL=https://www.renown.org/patients/">'
    expect(parseFirstPathPartFromHtml(html, 'mychart.renown.org')).toBe(null)
  })

  it('resolves a relative refresh against the expected host', () => {
    const html = '<meta http-equiv="refresh" content="0; URL=/MyChart/" />'
    expect(parseFirstPathPartFromHtml(html, 'mychart.example.org')).toBe('MyChart')
  })
})

describe('parseMetaRefreshTarget', () => {
  // parseFirstPathPartFromHtml returns null for both "root-mounted" and "no
  // refresh tag". Discovery has to tell those apart — the first is an answer,
  // the second means keep looking — so it works off the target URL instead.
  it('distinguishes a root-mounted instance from a page with no refresh tag', () => {
    const rootMounted = parseMetaRefreshTarget('<meta http-equiv="refresh" content="0; URL=/Authentication/Login">')
    expect(rootMounted).not.toBeNull()
    expect(landsOnMyChartRoute(rootMounted!.pathname)).toBe(true)
    expect(parseFirstPathPartFromHtml('<meta http-equiv="refresh" content="0; URL=/Authentication/Login">')).toBe(null)

    expect(parseMetaRefreshTarget('<html><body>Hello</body></html>')).toBe(null)
  })

  it('resolves an absolute target as written', () => {
    const target = parseMetaRefreshTarget('<meta http-equiv="refresh" content="1 ;url=https://mychart.renown.org/mychart">')
    expect(target?.href).toBe('https://mychart.renown.org/mychart')
    // Renown's target is not itself a MyChart route, so discovery keeps going
    // rather than short-circuiting on it.
    expect(landsOnMyChartRoute(target!.pathname)).toBe(false)
  })

  it('resolves a relative target against the expected host', () => {
    const target = parseMetaRefreshTarget('<meta http-equiv="refresh" content="0; URL=/MyChart/">', 'mychart.example.org')
    expect(target?.href).toBe('https://mychart.example.org/MyChart/')
  })

  it('rejects a target on another host', () => {
    const html = '<meta http-equiv="refresh" content="0; URL=https://www.renown.org/patients/">'
    expect(parseMetaRefreshTarget(html, 'mychart.renown.org')).toBe(null)
  })
})

describe('parseFirstPathPartFromInput', () => {
  it('extracts MyChart path from a full user-provided URL', () => {
    expect(parseFirstPathPartFromInput(
      'https://mychart.uchealth.org/MyChart/Authentication/Login'
    )).toBe('MyChart')
  })

  it('returns null when the URL path is not a MyChart path', () => {
    expect(parseFirstPathPartFromInput(
      'https://uchealth.org/access-my-health-connection/'
    )).toBe(null)
  })
})

describe('cross-domain redirect handling', () => {
  it('detects cross-domain redirect correctly', () => {
    // Use url.host (not url.hostname) to include port in comparison,
    // since mychartRequest.hostname may include a port (e.g. localhost:4001)
    const cases = [
      { location: 'https://uchealth.org/path/', hostname: 'mychart.uchealth.org', isCrossDomain: true },
      { location: 'https://www.uchealth.org/path/', hostname: 'mychart.uchealth.org', isCrossDomain: true },
      { location: 'https://mychart.uchealth.org/MyChart/', hostname: 'mychart.uchealth.org', isCrossDomain: false },
      { location: '/MyChart/', hostname: 'mychart.example.com', isCrossDomain: false },
      // localhost with port — must NOT be detected as cross-domain
      { location: 'http://localhost:4001/MyChart/', hostname: 'localhost:4001', isCrossDomain: false },
      { location: 'http://localhost:4000/MyChart/', hostname: 'localhost:4000', isCrossDomain: false },
    ]

    for (const { location, hostname, isCrossDomain } of cases) {
      const url = new URL(location, `https://${hostname}`)
      expect(url.host !== hostname).toBe(isCrossDomain)
    }
  })
})

/**
 * A stand-in for a MyChart deployment: a routing table of URL → response.
 *
 * `302: '<location>'` for a redirect (relative Locations are left exactly as a
 * real instance writes them — `DefaultAsp` with no leading slash is the whole
 * point of several of these tests), or a body string for a 200.
 */
type Route = { redirect: string; status?: number } | { body: string; status?: number }

function fakeInstance(routes: Record<string, Route>) {
  return mock(async (url: string | URL | Request) => {
    const href = url.toString()
    const route = routes[href] ?? routes[href.replace(/\?$/, '')]
    if (!route) return new Response('<html><body>Not found</body></html>', { status: 404 })
    if ('redirect' in route) {
      return new Response(null, { status: route.status ?? 302, headers: { Location: route.redirect } })
    }
    return new Response(route.body, { status: route.status ?? 200 })
  })
}

const LOGIN_PAGE = '<html><body><input name="__RequestVerificationToken" value="tok" /></body></html>'

describe('parseScriptRedirectTarget', () => {
  it('reads a window.location assignment (mydovetale.ca)', () => {
    const html = `<script type="text/javascript">
      <!--
      window.location="https://mydovetale.ca/MyDovetale/";
      // -->
    </script>`
    expect(parseScriptRedirectTarget(html, 'https://mydovetale.ca')?.href).toBe('https://mydovetale.ca/MyDovetale/')
  })

  it('reads location.href and location.replace forms', () => {
    expect(parseScriptRedirectTarget(`<script>location.href = '/MyChart/';</script>`, 'https://h.org')?.href)
      .toBe('https://h.org/MyChart/')
    expect(parseScriptRedirectTarget(`<script>window.location.replace("/prd/")</script>`, 'https://h.org')?.href)
      .toBe('https://h.org/prd/')
  })

  it('returns null when the page has no scripted redirect', () => {
    expect(parseScriptRedirectTarget('<html><body>Welcome</body></html>', 'https://h.org')).toBe(null)
  })
})

describe('extractMountsFromLinks', () => {
  it('prefers a link that names the login route over a bare mount link', () => {
    // www.johnmuirhealth.com — a marketing homepage whose only useful link is
    // the portal button, pointing at another host entirely.
    const html = `<html><body>
      <a href="/content/jmh/en/home.html">Home</a>
      <a href="https://mychart.johnmuirhealth.com">MyChart</a>
      <a href="https://mychart.johnmuirhealth.com/mychartmcmprd/Authentication/Login?">Log in</a>
    </body></html>`
    expect(extractMountsFromLinks(html, 'www.johnmuirhealth.com')[0])
      .toEqual({ hostname: 'mychart.johnmuirhealth.com', firstPathPart: 'mychartmcmprd' })
  })

  it('reads the mount off an affiliate chooser page (mychart.chihealth.com)', () => {
    const html = `<html><body>
      <a href="https://mychart.chihealth.com/prd/"><img src="CHImychartlogo.png" /></a>
      <a href="https://mychartsta.chihealth.com/staprd/"><img src="STALEXISmychartlogo.png" /></a>
    </body></html>`
    const mounts = extractMountsFromLinks(html, 'mychart.chihealth.com')
    // Same host as the one asked for wins the tie against the sister portal.
    expect(mounts[0]).toEqual({ hostname: 'mychart.chihealth.com', firstPathPart: 'prd' })
    expect(mounts).toContainEqual({ hostname: 'mychartsta.chihealth.com', firstPathPart: 'staprd' })
  })

  it('finds a mount referenced only from a script src', () => {
    const html = `<html><body>
      <script src="https://mychart.hospital.org/MyChart/Scripts/lib/Widget/widget_sdk.js"></script>
    </body></html>`
    expect(extractMountsFromLinks(html, 'mychart.hospital.org')[0])
      .toEqual({ hostname: 'mychart.hospital.org', firstPathPart: 'MyChart' })
  })

  it('finds a mount in a data attribute, hyphens and digits intact', () => {
    const html = `<html><body>
      <div data-mhc-url="https://mychart.example.com/MyChart-PRD2" class="login-widget"></div>
    </body></html>`
    expect(extractMountsFromLinks(html, 'mychart.example.com')[0])
      .toEqual({ hostname: 'mychart.example.com', firstPathPart: 'MyChart-PRD2' })
  })

  it('ranks by reference count once route and host are tied', () => {
    const html = `<html><body>
      <script src="https://mychart.hospital.org/MyChart/Scripts/widget.js"></script>
      <script src="https://mychart.hospital.org/MyChart/Scripts/login.js"></script>
      <script src="https://mychart.hospital.org/MyChart/Scripts/util.js"></script>
      <a href="https://mychart.hospital.org/portal2/signup">Sign up</a>
    </body></html>`
    expect(extractMountsFromLinks(html, 'mychart.hospital.org')[0])
      .toEqual({ hostname: 'mychart.hospital.org', firstPathPart: 'MyChart' })
  })

  it('keeps affiliate mounts that name neither the route nor MyChart', () => {
    // mychart.northmemorial.com lists its affiliates as bare mounts. None of
    // them says "mychart", so a name filter would throw all of them away and
    // leave nothing to try.
    const html = `<html><body>
      <a href='https://mychart.northmemorial.com/NorthMemorial/'>North Memorial</a>
      <a href='https://mychart.northmemorial.com/NorthLung/'>Lung</a>
      <a href='https://mychart.northmemorial.com/umpbroadway/'>Broadway</a>
      <link href="en-US/styles/Affiliates.css" rel="stylesheet" />
    </body></html>`
    const mounts = extractMountsFromLinks(html, 'mychart.northmemorial.com')
    expect(mounts.map(m => m.firstPathPart)).toEqual(['NorthMemorial', 'NorthLung', 'umpbroadway'])
  })

  it('ignores ordinary marketing-site paths', () => {
    const html = `<html><body>
      <a href="/content/dam/jmh/home-page/doctor.jpg">Doctors</a>
      <a href="https://hospital.org/patients-and-visitors/find-out-more.html">More</a>
      <p>Welcome to our hospital. Visit our patient portal.</p>
    </body></html>`
    expect(extractMountsFromLinks(html, 'hospital.org')).toEqual([])
  })

  it('treats UCSFMyChart-style non-standard prefixes as mounts', () => {
    const html = `<script src="https://ucsfmychart.ucsfmedicalcenter.org/UCSFMyChart/Scripts/lib/Widget/widget_sdk.js"></script>`
    expect(extractMountsFromLinks(html, 'ucsfmychart.ucsfmedicalcenter.org')[0])
      .toEqual({ hostname: 'ucsfmychart.ucsfmedicalcenter.org', firstPathPart: 'UCSFMyChart' })
  })
})

describe('determineFirstPathPart', () => {
  it('follows the DefaultAsp hop to find a root-mounted instance (adams.mychartcc.com)', async () => {
    // The first hop is a bare relative `DefaultAsp`. Reading only that hop
    // yields the nonsense prefix "DefaultAsp"; the instance is root-mounted.
    const req = new MyChartRequest('adams.mychartcc.com')
    req.fetchWithCookieJar = fakeInstance({
      'https://adams.mychartcc.com': { redirect: 'DefaultAsp' },
      'https://adams.mychartcc.com/DefaultAsp': { redirect: '/Authentication/Login?' },
    }) as typeof req.fetchWithCookieJar

    await determineFirstPathPart(req)
    expect(req.firstPathPart).toBe(null)
    expect(req.hostname).toBe('adams.mychartcc.com')
  })

  it('follows the DefaultAsp hop to find a prefixed instance (mychart.bsahs.org)', async () => {
    const req = new MyChartRequest('mychart.bsahs.org')
    req.fetchWithCookieJar = fakeInstance({
      'https://mychart.bsahs.org': { redirect: 'DefaultAsp' },
      'https://mychart.bsahs.org/DefaultAsp': { redirect: '/bsa/Authentication/Login?' },
    }) as typeof req.fetchWithCookieJar

    await determineFirstPathPart(req)
    expect(req.firstPathPart).toBe('bsa')
  })

  it('follows the full four-hop chain (/ → /MyChart/ → DefaultAsp → login)', async () => {
    const req = new MyChartRequest('mychart.conemaugh.org')
    req.fetchWithCookieJar = fakeInstance({
      'https://mychart.conemaugh.org': { redirect: '/MyChart' },
      'https://mychart.conemaugh.org/MyChart': { redirect: 'https://mychart.conemaugh.org/MyChart/', status: 301 },
      'https://mychart.conemaugh.org/MyChart/': { redirect: 'DefaultAsp' },
      'https://mychart.conemaugh.org/MyChart/DefaultAsp': { redirect: '/MyChart/Authentication/Login?' },
    }) as typeof req.fetchWithCookieJar

    await determineFirstPathPart(req)
    expect(req.firstPathPart).toBe('MyChart')
  })

  it('handles a ./Authentication/Login hop relative to the mount (mycslink)', async () => {
    const req = new MyChartRequest('mycslink.cedars-sinai.org')
    req.fetchWithCookieJar = fakeInstance({
      'https://mycslink.cedars-sinai.org': { redirect: 'https://mycslink.cedars-sinai.org/mycslink', status: 301 },
      'https://mycslink.cedars-sinai.org/mycslink': { redirect: 'https://mycslink.cedars-sinai.org/mycslink/', status: 301 },
      'https://mycslink.cedars-sinai.org/mycslink/': { redirect: './Authentication/Login?' },
    }) as typeof req.fetchWithCookieJar

    await determineFirstPathPart(req)
    expect(req.firstPathPart).toBe('mycslink')
  })

  it('moves to the host a vanity domain redirects to (patients.mycslink.org)', async () => {
    const req = new MyChartRequest('patients.mycslink.org')
    req.fetchWithCookieJar = fakeInstance({
      'https://patients.mycslink.org': { redirect: 'https://mycslink.cedars-sinai.org/', status: 301 },
      'https://mycslink.cedars-sinai.org/': { redirect: 'https://mycslink.cedars-sinai.org/mycslink', status: 301 },
      'https://mycslink.cedars-sinai.org/mycslink': { redirect: 'https://mycslink.cedars-sinai.org/mycslink/', status: 301 },
      'https://mycslink.cedars-sinai.org/mycslink/': { redirect: './Authentication/Login?' },
      'https://mycslink.cedars-sinai.org/mycslink/Authentication/Login': { body: LOGIN_PAGE },
    }) as typeof req.fetchWithCookieJar

    await determineFirstPathPart(req)
    expect(req.hostname).toBe('mycslink.cedars-sinai.org')
    expect(req.firstPathPart).toBe('mycslink')
  })

  it('refuses to move hosts when the new host does not serve a login page', async () => {
    // A redirect out to a marketing site that happens to have an
    // /Authentication/ path must not capture the session.
    const req = new MyChartRequest('mychart.hospital.org')
    req.fetchWithCookieJar = fakeInstance({
      'https://mychart.hospital.org': { redirect: 'https://ads.example.com/promo/Authentication/Login', status: 302 },
      'https://ads.example.com/promo/Authentication/Login': { body: '<html><body>Buy now</body></html>' },
    }) as typeof req.fetchWithCookieJar

    await determineFirstPathPart(req)
    expect(req.hostname).toBe('mychart.hospital.org')
  })

  it('follows a scripted window.location redirect (mydovetale.ca)', async () => {
    const req = new MyChartRequest('mydovetale.ca')
    req.fetchWithCookieJar = fakeInstance({
      'https://mydovetale.ca': { body: `<script>window.location="https://mydovetale.ca/MyDovetale/";</script>` },
      'https://mydovetale.ca/MyDovetale/': { redirect: 'DefaultAsp' },
      'https://mydovetale.ca/MyDovetale/DefaultAsp': { redirect: '/MyDovetale/Authentication/Login?' },
    }) as typeof req.fetchWithCookieJar

    await determineFirstPathPart(req)
    expect(req.firstPathPart).toBe('MyDovetale')
  })

  it('reads the mount off a landing page when the chain dead-ends', async () => {
    // mychart.chihealth.com answers 200 with a chooser page and no redirect.
    const req = new MyChartRequest('mychart.chihealth.com')
    req.fetchWithCookieJar = fakeInstance({
      'https://mychart.chihealth.com': { body: `<html><body>
        <a href="https://mychart.chihealth.com/prd/">CHI</a>
        <a href="https://mychartsta.chihealth.com/staprd/">St Alexius</a>
      </body></html>` },
      'https://mychart.chihealth.com/prd/Authentication/Login': { body: LOGIN_PAGE },
    }) as typeof req.fetchWithCookieJar

    await determineFirstPathPart(req)
    expect(req.firstPathPart).toBe('prd')
    expect(req.hostname).toBe('mychart.chihealth.com')
  })

  it('does not mistake a load balancer stop for a mount (BIG-IP /my.policy)', async () => {
    // F5 puts /my.policy in front of the instance. It is not a prefix, and
    // guessing it would 404 every subsequent request.
    const req = new MyChartRequest('mymsdh.umc.edu')
    req.fetchWithCookieJar = fakeInstance({
      'https://mymsdh.umc.edu': { redirect: '/my.policy' },
      'https://mymsdh.umc.edu/my.policy': { body: '<html><head><title>BIG-IP logout page</title></head></html>' },
      'https://mymsdh.umc.edu/MyChart/Authentication/Login': { body: LOGIN_PAGE },
    }) as typeof req.fetchWithCookieJar

    await determineFirstPathPart(req)
    expect(req.firstPathPart).not.toBe('my.policy')
    // Nothing on the page names the real mount, so the common-prefix probe is
    // the only thing left — and it is allowed to answer.
    expect(req.firstPathPart).toBe('MyChart')
  })

  it('gives up rather than inventing a prefix when nothing announces the mount', async () => {
    const req = new MyChartRequest('mychart.adventhealth.com')
    req.fetchWithCookieJar = fakeInstance({
      'https://mychart.adventhealth.com': { body: '<html><center> EP-MYC-PRD501 </center></html>' },
    }) as typeof req.fetchWithCookieJar

    await determineFirstPathPart(req)
    expect(req.firstPathPart).toBe(null)
  })

  it('stops instead of looping when a URL redirects to itself', async () => {
    const req = new MyChartRequest('mychart.crossingrivers.org')
    req.fetchWithCookieJar = fakeInstance({
      'https://mychart.crossingrivers.org': { redirect: 'https://mychart.crossingrivers.org/CRH/', status: 301 },
      'https://mychart.crossingrivers.org/CRH/': { redirect: 'https://mychart.crossingrivers.org/CRH/', status: 301 },
    }) as typeof req.fetchWithCookieJar

    await determineFirstPathPart(req)
    // The loop is broken and discovery falls through; what matters is that it
    // returns at all rather than recursing until the stack gives out.
    expect(req.firstPathPart).toBe(null)
  })

  it('keeps a prefix the caller already supplied', async () => {
    const req = new MyChartRequest('mychart.example.org')
    req.setFirstPathPart('CustomPrefix')
    req.fetchWithCookieJar = mock(async () => { throw new Error('should not make any request') }) as typeof req.fetchWithCookieJar

    await determineFirstPathPart(req)
    expect(req.firstPathPart).toBe('CustomPrefix')
  })

  it('still reads a plain single-hop redirect to the mount', async () => {
    // The common case, and the one the old single-hop reader got right.
    const req = new MyChartRequest('mychart.ochin.org')
    req.fetchWithCookieJar = fakeInstance({
      'https://mychart.ochin.org': { redirect: 'https://mychart.ochin.org/mychart/' },
      'https://mychart.ochin.org/mychart/': { redirect: '/mychart/Authentication/Login?' },
    }) as typeof req.fetchWithCookieJar

    await determineFirstPathPart(req)
    expect(req.firstPathPart).toBe('mychart')
  })

  it('reads an absolute meta refresh, still (Renown)', async () => {
    const req = new MyChartRequest('mychart.renown.org')
    req.fetchWithCookieJar = fakeInstance({
      'https://mychart.renown.org': { body: `<html><head><meta http-equiv="REFRESH" content="1 ;url=https://mychart.renown.org/mychart"></head></html>` },
      'https://mychart.renown.org/mychart': { redirect: '/mychart/Authentication/Login?' },
    }) as typeof req.fetchWithCookieJar

    await determineFirstPathPart(req)
    expect(req.firstPathPart).toBe('mychart')
  })
})

describe('parseLoginPageFields', () => {
  it('reads the hidden metrics fields the login form posts back', () => {
    const html = `<html><body><form>
      <input name="__RequestVerificationToken" value="tok" />
      <input name="__NavigationRequestMetrics" value="abc123" />
      <input name="__NavigationRedirectMetrics" value='[{"x":1}]' />
      <input name="__RedirectChainIncludesLogin" value="1" />
      <input name="__CurrentPageLoadDescriptor" value="pld-9" />
      <input name="__RttCaptureEnabled" value="0" />
    </form></body></html>`
    expect(parseLoginPageFields(html)).toEqual({
      navRequestMetrics: 'abc123',
      navRedirectMetrics: '[{"x":1}]',
      redirectChainIncludesLogin: '1',
      currentPageLoadDescriptor: 'pld-9',
      rttCaptureEnabled: '0',
    })
  })

  it('falls back to the defaults MyChart\'s own JS uses when fields are absent', () => {
    expect(parseLoginPageFields('<html><body><form></form></body></html>')).toEqual({
      navRequestMetrics: '',
      navRedirectMetrics: '[]',
      redirectChainIncludesLogin: '0',
      currentPageLoadDescriptor: '',
      rttCaptureEnabled: '1',
    })
  })
})

describe('usernameFieldFromControllerJs', () => {
  it('picks Username when the controller only names Username', () => {
    expect(usernameFieldFromControllerJs(`WP.Login.Submit({Credentials: { Username: u, Password: p }})`))
      .toBe('Username')
  })

  it('picks LoginIdentifier when the controller names it', () => {
    expect(usernameFieldFromControllerJs(`WP.Login.Submit({Credentials: { LoginIdentifier: u, Password: p }})`))
      .toBe('LoginIdentifier')
  })

  it('defaults to LoginIdentifier when the JS says nothing useful', () => {
    expect(usernameFieldFromControllerJs('var x = 1;')).toBe('LoginIdentifier')
  })
})

describe('detectUsernameField', () => {
  it('fetches the controller script relative to the host discovery settled on', async () => {
    // The session may have moved hosts during discovery; the script has to be
    // fetched from where MyChart actually is, not from what the user typed.
    const req = new MyChartRequest('patients.mycslink.org')
    req.setHostname('mycslink.cedars-sinai.org')
    const fetched: string[] = []
    req.fetchWithCookieJar = mock(async (url: string | URL | Request) => {
      fetched.push(url.toString())
      return new Response('Credentials: { Username: u, Password: p }', { status: 200 })
    }) as typeof req.fetchWithCookieJar

    const field = await detectUsernameField(req, `<html><script src="/mycslink/scripts/loginpagecontroller.min.js"></script></html>`)
    expect(fetched[0]).toBe('https://mycslink.cedars-sinai.org/mycslink/scripts/loginpagecontroller.min.js')
    expect(field).toBe('Username')
  })

  it('defaults to LoginIdentifier when the page references no controller', async () => {
    const req = new MyChartRequest('mychart.example.org')
    req.fetchWithCookieJar = mock(async () => { throw new Error('should not fetch') }) as typeof req.fetchWithCookieJar
    expect(await detectUsernameField(req, '<html></html>')).toBe('LoginIdentifier')
  })

  it('defaults to LoginIdentifier when the controller script cannot be fetched', async () => {
    const req = new MyChartRequest('mychart.example.org')
    req.fetchWithCookieJar = mock(async () => { throw new Error('Network error') }) as typeof req.fetchWithCookieJar
    expect(await detectUsernameField(req, `<html><script src="/MyChart/loginpagecontroller.js"></script></html>`))
      .toBe('LoginIdentifier')
  })
})

describe('probeFirstPathPartByTryingCommonLoginPaths', () => {
  it('recovers MyChart when marketing-page discovery fails', async () => {
    const req = new MyChartRequest('mychart.uchealth.org')
    req.fetchWithCookieJar = mock(async (url: string | URL | Request) => {
      const href = url.toString()
      if (href === 'https://mychart.uchealth.org/MyChart/Authentication/Login') {
        return new Response(`<html><body>
          <input name="__RequestVerificationToken" value="csrf-token" />
        </body></html>`, { status: 200 })
      }
      return new Response('<html><body>Not found</body></html>', { status: 404 })
    }) as typeof req.fetchWithCookieJar

    const result = await probeFirstPathPartByTryingCommonLoginPaths(req)
    expect(result).toBe('MyChart')
  })

  it('returns null when common login paths do not work', async () => {
    const req = new MyChartRequest('mychart.example.com')
    req.fetchWithCookieJar = mock(async () => {
      return new Response('<html><body>Not found</body></html>', { status: 404 })
    }) as typeof req.fetchWithCookieJar

    const result = await probeFirstPathPartByTryingCommonLoginPaths(req)
    expect(result).toBe(null)
  })
})
