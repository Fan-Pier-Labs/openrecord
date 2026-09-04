import { describe, it, expect, mock } from 'bun:test'
import {
  listLabResults,
  fetchLabResultsRaw,
  getImagingResults,
  labResultsProcessor,
  recentTrendPoints,
  CONCISE_TREND_POINTS,
  type LabOrderConcise,
} from '../labResults'
import { MyChartRequest } from '../../../core/myChartRequest'
import { SessionExpiredError } from '../../../core/makeAuthenticatedRequest'
import { MissingVerificationTokenError } from '../../../core/util'
import type { RawResponse } from '../../../core/rawResponse'
import { renderOutput } from '../../../processors/processor'

// Capture every request the scraper makes so we can assert on the GetList body.
function mockRequest(responses: Array<{ body: string }>) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  const captured: Array<{ url: string; body?: string | undefined }> = []
  let i = 0
  req.transport = mock(async (url: string, init?: RequestInit) => {
    captured.push({ url, body: typeof init?.body === 'string' && init.body ? init.body : undefined })
    const r = responses[Math.min(i++, responses.length - 1)]
    return new Response(r!.body, { status: 200 })
  })
  return { req, captured }
}

const TOKEN_PAGE = '<input name="__RequestVerificationToken" value="tok123" />'
const EMPTY_LIST = JSON.stringify({ newResultGroups: [] })

describe('lab results GetList pagination cap', () => {
  it('fetchLabResultsRaw requests a large maxResults (not the old 50 cap)', async () => {
    // token page, then one empty GetList per groupType (0-3) so no detail fetches happen
    const { req } = mockRequest([{ body: TOKEN_PAGE }, { body: EMPTY_LIST }])

    const raw = await fetchLabResultsRaw(req)
    const lists = raw.requests.filter((r) => r.path === '/api/test-results/GetList')
    expect(lists).toHaveLength(4)
    for (const list of lists) {
      expect((list.requestBody as { maxResults: number }).maxResults).toBeGreaterThanOrEqual(1000)
    }
    expect(lists.map((l) => (l.requestBody as { groupType: number }).groupType)).toEqual([0, 1, 2, 3])
  })

  it('getImagingResults requests a large maxResults (not the old 50 cap)', async () => {
    const { req, captured } = mockRequest([{ body: TOKEN_PAGE }, { body: EMPTY_LIST }])

    await getImagingResults(req)

    const maxResults = captured
      .filter((c) => c.url.includes('/api/test-results/GetList') && c.body)
      .map((c) => JSON.parse(c.body!).maxResults)
    expect(maxResults.length).toBeGreaterThan(0)
    for (const m of maxResults) expect(m).toBeGreaterThanOrEqual(1000)
  })
})

