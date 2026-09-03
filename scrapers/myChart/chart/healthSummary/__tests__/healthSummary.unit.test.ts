import { describe, it, expect, mock } from 'bun:test'
import { getHealthSummary, fetchHealthSummaryRaw, healthSummaryProcessor } from '../healthSummary'
import { MyChartRequest } from '../../../core/myChartRequest'
import { MissingVerificationTokenError } from '../../../core/util'
import { renderOutput } from '../../../processors/processor'

function mockRequest(responses: Array<{ body: string }>) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  let i = 0
  req.transport = mock(async (url: string) => {
    // The two API calls are issued in parallel; answer by path so order does
    // not matter.
    if (url.includes('FetchHealthSummary')) return new Response(responses[1]!.body, { status: 200 })
    if (url.includes('FetchH2GHeader')) return new Response(responses[2]!.body, { status: 200 })
    const r = responses[i++]
    return new Response(r!.body, { status: 200 })
  })
  return req
}

const TOKEN = { body: '<input name="__RequestVerificationToken" value="t" />' }

describe('getHealthSummary', () => {
  it('throws when no token found', async () => {
    const req = mockRequest([{ body: '<html></html>' }])
    await expect(getHealthSummary(req)).rejects.toBeInstanceOf(MissingVerificationTokenError)
  })

  it('joins the two API bodies into the standard object', async () => {
    const req = mockRequest([
      TOKEN,
      {
        body: JSON.stringify({
          header: { patientAge: '69 y.o.', height: { value: "6' 0\"", dateRecorded: '01/10/2026' }, weight: { value: '260 lb', dateRecorded: '01/10/2026' }, bloodType: 'O+' },
          patientFirstName: 'Homer',
          isPatientAdmitted: false,
          conditionList: [{ name: 'X' }],
          quickLinkDictionary: { Allergies: '/x' },
        }),
      },
      { body: JSON.stringify({ lastVisit: { date: '01/10/2026', visitType: 'Annual Physical', visitDetailsURL: '/v' }, nextVisit: { date: '04/10/2026', visitType: 'Follow-up' }, upcomingVisitsList: [{}] }) },
    ])
    const result = await getHealthSummary(req)
    expect(result).toEqual({
      header: {
        patientAge: '69 y.o.',
        bloodType: 'O+',
        height: { value: "6' 0\"", dateRecorded: '01/10/2026' },
        weight: { value: '260 lb', dateRecorded: '01/10/2026' },
      },
      patientFirstName: 'Homer',
      isPatientAdmitted: false,
      conditionList: [{ name: 'X' }],
      journeyList: [],
      actionPlans: [],
      lastVisit: { date: '01/10/2026', visitType: 'Annual Physical' },
      nextVisit: { date: '04/10/2026', visitType: 'Follow-up' },
    })
  })

  it('emits nulls for missing height/weight/visits rather than dropping them', async () => {
    const req = mockRequest([TOKEN, { body: JSON.stringify({ header: { patientAge: '5' } }) }, { body: JSON.stringify({}) }])
    const result = await getHealthSummary(req)
    expect(result.header.height).toEqual({ value: null, dateRecorded: null })
    expect(result.header.bloodType).toBeNull()
    expect(result.isPatientAdmitted).toBeNull()
    expect(result.lastVisit).toEqual({ date: null, visitType: null })
  })

  it('records both API requests and renders concise without the first name', async () => {
    const req = mockRequest([TOKEN, { body: JSON.stringify({ header: { bloodType: 'A-' }, patientFirstName: 'Marge' }) }, { body: JSON.stringify({ lastVisit: { date: 'd' } }) }])
    const raw = await fetchHealthSummaryRaw(req)
    expect(raw.requests.map((r) => r.path).sort()).toEqual(['/api/health-summary/FetchH2GHeader', '/api/health-summary/FetchHealthSummary', '/app/health-summary'])
    const concise = renderOutput(healthSummaryProcessor, raw, 'concise') as string
    expect(concise).toContain('- **bloodType**: A-')
    expect(concise).not.toContain('Marge')
    expect(renderOutput(healthSummaryProcessor, raw, 'standard')).toContain('Marge')
    expect(renderOutput(healthSummaryProcessor, raw, 'raw')).toBe(raw)
  })
})
