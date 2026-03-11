import { describe, it, expect, mock } from 'bun:test'
import { getGoals } from '../goals'
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

describe('getGoals', () => {
  it('returns empty goals when no token found', async () => {
    const req = mockRequest([{ body: '<html></html>' }])
    expect(await getGoals(req)).toEqual({ careTeamGoals: [], patientGoals: [] })
  })

  it('parses goals from API response', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      { body: JSON.stringify({ goals: [{ name: 'Lower BP', description: 'Reduce to 120/80', status: 'active', startDate: '2024-01-01', targetDate: '2024-06-01' }] }) },
      { body: JSON.stringify({ goals: [{ name: 'Walk daily', description: '30 min walk', status: 'in_progress', startDate: '2024-02-01', targetDate: '2024-12-31' }] }) },
    ])

    const result = await getGoals(req)
    expect(result.careTeamGoals).toHaveLength(1)
    expect(result.careTeamGoals[0]).toEqual({
      name: 'Lower BP',
      description: 'Reduce to 120/80',
      status: 'active',
      startDate: '2024-01-01',
      targetDate: '2024-06-01',
      source: 'care_team',
    })
    expect(result.patientGoals).toHaveLength(1)
    expect(result.patientGoals[0].source).toBe('patient')
  })

  it('handles missing fields with defaults', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      { body: JSON.stringify({ goals: [{}] }) },
      { body: JSON.stringify({ goals: [] }) },
    ])

    const result = await getGoals(req)
    expect(result.careTeamGoals[0]).toEqual({
      name: '',
      description: '',
      status: '',
      startDate: '',
      targetDate: '',
      source: 'care_team',
    })
    expect(result.patientGoals).toEqual([])
  })
})