/** Route-based mock: matches URL substrings to responses, in order per pattern. */
function routedRequest(routes: Record<string, Array<{ body: string; status?: number }>>) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  const routeCounters: Record<string, number> = {}
  req.transport = mock(async (url: string) => {
    const urlStr = url.toString()
    for (const pattern of Object.keys(routes)) {
      if (urlStr.includes(pattern)) {
        routeCounters[pattern] = (routeCounters[pattern] || 0)
        const idx = routeCounters[pattern]++
        const responses = routes[pattern]
        const r = idx < responses!.length ? responses![idx] : responses![responses!.length - 1]
        return new Response(r!.body, { status: r!.status ?? 200 })
      }
    }
    return new Response('', { status: 404 })
  })
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
  req.transport = mock(async (url: string, init?: RequestInit) => {
    const urlStr = url.toString()
    if (urlStr.includes('/app/test-results')) {
      return new Response(TOKEN_PAGE, { status: 200 })
    }
    if (urlStr.includes('GetList')) {
      // Only groupType 0 has anything; the rest are empty, as on a real instance.
      const body = listCalls++ === 0
        ? JSON.stringify({ newResultGroups: keys.map((key) => ({ key })) })
        : JSON.stringify({ newResultGroups: [] })
      return new Response(body, { status: 200 })
    }
    if (urlStr.includes('GetDetails')) {
      const orderKey = JSON.parse(typeof init?.body === 'string' ? init.body : '{}').orderKey
      if (orderKey === failDetailFor) fail()
      return new Response(JSON.stringify({ orderName: `Order ${orderKey}` }), { status: 200 })
    }
    if (urlStr.includes('GetMultipleHistoricalResultComponents')) {
      return new Response(JSON.stringify(null), { status: 200 })
    }
    return new Response('', { status: 404 })
  })
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

  it('throws when both accepted group types failed — the instance has not said "no results"', async () => {
    const req = new MyChartRequest('mychart.example.com')
    req.firstPathPart = 'MyChart'
    req.transport = mock(async (url: string) => {
      const urlStr = url.toString()
      if (urlStr.includes('/app/test-results')) return new Response(TOKEN_PAGE, { status: 200 })
      return new Response('<html>An error has occurred.</html>', { status: 500, headers: { 'content-type': 'text/html' } })
    })
    await expect(fetchLabResultsRaw(req)).rejects.toThrow(/POST \/api\/test-results\/GetList with HTTP 500/)
  })

  it('still tolerates a group type this instance does not serve, and records the refusal', async () => {
    // The one failure that IS expected: group types 0 and 1 answer the same
    // list, so one of them failing costs nothing, and 2 and 3 are speculative.
    const req = new MyChartRequest('mychart.example.com')
    req.firstPathPart = 'MyChart'
    let listCalls = 0
    req.transport = mock(async (url: string) => {
      const urlStr = url.toString()
      if (urlStr.includes('/app/test-results')) {
        return new Response(TOKEN_PAGE, { status: 200 })
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
    })

    const raw = await fetchLabResultsRaw(req)
    const refused = raw.requests.find((r) => r.path === '/api/test-results/GetList')!
    expect(refused.status).toBe(404)
    expect(refused.body).toBe('Not Found')

    const result = labResultsProcessor.standard(raw)
    expect(result.orders).toHaveLength(1)
    expect(result.orders[0]!.orderName).toBe('Lab')
  })

  it('tolerates a group list that is not JSON at all', async () => {
    const req = new MyChartRequest('mychart.example.com')
    req.firstPathPart = 'MyChart'
    req.transport = mock(async (url: string) => {
      const urlStr = url.toString()
      if (urlStr.includes('/app/test-results')) {
        return new Response(TOKEN_PAGE, { status: 200 })
      }
      if (urlStr.includes('GetList')) return new Response('<html>not json</html>', { status: 200 })
      return new Response('', { status: 404 })
    })

    await expect(listLabResults(req)).resolves.toEqual({ orders: [] })
  })

  it('tolerates a failed trend fetch — the order is still reported, without a trend', async () => {
    const req = routedRequest({
      '/app/test-results': [{ body: TOKEN_PAGE }],
      'GetList': [{ body: JSON.stringify({ newResultGroups: [{ key: 'order-1' }] }) }, emptyList],
      'GetDetails': [{ body: JSON.stringify({ orderName: 'CBC', key: 'order-1', results: [] }) }],
      'GetMultipleHistoricalResultComponents': [{ body: 'Server Error', status: 500 }],
    })

    const raw = await fetchLabResultsRaw(req)
    expect(raw.requests.find((r) => r.path.includes('GetMultipleHistoricalResultComponents'))!.status).toBe(500)
    const result = labResultsProcessor.standard(raw)
    expect(result.orders[0]).toMatchObject({ orderName: 'CBC', historicalResults: {} })
  })
})

