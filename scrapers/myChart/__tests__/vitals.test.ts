import { describe, it, expect, mock } from 'bun:test'
import { getVitals } from '../vitals'
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

describe('getVitals', () => {
  it('returns empty array when no token found', async () => {
    const req = mockRequest([{ body: '<html></html>' }])
    expect(await getVitals(req)).toEqual([])
  })

  it('parses flowsheets from API response', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      {
        body: JSON.stringify({
          flowsheets: [
            {
              name: 'Blood Pressure',
              flowsheetId: 'BP-1',
              readings: [
                { date: '2024-01-01', value: '120/80', units: 'mmHg' },
              ],
            },
          ],
        }),
      },
    ])

    const result = await getVitals(req)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      name: 'Blood Pressure',
      flowsheetId: 'BP-1',
      readings: [{ date: '2024-01-01', value: '120/80', units: 'mmHg' }],
    })
  })

  it('handles missing fields with defaults', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      { body: JSON.stringify({ flowsheets: [{}] }) },
    ])

    const result = await getVitals(req)
    expect(result[0]).toEqual({ name: '', flowsheetId: '', readings: [] })
  })

  it('handles empty flowsheets list', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      { body: JSON.stringify({ flowsheets: [] }) },
    ])
    expect(await getVitals(req)).toEqual([])
  })
})
