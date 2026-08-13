import { describe, it, expect, mock } from 'bun:test'
import { getImagingResults } from '../labs_and_procedure_results/labResults'
import { extractFdiContextFromFdiLink } from '../eunity/imagingViewer'
import { MyChartRequest } from '../myChartRequest'

function mockRequest(responses: Array<{ body: string }>) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  let i = 0
  req.transport = mock(async () => {
    const r = responses[i++]
    return new Response(r!.body, { status: 200 })
  })
  return req
}

describe('getImagingResults', () => {
  it('returns empty array when no token found', async () => {
    const req = mockRequest([{ body: '<html></html>' }])
    expect(await getImagingResults(req)).toEqual([])
  })

  it('parses imaging results with narrative', async () => {
    // Scrapers version iterates group types [0,1,2,3]
    // Response order: test-results page, GetList(0), GetList(1) with result, GetDetails, GetList(2), GetList(3)
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      // Group 0 - empty
      { body: JSON.stringify({ newResultGroups: [] }) },
      // Group 1 - has imaging result (name matches keyword)
      { body: JSON.stringify({ newResultGroups: [{ key: 'K1' }] }) },
      // GetDetails for K1
      { body: JSON.stringify({
        orderName: 'Chest X-Ray',
        key: 'K1',
        results: [{
          imageStudies: [],
          scans: [],
          studyResult: {
            narrative: { hasContent: true, contentAsString: 'Lungs are clear' },
            impression: { hasContent: true, contentAsString: 'Normal chest X-ray' },
          },
          orderMetadata: { resultTimestampDisplay: '2024-03-01', orderProviderName: 'Dr. Smith' },
        }],
      }) },
      // Group 2 - empty
      { body: JSON.stringify({ newResultGroups: [] }) },
      // Group 3 - empty
      { body: JSON.stringify({ newResultGroups: [] }) },
    ])

    const result = await getImagingResults(req)
    expect(result).toHaveLength(1)
    expect(result[0]!.orderName).toBe('Chest X-Ray')
    // Scrapers version stores narrative/impression in reportText
    expect(result[0]!.reportText).toContain('Lungs are clear')
    expect(result[0]!.reportText).toContain('Normal chest X-ray')
  })

  it('filters out non-imaging results', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      // Group 0 - empty
      { body: JSON.stringify({ newResultGroups: [] }) },
      // Group 1 - lab result with no imaging (name doesn't match keywords, no imaging data)
      { body: JSON.stringify({ newResultGroups: [{ key: 'K1' }] }) },
      { body: JSON.stringify({
        orderName: 'CBC',
        key: 'K1',
        results: [{
          imageStudies: [],
          scans: [],
          studyResult: {
            narrative: { hasContent: false },
            impression: { hasContent: false },
          },
          orderMetadata: {},
        }],
      }) },
      // Group 2 - empty
      { body: JSON.stringify({ newResultGroups: [] }) },
      // Group 3 - empty
      { body: JSON.stringify({ newResultGroups: [] }) },
    ])

    const result = await getImagingResults(req)
    expect(result).toEqual([])
  })

  it('extracts fdiContext from a structured fdiLink when the report HTML has no data-fdi-context', async () => {
    // Mass General Brigham shape: no data-fdi-context anywhere; each result
    // carries fdiLink.redirectUrl with the fdi/ord pair as query params.
    const fdi = 'WP-24aaa-3D-3D-24bbb-3D'
    const ord = 'WP-24ccc-3D-3D-24ddd-2Feee-2Bfff-3D'
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      // Group 0 - empty
      { body: JSON.stringify({ newResultGroups: [] }) },
      // Group 1 - imaging result with fdiLink
      { body: JSON.stringify({ newResultGroups: [{ key: 'K1' }] }) },
      // GetDetails for K1
      { body: JSON.stringify({
        orderName: 'XR Chest 2 Views',
        key: 'K1',
        results: [{
          imageStudies: [],
          scans: [],
          fdiLink: { redirectUrl: `/Extensibility/Redirection/FdiRedirection?fdi=${fdi}&ord=${ord}` },
          studyResult: {
            narrative: { hasContent: true, contentAsString: 'No acute findings' },
            impression: { hasContent: false },
          },
          orderMetadata: { resultTimestampDisplay: '2024-09-03', orderProviderName: 'Dr. Smith' },
        }],
      }) },
      // getImageViewerSamlUrl: CSRF token, then FdiData
      { body: '<input name="__RequestVerificationToken" value="t2" />' },
      { body: JSON.stringify({ url: 'https://sts.example.org/SamlResponseHtml?o=1' }) },
      // Group 2 - empty
      { body: JSON.stringify({ newResultGroups: [] }) },
      // Group 3 - empty
      { body: JSON.stringify({ newResultGroups: [] }) },
    ])

    const result = await getImagingResults(req)
    expect(result).toHaveLength(1)
    expect(result[0]!.fdiContext).toEqual({ fdi, ord })
    expect(result[0]!.samlUrl).toBe('https://sts.example.org/SamlResponseHtml?o=1')
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