// A GetDetails body with every standard field populated, plus the fields
// that must NOT survive into standard.
const CBC_DETAILS = {
  orderName: 'CBC',
  key: 'order-1',
  results: [
    {
      name: 'CBC',
      key: 'result-1',
      showName: true,
      showDetails: true,
      isAbnormal: false,
      hasComment: true,
      warningType: '',
      warningMessage: '',
      orderMetadata: {
        orderProviderName: 'Dr. Hibbert',
        authorizingProviderName: 'Dr. Hibbert',
        readingProviderName: '',
        unreadCommentingProviderName: '',
        resultTimestampDisplay: 'Jan 10, 2026',
        prioritizedInstantISO: '2026-01-10T14:00:00Z',
        prioritizedInstantDisplay: 'Jan 10, 2026 9:00 AM',
        latestUpdateInstantISO: '2026-01-10T15:00:00Z',
        collectionTimestampsDisplay: 'Jan 10, 2026 8:00 AM',
        specimensDisplay: 'Blood',
        resultStatus: 'Final',
        resultType: 'LAB',
        read: 1,
        associatedDiagnoses: ['Annual physical'],
        resultingLab: {
          name: 'Springfield Lab',
          address: ['1 Main St', 'Springfield'],
          phoneNumber: '555-0100',
          labDirector: 'Dr. Lab',
          cliaNumber: '11D1111111',
          accreditationType: 'CAP',
        },
      },
      resultComponents: [
        {
          componentInfo: { componentID: 'comp-hgb', name: 'Hemoglobin', commonName: 'Hgb', units: 'g/dL' },
          componentResultInfo: {
            value: '14.2',
            isValueRtf: false,
            numericValue: 14.2,
            referenceRange: {
              low: 13.5, high: 17.5, displayLow: '13.5', displayHigh: '17.5',
              lowerBoundExclusive: false, upperBoundExclusive: false, formattedReferenceRange: '13.5 - 17.5',
            },
            abnormalFlagCategoryValue: 'Unknown',
          },
          componentComments: { isRTF: false, hasContent: true, contentAsString: 'Hemolyzed', contentAsHtml: '<p>Hemolyzed</p>' },
        },
        {
          componentInfo: { componentID: 'comp-note', name: 'Comment', commonName: 'Comment', units: '' },
          componentResultInfo: {
            value: '{\\rtf1\\ansi{\\fonttbl{\\f0 Arial;}}\\f0 Sample \\b slightly\\b0  lipemic\\par}',
            isValueRtf: true,
            referenceRange: { displayLow: '', displayHigh: '', formattedReferenceRange: '' },
            abnormalFlagCategoryValue: 'Unknown',
          },
          componentComments: { isRTF: false, hasContent: false, contentAsString: '', contentAsHtml: '' },
        },
      ],
      studyResult: {
        narrative: { isRTF: false, hasContent: false, contentAsString: '', contentAsHtml: '', signingInstantTimestamp: '' },
        impression: { isRTF: false, hasContent: false, contentAsString: '', contentAsHtml: '', signingInstantTimestamp: '' },
        combinedRTFNarrativeImpression: { isRTF: false, hasContent: false, contentAsString: '', contentAsHtml: '' },
        addenda: [],
        transcriptions: [],
        ecgDiagnosis: [],
        hasStudyContent: false,
      },
      resultNote: { isRTF: false, hasContent: true, contentAsString: 'Looks good.', contentAsHtml: '<p>Looks good.</p>', signingInstantTimestamp: '2026-01-11' },
      resultLetter: { isRTF: false, hasContent: false, contentAsString: '', contentAsHtml: '', signingInstantTimestamp: '' },
      providerComments: [{ commentText: 'Call if worse', providerName: 'Dr. Hibbert', commentDate: '2026-01-11' }],
      reportDetails: { isDownloadablePDFReport: true, reportID: 'rpt-1', openRemotely: false, reportContext: 'x', reportVars: { ordId: '1', ordDat: '2' } },
      scans: [],
      imageStudies: [],
      baseSingleMessageUrl: '/msg',
      relatedConversationIds: [],
    },
  ],
  orderLimitReached: false,
  ordersDeduplicated: false,
  hideEncInfo: false,
}

const CBC_HISTORY = {
  historicalResults: {
    'comp-hgb': {
      componentID: 'comp-hgb',
      name: 'Hemoglobin',
      commonName: 'Hgb',
      units: 'g/dL',
      oldestResultISO: '2020-01-01T00:00:00Z',
      hideGraph: false,
      showAbnormalFlag: false,
      historicalResultData: [
        { value: '14.2', isValueRtf: false, numericValue: 14.2, referenceRange: { formattedReferenceRange: '13.5 - 17.5' }, abnormalFlagCategoryValue: 'Unknown', dateISO: '2026-01-10T14:00:00Z' },
        { value: '13.9', isValueRtf: false, numericValue: 13.9, referenceRange: { formattedReferenceRange: '13.5 - 17.5' }, abnormalFlagCategoryValue: 'Unknown', dateISO: '2025-01-10T14:00:00Z' },
      ],
    },
  },
  orderedComponentIDs: ['comp-hgb'],
  reportID: '',
  shouldShowBedsideActiveView: false,
}

