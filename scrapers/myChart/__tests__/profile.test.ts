import { describe, it, expect, mock } from 'bun:test'
import { getMyChartProfile } from '../profile'
import { MyChartRequest } from '../myChartRequest'

function mockRequest(body: string) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  req.fetchWithCookieJar = mock(async () => {
    return new Response(body, { status: 200 })
  }) as typeof req.fetchWithCookieJar
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
