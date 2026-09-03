import { describe, it, expect, mock } from 'bun:test'
import {
  getImagingResults,
  fetchImagingResultsRaw,
  imagingResultsProcessor,
  imageIdFor,
  isImagingByName,
  type ImagingOrderConcise,
} from '../labs/labResults'
import { extractFdiContextFromFdiLink } from '../../eunity/imagingViewer'
import { MyChartRequest } from '../../core/myChartRequest'
import { MissingVerificationTokenError } from '../../core/util'
import { base64UrlDecode } from '../../../../shared/base64url'
import { renderOutput } from '../../processors/processor'

const TOKEN_PAGE = '<input name="__RequestVerificationToken" value="t" />'
const EMPTY_LIST = JSON.stringify({ newResultGroups: [] })

/** Route-based mock: matches URL substrings to responses, in order per pattern. */
function routedRequest(routes: Record<string, Array<{ body: string; status?: number }>>) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  const counters: Record<string, number> = {}
  const calls: Array<{ url: string; init?: RequestInit | undefined }> = []
  req.transport = mock(async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    for (const pattern of Object.keys(routes)) {
      if (url.includes(pattern)) {
        const idx = (counters[pattern] = (counters[pattern] ?? 0))
        counters[pattern] = idx + 1
        const responses = routes[pattern]!
        const r = responses[Math.min(idx, responses.length - 1)]!
        return new Response(r.body, { status: r.status ?? 200 })
      }
    }
    return new Response('', { status: 404 })
  })
  return { req, calls }
}

const NULL_HISTORY = { body: JSON.stringify(null) }

/** One imaging order listed in group 1, everything else empty. */
function portalWith(details: unknown, extra: Record<string, Array<{ body: string; status?: number }>> = {}) {
  return routedRequest({
    '/app/test-results': [{ body: TOKEN_PAGE }],
    'GetList': [{ body: EMPTY_LIST }, { body: JSON.stringify({ newResultGroups: [{ key: 'K1' }] }) }, { body: EMPTY_LIST }],
    'GetDetails': [{ body: JSON.stringify(details) }],
    'GetMultipleHistoricalResultComponents': [NULL_HISTORY],
    ...extra,
  })
}

const XRAY_DETAILS = {
  orderName: 'Chest X-Ray',
  key: 'K1',
  results: [{
    imageStudies: [{ studyId: 'S1', studyDescription: 'XR CHEST 2 VIEWS', modality: 'CR', studyDate: '03/01/2024', viewerUrl: '/viewer/S1', numberOfImages: 2 }],
    scans: [{ scanId: 'SC1', scanType: 'Radiograph', scanDate: '03/01/2024', viewerUrl: '/viewer/SC1' }],
    studyResult: {
      narrative: { hasContent: true, contentAsString: 'Lungs are clear', contentAsHtml: '<p>Lungs are clear</p>', signingInstantTimestamp: '2024-03-01' },
      impression: { hasContent: true, contentAsString: 'Normal chest X-ray', signingInstantTimestamp: '2024-03-01' },
      addenda: [{ hasContent: true, contentAsString: 'Addendum: no change', signingInstantTimestamp: '2024-03-02' }],
    },
    orderMetadata: { resultTimestampDisplay: '2024-03-01', prioritizedInstantISO: '2024-03-01T10:00:00Z', orderProviderName: 'Dr. Smith', resultStatus: 'Final' },
  }],
}