const CBC_REPORT = { reportContent: '<div><h3>CBC</h3><p>All values within range.</p></div>', reportCss: '.r{}' }

describe('listLabResults', () => {
  it('throws when the test-results page has no verification token', async () => {
    const req = routedRequest({ 'test-results': [{ body: '<html></html>' }] })
    await expect(listLabResults(req)).rejects.toBeInstanceOf(MissingVerificationTokenError)
  })

  it('returns no orders when there are no result groups', async () => {
    const req = routedRequest({
      '/app/test-results': [{ body: TOKEN_PAGE }],
      'GetList': [emptyList],
    })
    expect(await listLabResults(req)).toEqual({ orders: [] })
  })

  it('records every request in the envelope, keyed by the body posted', async () => {
    const req = routedRequest({
      '/app/test-results': [{ body: TOKEN_PAGE }],
      'GetList': [{ body: JSON.stringify({ newResultGroups: [{ key: 'order-1', isInpatient: true }] }) }, emptyList],
      'GetDetails': [{ body: JSON.stringify(CBC_DETAILS) }],
      'LoadReportContent': [{ body: JSON.stringify(CBC_REPORT) }],
      'GetMultipleHistoricalResultComponents': [{ body: JSON.stringify(CBC_HISTORY) }],
    })

    const raw = await fetchLabResultsRaw(req)
    // Details are fetched as each group page is read, so the order's three
    // calls follow the GetList that listed it.
    expect(raw.requests.map((r) => r.path)).toEqual([
      '/app/test-results',
      '/api/test-results/GetList',
      '/api/test-results/GetDetails',
      '/api/report-content/LoadReportContent',
      '/api/past-results/GetMultipleHistoricalResultComponents',
      '/api/test-results/GetList',
      '/api/test-results/GetList',
      '/api/test-results/GetList',
    ])
    expect(raw.requests[2]!.requestBody).toEqual({ orderKey: 'order-1', organizationID: '', PageNonce: '' })
    expect(raw.requests[3]!.requestBody).toMatchObject({ reportID: 'rpt-1', assumedVariables: { ordId: '1', ordDat: '2' } })
    expect(raw.requests[4]!.requestBody).toMatchObject({ orderID: 'order-1' })
    // Raw keeps what standard drops.
    expect(JSON.stringify(raw)).toContain('abnormalFlagCategoryValue')
    expect(JSON.stringify(raw)).toContain('<h3>CBC</h3>')
  })

  it('deduplicates order keys across group types', async () => {
    const req = routedRequest({
      '/app/test-results': [{ body: TOKEN_PAGE }],
      'GetList': [
        { body: JSON.stringify({ newResultGroups: [{ key: 'order-1' }] }) },
        { body: JSON.stringify({ newResultGroups: [{ key: 'order-1' }, { key: 'order-2' }] }) },
        emptyList,
      ],
      'GetDetails': [
        { body: JSON.stringify({ orderName: 'CBC', key: 'order-1' }) },
        { body: JSON.stringify({ orderName: 'Metabolic Panel', key: 'order-2' }) },
      ],
      'GetMultipleHistoricalResultComponents': [emptyHistory],
    })

    const result = await listLabResults(req)
    expect(result.orders.map((o) => o.orderName)).toEqual(['CBC', 'Metabolic Panel'])
  })

  it('skips report content when reportDetails has no reportID', async () => {
    const req = routedRequest({
      '/app/test-results': [{ body: TOKEN_PAGE }],
      'GetList': [{ body: JSON.stringify({ newResultGroups: [{ key: 'order-1' }] }) }, emptyList],
      'GetDetails': [{ body: JSON.stringify({ orderName: 'Lab', results: [{ reportDetails: { reportVars: {} } }] }) }],
      'GetMultipleHistoricalResultComponents': [emptyHistory],
    })

    const raw = await fetchLabResultsRaw(req)
    expect(raw.requests.some((r) => r.path.includes('LoadReportContent'))).toBe(false)
    const result = labResultsProcessor.standard(raw)
    expect(result.orders[0]!.results[0]!.reportContentText).toBeNull()
    expect(result.orders[0]!.results[0]!.reportDetails).toEqual({ reportID: null, isDownloadablePDFReport: null })
  })

  it('handles an order with no results array', async () => {
    const req = routedRequest({
      '/app/test-results': [{ body: TOKEN_PAGE }],
      'GetList': [{ body: JSON.stringify({ newResultGroups: [{ key: 'order-1' }] }) }, emptyList],
      'GetDetails': [{ body: JSON.stringify({ orderName: 'Empty Order' }) }],
      'GetMultipleHistoricalResultComponents': [emptyHistory],
    })

    const result = await listLabResults(req)
    expect(result.orders).toHaveLength(1)
    expect(result.orders[0]).toMatchObject({ orderName: 'Empty Order', key: 'order-1', results: [], historicalResults: {} })
  })

  it('posts the page token on every API call', async () => {
    const req = new MyChartRequest('mychart.example.com')
    req.firstPathPart = 'MyChart'
    const calls: Array<{ url: string; init?: RequestInit | undefined }> = []

    req.transport = mock(async (url: string, init?: RequestInit) => {
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
      return new Response(JSON.stringify(null), { status: 200 })
    })

    await listLabResults(req)

    for (const fragment of ['GetList', 'GetDetails', 'GetMultipleHistoricalResultComponents']) {
      const call = calls.find((c) => c.url.includes(fragment))!
      const headers = call.init!.headers as Record<string, string>
      expect(headers['__RequestVerificationToken']).toBe('mytoken')
      expect(call.init!.method).toBe('POST')
    }
  })
})

