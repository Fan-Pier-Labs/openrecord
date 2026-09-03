import { describe, it, expect, mock } from 'bun:test'
import { getCareJourneys, fetchCareJourneysRaw, careJourneysProcessor } from '../careJourneys'
import { MyChartRequest } from '../../core/myChartRequest'
import { MissingVerificationTokenError } from '../../core/util'

function mockRequest(responses: Array<{ body: string }>) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  let i = 0
  req.transport = mock(async () => {
    const r = responses[i++]
    return new Response(r!.body, { status: 200, headers: { 'content-type': 'application/json' } })
  })
  return req
}

const TOKEN_PAGE = '<input name="__RequestVerificationToken" value="t" />'
const JOURNEY = { id: 'CJ1', name: 'Post-Surgery Recovery', description: 'Follow-up', status: 'Active', providerName: 'Dr. Jones' }

describe('fetchCareJourneysRaw', () => {
  it('throws rather than returning no journeys when the page has no token', async () => {
    await expect(fetchCareJourneysRaw(mockRequest([{ body: '<html></html>' }]))).rejects.toBeInstanceOf(MissingVerificationTokenError)
  })

  it('records the page and the GetCareJourneys POST', async () => {
    const raw = await fetchCareJourneysRaw(mockRequest([{ body: TOKEN_PAGE }, { body: JSON.stringify({ careJourneys: [JOURNEY] }) }]))
    expect(raw.requests.map((r) => `${r.method} ${r.path}`)).toEqual(['GET /app/care-journeys', 'POST /api/care-journeys/GetCareJourneys'])
    expect(raw.requests[1]!.body).toEqual({ careJourneys: [JOURNEY] })
  })
})

describe('careJourneysProcessor', () => {
  // No capture exists, so the element passes through whole (rule 10).
  it('passes each journey through whole', () => {
    const standard = careJourneysProcessor.standard({
      requests: [{ path: '/api/care-journeys/GetCareJourneys', method: 'POST', status: 200, contentType: 'application/json', body: { careJourneys: [JOURNEY, {}] } }],
    })
    expect(standard).toEqual({ careJourneys: [JOURNEY, {}] })
    expect(careJourneysProcessor.concise(standard)).toEqual(standard)
  })

  it('reports an empty or missing list as empty', () => {
    expect(careJourneysProcessor.standard({ requests: [] })).toEqual({ careJourneys: [] })
  })
})

describe('getCareJourneys', () => {
  it('returns the standard object', async () => {
    expect(await getCareJourneys(mockRequest([{ body: TOKEN_PAGE }, { body: JSON.stringify({ careJourneys: [JOURNEY] }) }]))).toEqual({ careJourneys: [JOURNEY] })
  })
})
