import { describe, it, expect, mock } from 'bun:test'
import { getCareJourneys } from '../careJourneys'
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

describe('getCareJourneys', () => {
  it('returns empty array when no token found', async () => {
    const req = mockRequest([{ body: '<html></html>' }])
    expect(await getCareJourneys(req)).toEqual([])
  })

  it('parses care journeys from API response', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      {
        body: JSON.stringify({
          careJourneys: [
            { id: 'CJ1', name: 'Post-Surgery Recovery', description: 'Knee surgery follow-up', status: 'Active', providerName: 'Dr. Jones' },
          ],
        }),
      },
    ])

    const result = await getCareJourneys(req)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      id: 'CJ1',
      name: 'Post-Surgery Recovery',
      description: 'Knee surgery follow-up',
      status: 'Active',
      providerName: 'Dr. Jones',
    })
  })

  it('handles missing fields with defaults', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      { body: JSON.stringify({ careJourneys: [{}] }) },
    ])
    const result = await getCareJourneys(req)
    expect(result[0]).toEqual({ id: '', name: '', description: '', status: '', providerName: '' })
  })

  it('handles empty list', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      { body: JSON.stringify({ careJourneys: [] }) },
    ])
    expect(await getCareJourneys(req)).toEqual([])
  })
})