function envelope(requests: RawResponse['requests']): RawResponse {
  return { requests }
}

const post = (path: string, requestBody: unknown, body: unknown, status = 200): RawResponse['requests'][number] => ({
  path, method: 'POST', requestBody, status, contentType: 'application/json', body,
})

describe('labResultsProcessor.standard', () => {
  const raw = envelope([
    { path: '/app/test-results', method: 'GET', status: 200, contentType: 'text/html', body: TOKEN_PAGE },
    post('/api/test-results/GetList', { groupType: 0 }, {
      newResultGroups: [
        { key: 'order-1', isInpatient: true, isEDVisit: false, formattedAdmitDate: '01/09/2026', formattedDischargeDate: '01/11/2026', contactType: 'Inpatient' },
        { key: 'order-2', isInpatient: false, isEDVisit: false },
      ],
    }),
    post('/api/test-results/GetList', { groupType: 1 }, 'Server Error', 500),
    post('/api/test-results/GetDetails', { orderKey: 'order-1' }, CBC_DETAILS),
    post('/api/report-content/LoadReportContent', { reportID: 'rpt-1' }, CBC_REPORT),
    post('/api/past-results/GetMultipleHistoricalResultComponents', { orderID: 'order-1' }, CBC_HISTORY),
    post('/api/test-results/GetDetails', { orderKey: 'order-2' }, { orderName: 'Lipid Panel', key: 'order-2', results: [] }),
    post('/api/past-results/GetMultipleHistoricalResultComponents', { orderID: 'order-2' }, null),
  ])
  const standard = labResultsProcessor.standard(raw)

  it('joins the trend, the report and the encounter context onto each order by the keys posted', () => {
    expect(standard.orders).toHaveLength(2)
    const cbc = standard.orders[0]!
    expect(cbc).toMatchObject({
      orderName: 'CBC',
      key: 'order-1',
      isInpatient: true,
      isEDVisit: false,
      formattedAdmitDate: '01/09/2026',
      formattedDischargeDate: '01/11/2026',
    })
    expect(cbc.historicalResults['comp-hgb']).toEqual({
      name: 'Hemoglobin',
      commonName: 'Hgb',
      units: 'g/dL',
      oldestResultISO: '2020-01-01T00:00:00Z',
      historicalResultData: [
        { dateISO: '2026-01-10T14:00:00Z', value: '14.2', numericValue: 14.2, isValueRtf: false, referenceRange: { formattedReferenceRange: '13.5 - 17.5', low: null, high: null, displayLow: null, displayHigh: null, lowerBoundExclusive: null, upperBoundExclusive: null } },
        { dateISO: '2025-01-10T14:00:00Z', value: '13.9', numericValue: 13.9, isValueRtf: false, referenceRange: { formattedReferenceRange: '13.5 - 17.5', low: null, high: null, displayLow: null, displayHigh: null, lowerBoundExclusive: null, upperBoundExclusive: null } },
      ],
    })
    expect(cbc.results[0]!.reportContentText).toBe('CBC\n\nAll values within range.')

    const lipids = standard.orders[1]!
    expect(lipids).toMatchObject({ orderName: 'Lipid Panel', isInpatient: false, formattedAdmitDate: null, results: [], historicalResults: {} })
  })

  it('keeps every listed result field under its MyChart name', () => {
    const r = standard.orders[0]!.results[0]!
    expect(r).toMatchObject({
      name: 'CBC',
      key: 'result-1',
      isAbnormal: false,
      hasComment: true,
      warningType: '',
      warningMessage: '',
      resultNote: { contentAsString: 'Looks good.', signingInstantTimestamp: '2026-01-11' },
      resultLetter: { contentAsString: '', signingInstantTimestamp: '' },
      providerComments: [{ commentText: 'Call if worse', providerName: 'Dr. Hibbert', commentDate: '2026-01-11' }],
      reportDetails: { reportID: 'rpt-1', isDownloadablePDFReport: true },
      imageStudies: [],
      scans: [],
      fdiLink: { redirectUrl: null },
    })
    expect(r.orderMetadata).toEqual({
      prioritizedInstantISO: '2026-01-10T14:00:00Z',
      prioritizedInstantDisplay: 'Jan 10, 2026 9:00 AM',
      resultTimestampDisplay: 'Jan 10, 2026',
      latestUpdateInstantISO: '2026-01-10T15:00:00Z',
      collectionTimestampsDisplay: 'Jan 10, 2026 8:00 AM',
      specimensDisplay: 'Blood',
      resultStatus: 'Final',
      orderProviderName: 'Dr. Hibbert',
      authorizingProviderName: 'Dr. Hibbert',
      readingProviderName: '',
      resultType: 'LAB',
      associatedDiagnoses: ['Annual physical'],
      resultingLab: { name: 'Springfield Lab', address: ['1 Main St', 'Springfield'], phoneNumber: '555-0100', labDirector: 'Dr. Lab', cliaNumber: '11D1111111', accreditationType: 'CAP' },
    })
    expect(r.studyResult).toEqual({
      narrative: { contentAsString: '', signingInstantTimestamp: '' },
      impression: { contentAsString: '', signingInstantTimestamp: '' },
      addenda: [],
      transcriptions: [],
      ecgDiagnosis: [],
      hasStudyContent: false,
      isFullResultText: null,
      isCupidAddendum: null,
    })
  })

  it('carries the value as valueText (an uncaptured RTF value passes through as-is) and drops the abnormal flag', () => {
    const [hgb, note] = standard.orders[0]!.results[0]!.resultComponents
    expect(hgb).toEqual({
      componentInfo: { componentID: 'comp-hgb', name: 'Hemoglobin', commonName: 'Hgb', units: 'g/dL' },
      componentResultInfo: {
        valueText: '14.2',
        numericValue: 14.2,
        isValueRtf: false,
        referenceRange: { formattedReferenceRange: '13.5 - 17.5', low: 13.5, high: 17.5, displayLow: '13.5', displayHigh: '17.5', lowerBoundExclusive: false, upperBoundExclusive: false },
      },
      componentComments: { contentAsString: 'Hemolyzed' },
    })
    // No RTF value has ever been captured, so nothing strips it yet (TODO §1).
    expect(note!.componentResultInfo.valueText).toBe('{\\rtf1\\ansi{\\fonttbl{\\f0 Arial;}}\\f0 Sample \\b slightly\\b0  lipemic\\par}')
    expect(note!.componentResultInfo.isValueRtf).toBe(true)
    expect(note!.componentResultInfo.numericValue).toBeNull()

    const json = JSON.stringify(standard)
    expect(json).not.toContain('abnormalFlagCategoryValue')
    expect(json).not.toContain('contentAsHtml')
    expect(json).not.toContain('reportCss')
    expect(json).not.toContain('showName')
    expect(json).not.toContain('baseSingleMessageUrl')
    expect(Object.keys(hgb!.componentResultInfo)).not.toContain('value')
  })

  it('projects an order whose detail body was not the order to nulls under the key asked for', () => {
    const broken = labResultsProcessor.standard(envelope([
      post('/api/test-results/GetDetails', { orderKey: 'order-9' }, null),
      post('/api/test-results/GetDetails', { orderKey: 'order-10' }, '<html>Request Rejected</html>', 403),
    ]))
    expect(broken.orders.map((o) => o.key)).toEqual(['order-9', 'order-10'])
    expect(broken.orders[0]).toMatchObject({ orderName: null, results: [], historicalResults: {}, isInpatient: null })
  })

  it('returns no orders for an empty envelope', () => {
    expect(labResultsProcessor.standard(envelope([]))).toEqual({ orders: [] })
  })
})

