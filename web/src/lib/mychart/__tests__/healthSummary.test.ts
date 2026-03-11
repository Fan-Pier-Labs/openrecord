import { describe, it, expect, mock } from 'bun:test'
import { getHealthSummary } from '../healthSummary'
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

describe('getHealthSummary', () => {
  it('returns empty result when no token found', async () => {
    const req = mockRequest([{ body: '<html></html>' }])
    const result = await getHealthSummary(req)
    expect(result).toEqual({
      patientAge: '',
      height: null,
      weight: null,
      bloodType: '',
      patientFirstName: '',
      lastVisit: null,
    })
  })

  it('parses full health summary from two API calls', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      {
        body: JSON.stringify({
          header: {
            patientAge: '35 years',
            height: { value: '5\' 10"', dateRecorded: '01/15/2024' },
            weight: { value: '175 lbs', dateRecorded: '01/15/2024' },
            bloodType: 'O+',
          },
          patientFirstName: 'Alice',
        }),
      },
      {
        body: JSON.stringify({
          lastVisit: { date: '01/15/2024', visitType: 'Annual Physical' },
        }),
      },
    ])

    const result = await getHealthSummary(req)
    expect(result.patientAge).toBe('35 years')
    expect(result.height).toEqual({ value: '5\' 10"', dateRecorded: '01/15/2024' })
    expect(result.weight).toEqual({ value: '175 lbs', dateRecorded: '01/15/2024' })
    expect(result.bloodType).toBe('O+')
    expect(result.patientFirstName).toBe('Alice')
    expect(result.lastVisit).toEqual({ date: '01/15/2024', visitType: 'Annual Physical' })
  })

  it('handles missing height/weight/lastVisit', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      { body: JSON.stringify({ header: {}, patientFirstName: 'Bob' }) },
      { body: JSON.stringify({}) },
    ])

    const result = await getHealthSummary(req)
    expect(result.height).toBeNull()
    expect(result.weight).toBeNull()
    expect(result.lastVisit).toBeNull()
    expect(result.patientFirstName).toBe('Bob')
  })
})
