import { describe, it, expect, mock } from 'bun:test'
import { listLabResults, getImagingResults } from '../labs_and_procedure_results/labResults'
import { MyChartRequest } from '../myChartRequest'
import { SessionExpiredError } from '../makeAuthenticatedRequest'

// Capture every request the scraper makes so we can assert on the GetList body.
function mockRequest(responses: Array<{ body: string }>) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  const captured: Array<{ url: string; body?: string }> = []
  let i = 0
  req.transport = mock(async (url: string | URL | Request, init?: RequestInit) => {
    captured.push({ url: String(url), body: init?.body ? String(init.body) : undefined })
    const r = responses[Math.min(i++, responses.length - 1)]
    return new Response(r.body, { status: 200 })
  }) as typeof req.transport
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

/** Route-based mock: matches URL substrings to responses, in order per pattern. */
function routedRequest(routes: Record<string, Array<{ body: string; status?: number }>>) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  const routeCounters: Record<string, number> = {}
  req.transport = mock(async (url: string | URL | Request) => {
    const urlStr = url.toString()
    // Also check the body for API path when it's in the URL
    for (const pattern of Object.keys(routes)) {
      if (urlStr.includes(pattern)) {
        routeCounters[pattern] = (routeCounters[pattern] || 0)
        const idx = routeCounters[pattern]++
        const responses = routes[pattern]
        const r = idx < responses.length ? responses[idx] : responses[responses.length - 1]
        return new Response(r.body, { status: r.status ?? 200 })
      }
    }
    return new Response('', { status: 404 })
  }) as typeof req.transport
  return req
}

const emptyList = { body: JSON.stringify({ newResultGroups: [] }) }
const emptyHistory = { body: JSON.stringify(null), status: 200 }

/**
 * A portal that lists `keys` results and then fails the detail fetch for
 * `failDetailFor` — the shape of a session dying, or a proxy hiccuping, part
 * way through a long scrape.
 */
function requestFailingOnDetail(
  keys: string[],
  failDetailFor: string,
  fail: () => never = () => { throw new Error('connection reset') },
) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  let listCalls = 0
  req.transport = mock(async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = url.toString()
    if (urlStr.includes('/app/test-results')) {
      return new Response('<input name="__RequestVerificationToken" value="tok123" />', { status: 200 })
    }
    if (urlStr.includes('GetList')) {
      // Only groupType 0 has anything; the rest are empty, as on a real instance.
      const body = listCalls++ === 0
        ? JSON.stringify({ newResultGroups: keys.map((key) => ({ key })) })
        : JSON.stringify({ newResultGroups: [] })
      return new Response(body, { status: 200 })
    }
    if (urlStr.includes('GetDetails')) {
      const orderKey = JSON.parse(String(init?.body ?? '{}')).orderKey
      if (orderKey === failDetailFor) fail()
      return new Response(JSON.stringify({ orderName: `Order ${orderKey}` }), { status: 200 })
    }
    if (urlStr.includes('GetMultipleHistoricalResultComponents')) {
      return new Response(JSON.stringify(null), { status: 200 })
    }
    return new Response('', { status: 404 })
  }) as typeof req.transport
  return req
}

/**
 * A failure part way through a result list must not come back as a shorter
 * list. The bare `catch {}` around the whole per-group loop body meant a
 * transient failure on result 2 of 3 returned result 1 and nothing else —
 * a truncated chart that reads exactly like a complete one.
 */