describe('getImagingResults', () => {
  it('throws when the test-results page has no verification token', async () => {
    const { req } = routedRequest({ 'test-results': [{ body: '<html></html>' }] })
    await expect(getImagingResults(req)).rejects.toBeInstanceOf(MissingVerificationTokenError)
  })

  it('keeps imaging orders with their narrative, impression and series, and says why they were classified', async () => {
    const { req } = portalWith(XRAY_DETAILS)

    const result = await getImagingResults(req)
    expect(result.orders).toHaveLength(1)
    const order = result.orders[0]!
    expect(order).toMatchObject({
      index: 0,
      image_id: null,
      hasViewableImages: false,
      isImagingByName: true,
      isImagingByContent: true,
      orderName: 'Chest X-Ray',
      key: 'K1',
    })
    const r = order.results[0]!
    expect(r.studyResult.narrative).toEqual({ contentAsString: 'Lungs are clear', signingInstantTimestamp: '2024-03-01' })
    expect(r.studyResult.impression.contentAsString).toBe('Normal chest X-ray')
    expect(r.studyResult.addenda).toEqual([{ contentAsString: 'Addendum: no change', signingInstantTimestamp: '2024-03-02' }])
    expect(r.imageStudies).toEqual([{ studyDescription: 'XR CHEST 2 VIEWS', modality: 'CR', studyDate: '03/01/2024', numberOfImages: 2 }])
    expect(r.scans).toEqual([{ scanType: 'Radiograph', scanDate: '03/01/2024' }])
    // Viewer plumbing and today's top-level copies are not carried over.
    const json = JSON.stringify(result)
    for (const dropped of ['viewerUrl', 'studyId', 'scanId', 'reportText', 'resultDate', 'orderProvider"', 'contentAsHtml']) {
      expect(json).not.toContain(dropped)
    }
  })

  it('filters out non-imaging results', async () => {
    const { req } = portalWith({
      orderName: 'CBC',
      key: 'K1',
      results: [{
        imageStudies: [],
        scans: [],
        studyResult: { narrative: { hasContent: false }, impression: { hasContent: false } },
        orderMetadata: {},
      }],
    })

    expect(await getImagingResults(req)).toEqual({ orders: [] })
  })

  it('classifies by content when the name carries no keyword', async () => {
    const { req } = portalWith({
      orderName: 'Procedure',
      key: 'K1',
      results: [{ studyResult: { narrative: { contentAsString: 'Findings…' } } }],
    })

    const result = await getImagingResults(req)
    expect(result.orders[0]).toMatchObject({ isImagingByName: false, isImagingByContent: true })
  })

  it('mints image_id from a structured fdiLink when the report HTML has no data-fdi-context, recording the FdiData exchange', async () => {
    // Mass General Brigham shape: no data-fdi-context anywhere; each result
    // carries fdiLink.redirectUrl with the fdi/ord pair as query params.
    const fdi = 'WP-24aaa-3D-3D-24bbb-3D'
    const ord = 'WP-24ccc-3D-3D-24ddd-2Feee-2Bfff-3D'
    const { req, calls } = portalWith(
      {
        orderName: 'XR Chest 2 Views',
        key: 'K1',
        results: [{
          fdiLink: { redirectUrl: `/Extensibility/Redirection/FdiRedirection?fdi=${fdi}&ord=${ord}` },
          studyResult: { narrative: { hasContent: true, contentAsString: 'No acute findings' } },
        }],
      },
      {
        'CSRFToken': [{ body: JSON.stringify({ Token: 'csrf-token-1234567890' }) }],
        'FdiData': [{ body: JSON.stringify({ url: 'https://sts.example.org/SamlResponseHtml?o=1', launchmode: 2, IsFdiPost: false }) }],
      },
    )

    const raw = await fetchImagingResultsRaw(req)
    const fdiRequest = raw.requests.find((r) => r.path.includes('/Extensibility/Redirection/FdiData'))!
    expect(fdiRequest).toMatchObject({ method: 'POST', status: 200, body: { url: 'https://sts.example.org/SamlResponseHtml?o=1' } })
    expect(fdiRequest.path).toContain(`fdi=${fdi}`)
    expect(fdiRequest.path).not.toContain('noCache')
    expect(fdiRequest.requestBody).toBe('__RequestVerificationToken=csrf-token-1234567890')
    expect(calls.find((c) => c.url.includes('FdiData'))!.init!.method).toBe('POST')

    const result = imagingResultsProcessor.standard(raw)
    expect(result.orders).toHaveLength(1)
    expect(result.orders[0]).toMatchObject({ hasViewableImages: true, image_id: imageIdFor({ fdi, ord }) })
    expect(JSON.parse(base64UrlDecode(result.orders[0]!.image_id!))).toEqual({ fdi, ord })
    expect(result.orders[0]!.results[0]!.fdiLink.redirectUrl).toContain('FdiRedirection')
    // The single-use viewer URL is raw only.
    expect(JSON.stringify(result)).not.toContain('sts.example.org')
  })

  it('mints image_id from data-fdi-context in the report HTML', async () => {
    const { req } = portalWith(
      {
        orderName: 'CT Head',
        key: 'K1',
        results: [{ reportDetails: { reportID: 'rpt-ct', reportVars: { ordId: '1', ordDat: '2' } } }],
      },
      {
        'LoadReportContent': [{ body: JSON.stringify({ reportContent: `<div><p>FINDINGS: none.</p><div data-fdi-context='${JSON.stringify({ fdi: 'FDI-CT', ord: 'ORD-CT' })}'><a href="#">View Images</a></div></div>` }) }],
        'CSRFToken': [{ body: JSON.stringify({ Token: 'csrf-token-1234567890' }) }],
        'FdiData': [{ body: JSON.stringify({ url: 'https://sts.example.org/x' }) }],
      },
    )

    const result = await getImagingResults(req)
    expect(result.orders[0]).toMatchObject({
      hasViewableImages: true,
      image_id: imageIdFor({ fdi: 'FDI-CT', ord: 'ORD-CT' }),
      isImagingByName: true,
      isImagingByContent: true,
    })
    expect(result.orders[0]!.results[0]!.reportContentText).toBe('FINDINGS: none.\nView Images')
    expect(JSON.stringify(result)).not.toContain('data-fdi-context')
  })

  it('tolerates a refused FdiData call — the order is reported without viewable images', async () => {
    const { req } = portalWith(
      {
        orderName: 'XR Knee',
        key: 'K1',
        results: [{ fdiLink: { redirectUrl: '/Extensibility/Redirection/FdiRedirection?fdi=A&ord=B' } }],
      },
      {
        'CSRFToken': [{ body: JSON.stringify({ Token: 'csrf-token-1234567890' }) }],
        'FdiData': [{ body: 'Forbidden', status: 403 }],
      },
    )

    const raw = await fetchImagingResultsRaw(req)
    expect(raw.requests.find((r) => r.path.includes('FdiData'))!.status).toBe(403)
    const result = imagingResultsProcessor.standard(raw)
    // The pair was extractable, so the handle is still minted; only the viewer session failed.
    expect(result.orders[0]).toMatchObject({ hasViewableImages: true, image_id: imageIdFor({ fdi: 'A', ord: 'B' }) })
  })

  it('indexes orders by their position in the filtered list', async () => {
    const { req } = routedRequest({
      '/app/test-results': [{ body: TOKEN_PAGE }],
      'GetList': [{ body: JSON.stringify({ newResultGroups: [{ key: 'K1' }, { key: 'K2' }, { key: 'K3' }] }) }, { body: EMPTY_LIST }],
      'GetDetails': [
        { body: JSON.stringify({ orderName: 'MRI Brain', key: 'K1' }) },
        { body: JSON.stringify({ orderName: 'CBC', key: 'K2' }) },
        { body: JSON.stringify({ orderName: 'Ultrasound Abdomen', key: 'K3' }) },
      ],
      'GetMultipleHistoricalResultComponents': [NULL_HISTORY],
    })

    const result = await getImagingResults(req)
    expect(result.orders.map((o) => [o.index, o.orderName])).toEqual([[0, 'MRI Brain'], [1, 'Ultrasound Abdomen']])
  })
})