describe('labResultsProcessor.concise', () => {
  it('keeps the what / when / who fields and the trend, sorted and capped', () => {
    const points = Array.from({ length: 12 }, (_, i) => ({
      dateISO: `20${String(10 + ((i * 7) % 12)).padStart(2, '0')}-01-01T00:00:00Z`, value: String(i), numericValue: i, isValueRtf: false,
      referenceRange: { formattedReferenceRange: null, low: null, high: null, displayLow: null, displayHigh: null, lowerBoundExclusive: null, upperBoundExclusive: null },
    }))
    const recent = recentTrendPoints(points)
    expect(recent).toHaveLength(CONCISE_TREND_POINTS)
    const dates = recent.map((p) => p.dateISO!)
    expect([...dates].sort((a, b) => a.localeCompare(b))).toEqual(dates)
    expect(dates[dates.length - 1]).toBe('2021-01-01T00:00:00Z')
    expect(recent[0]).toEqual({ dateISO: '2014-01-01T00:00:00Z', value: '4' })

    const raw = envelope([
      post('/api/test-results/GetDetails', { orderKey: 'order-1' }, CBC_DETAILS),
      post('/api/report-content/LoadReportContent', { reportID: 'rpt-1' }, CBC_REPORT),
      post('/api/past-results/GetMultipleHistoricalResultComponents', { orderID: 'order-1' }, CBC_HISTORY),
    ])
    const concise = labResultsProcessor.concise(labResultsProcessor.standard(raw)) as { orders: LabOrderConcise[] }
    expect(concise.orders[0]).toEqual({
      orderName: 'CBC',
      results: [{
        name: 'CBC',
        prioritizedInstantISO: '2026-01-10T14:00:00Z',
        resultStatus: 'Final',
        orderProviderName: 'Dr. Hibbert',
        resultComponents: [
          { name: 'Hemoglobin', commonName: 'Hgb', units: 'g/dL', valueText: '14.2', formattedReferenceRange: '13.5 - 17.5', contentAsString: 'Hemolyzed' },
          { name: 'Comment', commonName: 'Comment', units: '', valueText: '{\\rtf1\\ansi{\\fonttbl{\\f0 Arial;}}\\f0 Sample \\b slightly\\b0  lipemic\\par}', formattedReferenceRange: '', contentAsString: '' },
        ],
        narrative: '',
        impression: '',
        addenda: [],
        resultNote: 'Looks good.',
        resultLetter: '',
        reportContentText: 'CBC\n\nAll values within range.',
      }],
      historicalResults: {
        'comp-hgb': {
          name: 'Hemoglobin',
          historicalResultData: [
            { dateISO: '2025-01-10T14:00:00Z', value: '13.9' },
            { dateISO: '2026-01-10T14:00:00Z', value: '14.2' },
          ],
        },
      },
    })
    expect(JSON.stringify(concise)).not.toContain('isAbnormal')
  })

  it('renders through every mode', () => {
    const raw = envelope([
      post('/api/test-results/GetDetails', { orderKey: 'order-1' }, CBC_DETAILS),
      post('/api/past-results/GetMultipleHistoricalResultComponents', { orderID: 'order-1' }, CBC_HISTORY),
    ])
    expect(renderOutput(labResultsProcessor, raw, 'raw')).toBe(raw)
    expect(renderOutput(labResultsProcessor, raw, 'standard')).toContain('- **valueText**: 14.2')
    const concise = renderOutput(labResultsProcessor, raw, 'concise') as string
    expect(concise).toContain('Hemoglobin')
    expect(concise).not.toContain('abnormalFlagCategoryValue')
  })
})
