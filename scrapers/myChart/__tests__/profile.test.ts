import { describe, it, expect, mock } from 'bun:test'
import { getMyChartProfile, getEmail, parseProfileHtml } from '../profile'
import { MyChartRequest } from '../myChartRequest'

function mockRequest(body: string) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  req.transport = mock(async () => {
    return new Response(body, { status: 200 })
  }) as typeof req.transport
  return req
}

describe('getMyChartProfile', () => {
  it('parses a standard profile page', async () => {
    const html = `
      <html>
        <body>
          <div class="printheader">Name: John Smith | DOB: 1/15/1990 | MRN: 123456 | PCP: Dr. Jane Doe</div>
        </body>
      </html>
    `
    expect(await getMyChartProfile(mockRequest(html))).toEqual({
      name: 'John Smith',
      dob: '1/15/1990',
      mrn: '123456',
      pcp: 'Dr. Jane Doe',
    })
  })

  it('parses profile with two-digit month and day', async () => {
    const html = `<div class="printheader">Name: Alice Johnson | DOB: 12/25/1985 | MRN: 789012 | PCP: Dr. Bob Williams</div>`
    expect(await getMyChartProfile(mockRequest(html))).toEqual({
      name: 'Alice Johnson',
      dob: '12/25/1985',
      mrn: '789012',
      pcp: 'Dr. Bob Williams',
    })
  })

  it('parses profile with empty PCP', async () => {
    const html = `<div class="printheader">Name: No PCP Patient | DOB: 6/1/1995 | MRN: 333444 | PCP: </div>`
    const result = await getMyChartProfile(mockRequest(html))
    expect(result).not.toBeNull()
    expect(result!.name).toBe('No PCP Patient')
    expect(result!.pcp).toBe('')
  })

  it('parses profile with long PCP name including credentials', async () => {
    const html = `<div class="printheader">Name: Jane Doe | DOB: 7/20/1988 | MRN: 555666 | PCP: Robert A. Johnson, MD, FACP</div>`
    const result = await getMyChartProfile(mockRequest(html))
    expect(result).not.toBeNull()
    expect(result!.pcp).toBe('Robert A. Johnson, MD, FACP')
  })

  it('returns null when printheader div is missing', async () => {
    const html = `<html><body><div class="some-other-class">Content here</div></body></html>`
    expect(await getMyChartProfile(mockRequest(html))).toBeNull()
  })

  it('returns null when printheader has wrong format', async () => {
    const html = `<div class="printheader">Welcome to MyChart</div>`
    expect(await getMyChartProfile(mockRequest(html))).toBeNull()
  })

  it('returns null for empty HTML', async () => {
    expect(await getMyChartProfile(mockRequest(''))).toBeNull()
  })

  it('handles name with hyphens and suffixes', async () => {
    const html = `<div class="printheader">Name: Mary-Jane O'Brien III | DOB: 11/30/1975 | MRN: 999888 | PCP: Dr. Lee</div>`
    const result = await getMyChartProfile(mockRequest(html))
    expect(result).not.toBeNull()
    expect(result!.name).toBe("Mary-Jane O'Brien III")
    expect(result!.mrn).toBe('999888')
  })

  it('handles realistic page with surrounding content', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
      <head><title>MyChart - Home</title></head>
      <body>
        <header><nav>Navigation content</nav></header>
        <div class="printheader">Name: Ryan Hughes | DOB: 4/10/1992 | MRN: 112233 | PCP: Dr. Sarah Connor</div>
        <div class="main-content"><h1>Welcome, Ryan!</h1></div>
        <footer>Footer content</footer>
      </body>
      </html>
    `
    expect(await getMyChartProfile(mockRequest(html))).toEqual({
      name: 'Ryan Hughes',
      dob: '4/10/1992',
      mrn: '112233',
      pcp: 'Dr. Sarah Connor',
    })
  })
})

describe('parseProfileHtml', () => {
  it('parses profile with single-digit month and day', () => {
    const html = `<div class="printheader">Name: Test User | DOB: 3/5/2000 | MRN: 111222 | PCP: Dr. Smith</div>`
    expect(parseProfileHtml(html)).toEqual({
      name: 'Test User',
      dob: '3/5/2000',
      mrn: '111222',
      pcp: 'Dr. Smith',
    })
  })

  it('returns null when printheader exists but has no text', () => {
    expect(parseProfileHtml('<div class="printheader"></div>')).toBeNull()
  })

  it('handles printheader with extra whitespace', () => {
    const html = `
      <div class="printheader">
        Name: Whitespace User | DOB: 2/28/1980 | MRN: 445566 | PCP: Dr. Space
      </div>
    `
    const result = parseProfileHtml(html)
    expect(result).not.toBeNull()
    expect(result!.name).toBe('Whitespace User')
  })

  it('parses MyChart Central format with only Name and DOB', () => {
    const html = `
      <div class="printheader">
                Name: Central Patient | DOB: 4/2/1973
            </div>
    `
    expect(parseProfileHtml(html)).toEqual({
      name: 'Central Patient',
      dob: '4/2/1973',
      mrn: '',
      pcp: '',
    })
  })

  it('parses Name | DOB | MRN without PCP', () => {
    const html = `<div class="printheader">Name: Jane Doe | DOB: 6/15/1990 | MRN: 112233</div>`
    expect(parseProfileHtml(html)).toEqual({
      name: 'Jane Doe',
      dob: '6/15/1990',
      mrn: '112233',
      pcp: '',
    })
  })
})

/** Serves a redirect first, then the destination body. */
function mockRedirectingRequest(status: number, location: string, destinationBody: string) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  const urls: string[] = []
  let first = true
  req.transport = mock(async (url: string) => {
    urls.push(url)
    if (first) {
      first = false
      return new Response('', { status, headers: { location } })
    }
    return new Response(destinationBody, { status: 200 })
  }) as typeof req.transport
  return { req, urls }
}

const PROFILE_HTML = `<div class="printheader">Name: Jane Doe | DOB: 3/4/1988 | MRN: 998877 | PCP: Dr. Who</div>`

describe('getMyChartProfile session handling', () => {
  it('returns null when /Home redirects to the login page', async () => {
    // A logged-out session serves the login page with a 200 body; parsing it
    // would yield a bogus profile instead of signalling expiry.
    const { req } = mockRedirectingRequest(302, '/MyChart/Authentication/Login', PROFILE_HTML)
    expect(await getMyChartProfile(req)).toBeNull()
  })

  it('detects a login redirect regardless of casing', async () => {
    const { req } = mockRedirectingRequest(302, '/MyChart/Authentication/LOGIN', PROFILE_HTML)
    expect(await getMyChartProfile(req)).toBeNull()
  })

  it('treats a 301 to login as expiry too', async () => {
    const { req } = mockRedirectingRequest(301, 'https://mychart.example.com/login', PROFILE_HTML)
    expect(await getMyChartProfile(req)).toBeNull()
  })

  it('follows a non-login redirect and parses the destination', async () => {
    const { req, urls } = mockRedirectingRequest(302, '/MyChart/Home/Dashboard', PROFILE_HTML)

    const profile = await getMyChartProfile(req)
    expect(profile?.name).toBe('Jane Doe')
    expect(urls[1]).toContain('/MyChart/Home/Dashboard')
  })

  it('resolves a relative redirect against the instance host', async () => {
    const { req, urls } = mockRedirectingRequest(302, '/elsewhere', PROFILE_HTML)
    await getMyChartProfile(req)

    expect(urls[1]).toBe('https://mychart.example.com/elsewhere')
  })
})

describe('getEmail', () => {
  it('returns the email from the contact information payload', async () => {
    const req = mockSequence([
      '<input name="__RequestVerificationToken" value="tok" />',
      JSON.stringify({ SecureCommunicationInfo: { EmailAddress: 'patient@example.org' } }),
    ])
    expect(await getEmail(req.req)).toBe('patient@example.org')
  })

  it('returns null when the verification token is missing', async () => {
    const req = mockSequence(['<html><body>no token here</body></html>'])
    expect(await getEmail(req.req)).toBeNull()
    // Without the token the POST must not be attempted at all.
    expect(req.calls).toHaveLength(1)
  })

  it('sends the token and form body the endpoint requires', async () => {
    const req = mockSequence([
      '<input name="__RequestVerificationToken" value="tok" />',
      JSON.stringify({ SecureCommunicationInfo: { EmailAddress: 'a@b.org' } }),
    ])
    await getEmail(req.req)

    const post = req.calls[1]
    expect(post.init.method).toBe('POST')
    expect(post.init.body).toBe('useLoginUserEpt=false')
    expect((post.init.headers as Record<string, string>).__RequestVerificationToken).toBe('tok')
    expect(post.url).toContain('noCache=')
  })
})

/** Returns the given bodies in order, recording each call. */
function mockSequence(bodies: string[]) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  const calls: Array<{ url: string; init: RequestInit }> = []
  let i = 0
  req.transport = mock(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init })
    return new Response(bodies[i++] ?? '', { status: 200 })
  }) as typeof req.transport
  return { req, calls }
}