describe('imagingResultsProcessor.concise', () => {
  it('adds the handles and the series to the lab projection', async () => {
    const { req } = portalWith(XRAY_DETAILS)
    const raw = await fetchImagingResultsRaw(req)
    const concise = imagingResultsProcessor.concise(imagingResultsProcessor.standard(raw)) as { orders: ImagingOrderConcise[] }
    expect(concise.orders[0]).toMatchObject({
      index: 0,
      image_id: null,
      hasViewableImages: false,
      orderName: 'Chest X-Ray',
      results: [{
        name: null,
        prioritizedInstantISO: '2024-03-01T10:00:00Z',
        resultStatus: 'Final',
        orderProviderName: 'Dr. Smith',
        narrative: 'Lungs are clear',
        impression: 'Normal chest X-ray',
        addenda: ['Addendum: no change'],
        imageStudies: [{ studyDescription: 'XR CHEST 2 VIEWS', modality: 'CR', studyDate: '03/01/2024', numberOfImages: 2 }],
      }],
      historicalResults: {},
    })
    expect(JSON.stringify(concise)).not.toContain('isImagingByName')

    expect(renderOutput(imagingResultsProcessor, raw, 'raw')).toBe(raw)
    expect(renderOutput(imagingResultsProcessor, raw, 'standard')).toContain('- **isImagingByName**: true')
    expect(renderOutput(imagingResultsProcessor, raw, 'concise')).toContain('- **hasViewableImages**: false')
  })

  it('returns no orders for an empty envelope', () => {
    expect(imagingResultsProcessor.standard({ requests: [] })).toEqual({ orders: [] })
  })
})

describe('isImagingByName', () => {
  it('matches the imaging keywords case-insensitively and nothing else', () => {
    expect(isImagingByName('XR Chest 2 Views')).toBe(true)
    expect(isImagingByName('MRI BRAIN W/O CONTRAST')).toBe(true)
    expect(isImagingByName('Surgical pathology')).toBe(true)
    expect(isImagingByName('CBC with differential')).toBe(false)
    expect(isImagingByName(null)).toBe(false)
  })
})

describe('extractFdiContextFromFdiLink', () => {
  it('parses fdi and ord from the redirect URL', () => {
    expect(
      extractFdiContextFromFdiLink('/Extensibility/Redirection/FdiRedirection?fdi=WP-24a-3D&ord=WP-24b-2Fc-2Bd-3D'),
    ).toEqual({ fdi: 'WP-24a-3D', ord: 'WP-24b-2Fc-2Bd-3D' })
  })

  it('returns null when fdi or ord is missing', () => {
    expect(extractFdiContextFromFdiLink('/Extensibility/Redirection/FdiRedirection?fdi=WP-24a-3D')).toBeNull()
    expect(extractFdiContextFromFdiLink('/Extensibility/Redirection/FdiRedirection?ord=WP-24b-3D')).toBeNull()
    expect(extractFdiContextFromFdiLink('/Extensibility/Redirection/FdiRedirection')).toBeNull()
    expect(extractFdiContextFromFdiLink('')).toBeNull()
  })
})
