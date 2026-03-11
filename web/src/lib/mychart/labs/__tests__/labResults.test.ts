import { describe, it, expect, mock } from 'bun:test'
import { listLabResults } from '../labResults'
import { MyChartRequest } from '../../myChartRequest'

/** Route-based mock: matches URL substrings to responses. Falls back to sequential for unmatched. */
function mockRequest(routes: Record<string, Array<{ body: string; status?: number }>>) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  const routeCounters: Record<string, number> = {}
  req.fetchWithCookieJar = mock(async (url: string | URL | Request) => {
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
  }) as typeof req.fetchWithCookieJar
  return req
}

const emptyList = { body: JSON.stringify({ newResultGroups: [] }) }
const emptyHistory = { body: JSON.stringify(null), status: 200 }

describe('listLabResults', () => {
  it('returns empty array when no token found', async () => {
    const req = mockRequest({
      'test-results': [{ body: '<html></html>' }],
    })
    const result = await listLabResults(req)
    expect(result).toEqual([])
  })

  it('returns empty array when no result groups', async () => {
    const req = mockRequest({
      '/app/test-results': [{ body: '<input name="__RequestVerificationToken" value="tok123" />' }],
      'GetList': [emptyList, emptyList, emptyList, emptyList],
    })
    const result = await listLabResults(req)
    expect(result).toEqual([])
  })

  it('returns empty array when newResultGroups is missing', async () => {
    const req = mockRequest({
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
    const req = mockRequest({
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
    const req = mockRequest({
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
    const req = mockRequest({
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
    const req = mockRequest({
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

    req.fetchWithCookieJar = mock(async (url: string | URL | Request, init?: RequestInit) => {
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
    }) as typeof req.fetchWithCookieJar

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