describe('partial-failure handling', () => {
  it('listLabResults throws rather than truncating when a detail fetch fails', async () => {
    const req = requestFailingOnDetail(['order-1', 'order-2', 'order-3'], 'order-2')

    await expect(listLabResults(req)).rejects.toThrow('connection reset')
  })

  it('listLabResults propagates a SessionExpiredError instead of reporting an empty chart', async () => {
    const req = requestFailingOnDetail(['order-1', 'order-2'], 'order-2', () => {
      throw new SessionExpiredError()
    })

    await expect(listLabResults(req)).rejects.toBeInstanceOf(SessionExpiredError)
  })

  it('getImagingResults throws rather than truncating when a detail fetch fails', async () => {
    const req = requestFailingOnDetail(['study-1', 'study-2'], 'study-2')

    await expect(getImagingResults(req)).rejects.toThrow('connection reset')
  })

  it('still tolerates a group type this instance does not serve', async () => {
    // The one failure that IS expected: group types 0-3 are probed
    // speculatively, so a 404 on one of them is not an error.
    const req = new MyChartRequest('mychart.example.com')
    req.firstPathPart = 'MyChart'
    let listCalls = 0
    req.transport = mock(async (url: string | URL | Request) => {
      const urlStr = url.toString()
      if (urlStr.includes('/app/test-results')) {
        return new Response('<input name="__RequestVerificationToken" value="tok123" />', { status: 200 })
      }
      if (urlStr.includes('GetList')) {
        // groupType 0 is unsupported here; groupType 1 has the data.
        if (listCalls++ === 0) return new Response('Not Found', { status: 404 })
        const body = listCalls === 2
          ? JSON.stringify({ newResultGroups: [{ key: 'order-1' }] })
          : JSON.stringify({ newResultGroups: [] })
        return new Response(body, { status: 200 })
      }
      if (urlStr.includes('GetDetails')) {
        return new Response(JSON.stringify({ orderName: 'Lab' }), { status: 200 })
      }
      return new Response(JSON.stringify(null), { status: 200 })
    }) as typeof req.transport

    const result = await listLabResults(req)
    expect(result).toHaveLength(1)
    expect(result[0].orderName).toBe('Lab')
  })

  it('tolerates a group list that is not JSON at all', async () => {
    const req = new MyChartRequest('mychart.example.com')
    req.firstPathPart = 'MyChart'
    req.transport = mock(async (url: string | URL | Request) => {
      const urlStr = url.toString()
      if (urlStr.includes('/app/test-results')) {
        return new Response('<input name="__RequestVerificationToken" value="tok123" />', { status: 200 })
      }
      if (urlStr.includes('GetList')) return new Response('<html>not json</html>', { status: 200 })
      return new Response('', { status: 404 })
    }) as typeof req.transport

    await expect(listLabResults(req)).resolves.toEqual([])
  })
})

