import { describe, it, expect, mock } from 'bun:test'
import { getImagingResults } from '../imagingResults'
import { MyChartRequest } from '../myChartRequest'

function mockRequest(responses: Array<{ body: string }>) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  let i = 0
  req.fetchWithCookieJar = mock(async () => {
    const r = responses[i++]
    return new Response(r.body, { status: 200 })
  }) as typeof req.fetchWithCookieJar
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
    expect(result[0].orderName).toBe('Chest X-Ray')
    // Scrapers version stores narrative/impression in reportText
    expect(result[0].reportText).toContain('Lungs are clear')
    expect(result[0].reportText).toContain('Normal chest X-ray')
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
})
