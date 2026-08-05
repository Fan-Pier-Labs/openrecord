import { describe, it, expect, mock } from 'bun:test'
import { listLabResults, getImagingResults } from '../labs_and_procedure_results/labResults'
import { MyChartRequest } from '../myChartRequest'

// Capture every request the scraper makes so we can assert on the GetList body.
function mockRequest(responses: Array<{ body: string }>) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  const captured: Array<{ url: string; body?: string }> = []
  let i = 0
  req.fetchWithCookieJar = mock(async (url: string | URL | Request, init?: RequestInit) => {
    captured.push({ url: String(url), body: init?.body ? String(init.body) : undefined })
    const r = responses[Math.min(i++, responses.length - 1)]
    return new Response(r.body, { status: 200 })
  }) as typeof req.fetchWithCookieJar
  return { req, captured }
}

const TOKEN_PAGE = '<input name="__RequestVerificationToken" value="tok123" />'
const EMPTY_LIST = JSON.stringify({ newResultGroups: [] })

function getListMaxResults(captured: Array<{ url: string; body?: string }>): number[] {
  return captured
    .filter((c) => c.url.includes('/api/test-results/GetList') && c.body)
    .map((c) => JSON.parse(c.body as string).maxResults)
}

describe('lab results GetList pagination cap', () => {
  it('listLabResults requests a large maxResults (not the old 50 cap)', async () => {
    // token page, then one empty GetList per groupType (0-3) so no detail fetches happen
    const { req, captured } = mockRequest([
      { body: TOKEN_PAGE },
      { body: EMPTY_LIST },
      { body: EMPTY_LIST },
      { body: EMPTY_LIST },
      { body: EMPTY_LIST },
    ])

    await listLabResults(req)

    const maxResults = getListMaxResults(captured)
    expect(maxResults.length).toBeGreaterThan(0)
    for (const m of maxResults) {
      expect(m).toBeGreaterThanOrEqual(1000)
    }
  })

  it('getImagingResults requests a large maxResults (not the old 50 cap)', async () => {
    const { req, captured } = mockRequest([
      { body: TOKEN_PAGE },
      { body: EMPTY_LIST },
      { body: EMPTY_LIST },
      { body: EMPTY_LIST },
      { body: EMPTY_LIST },
    ])

    await getImagingResults(req)

    const maxResults = getListMaxResults(captured)
    expect(maxResults.length).toBeGreaterThan(0)
    for (const m of maxResults) {
      expect(m).toBeGreaterThanOrEqual(1000)
    }
  })
})