describe('listLabResults', () => {
  it('returns empty array when no token found', async () => {
    const req = routedRequest({
      'test-results': [{ body: '<html></html>' }],
    })
    const result = await listLabResults(req)
    expect(result).toEqual([])
  })

  it('returns empty array when no result groups', async () => {
    const req = routedRequest({
      '/app/test-results': [{ body: '<input name="__RequestVerificationToken" value="tok123" />' }],
      'GetList': [emptyList, emptyList, emptyList, emptyList],
    })
    const result = await listLabResults(req)
    expect(result).toEqual([])
  })

  it('returns empty array when newResultGroups is missing', async () => {
    const req = routedRequest({
      '/app/test-results': [{ body: '<input name="__RequestVerificationToken" value="tok123" />' }],
      'GetList': [
        { body: JSON.stringify({}) },
        { body: JSON.stringify({}) },
        { body: JSON.stringify({}) },
        { body: JSON.stringify({}) },
      ],
    })
    const result = await listLabResults(req)
    expect(result).toEqual([])
  })

  it('fetches details for each result group', async () => {
    const req = routedRequest({
      '/app/test-results': [{ body: '<input name="__RequestVerificationToken" value="tok123" />' }],
      'GetList': [
        // group type 0 has the results
        {
          body: JSON.stringify({
            newResultGroups: [
              { key: 'order-1', name: 'CBC' },
              { key: 'order-2', name: 'Metabolic Panel' },
            ],
          }),
        },
        // group types 1-3 are empty
        emptyList, emptyList, emptyList,
      ],
      'GetDetails': [
        {
          body: JSON.stringify({
            orderName: 'CBC',
            results: [
              {
                resultComponents: [
                  { componentInfo: { name: 'WBC' }, componentResultInfo: { value: '7.5' } },
                  { componentInfo: { name: 'RBC' }, componentResultInfo: { value: '4.8' } },
                ],
              },
            ],
          }),
        },
        {
          body: JSON.stringify({
            orderName: 'Metabolic Panel',
            results: [
              {
                resultComponents: [
                  { componentInfo: { name: 'Glucose' }, componentResultInfo: { value: '95' } },
                ],
              },
            ],
          }),
        },
      ],
      'GetMultipleHistoricalResultComponents': [emptyHistory, emptyHistory],
    })

    const result = await listLabResults(req)
    expect(result).toHaveLength(2)
    expect(result[0].orderName).toBe('CBC')
    expect(result[0].results[0].resultComponents).toHaveLength(2)
    expect(result[1].orderName).toBe('Metabolic Panel')
    expect(result[1].results[0].resultComponents[0].componentInfo.name).toBe('Glucose')
  })

  it('fetches report content when reportDetails has a reportID', async () => {
    const req = routedRequest({
      '/app/test-results': [{ body: '<input name="__RequestVerificationToken" value="tok123" />' }],
      'GetList': [
        {
          body: JSON.stringify({
            newResultGroups: [{ key: 'order-1', name: 'X-Ray' }],
          }),
        },
        emptyList, emptyList, emptyList,
      ],
      'GetDetails': [
        {
          body: JSON.stringify({
            orderName: 'X-Ray',
            results: [
              {
                reportDetails: {
                  reportID: 'rpt-abc',
                  reportVars: { ordId: '123', ordDat: '2024-01-15' },
                },
              },
            ],
          }),
        },
      ],
      'LoadReportContent': [
        {
          body: JSON.stringify({
            content: 'No acute findings.',
            reportTitle: 'Chest X-Ray Report',
          }),
        },
      ],
      'GetMultipleHistoricalResultComponents': [emptyHistory],
    })

    const result = await listLabResults(req)
    expect(result).toHaveLength(1)
    expect(result[0].results[0].reportDetails.reportContent).toEqual({
      content: 'No acute findings.',
      reportTitle: 'Chest X-Ray Report',
    })
  })

  it('skips report content when reportDetails has no reportID', async () => {
    const req = routedRequest({
      '/app/test-results': [{ body: '<input name="__RequestVerificationToken" value="tok123" />' }],
      'GetList': [
        {
          body: JSON.stringify({
            newResultGroups: [{ key: 'order-1' }],
          }),
        },
        emptyList, emptyList, emptyList,
      ],
      'GetDetails': [
        {
          body: JSON.stringify({
            orderName: 'Lab',
            results: [
              { reportDetails: { reportVars: {} } },
            ],
          }),
        },
      ],
      'GetMultipleHistoricalResultComponents': [emptyHistory],
    })

    const result = await listLabResults(req)
    expect(result).toHaveLength(1)
    expect(result[0].results[0].reportDetails.reportContent).toBeUndefined()
  })

  it('handles results with no results array', async () => {
    const req = routedRequest({
      '/app/test-results': [{ body: '<input name="__RequestVerificationToken" value="tok123" />' }],
      'GetList': [
        {
          body: JSON.stringify({
            newResultGroups: [{ key: 'order-1' }],
          }),
        },
        emptyList, emptyList, emptyList,
      ],
      'GetDetails': [
        { body: JSON.stringify({ orderName: 'Empty Order' }) },
      ],
      'GetMultipleHistoricalResultComponents': [emptyHistory],
    })

    const result = await listLabResults(req)
    expect(result).toHaveLength(1)
    expect(result[0].orderName).toBe('Empty Order')
  })

  it('makes correct API calls with proper headers', async () => {
    const req = new MyChartRequest('mychart.example.com')
    req.firstPathPart = 'MyChart'
    const calls: Array<{ url: string; init?: RequestInit }> = []

    req.transport = mock(async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString()
      calls.push({ url: urlStr, init })
      if (urlStr.includes('/app/test-results')) {
        return new Response('<input name="__RequestVerificationToken" value="mytoken" />', { status: 200 })
      }
      if (urlStr.includes('GetList')) {
        return new Response(JSON.stringify({ newResultGroups: [{ key: 'k1' }] }), { status: 200 })
      }
      if (urlStr.includes('GetDetails')) {
        return new Response(JSON.stringify({ results: [] }), { status: 200 })
      }
      if (urlStr.includes('GetMultipleHistoricalResultComponents')) {
        return new Response(JSON.stringify(null), { status: 200 })
      }
      return new Response('', { status: 200 })
    }) as typeof req.transport

    await listLabResults(req)

    // Find the first GetList call
    const listCall = calls.find(c => c.url.includes('GetList'))!
    expect(listCall.init?.headers).toBeDefined()
    const listHeaders = listCall.init!.headers as Record<string, string>
    expect(listHeaders['__RequestVerificationToken']).toBe('mytoken')
    expect(listCall.init!.method).toBe('POST')

    // GetDetails call should also include the token header
    const detailsCall = calls.find(c => c.url.includes('GetDetails'))!
    const detailsHeaders = detailsCall.init!.headers as Record<string, string>
    expect(detailsHeaders['__requestverificationtoken']).toBe('mytoken')
  })
})
