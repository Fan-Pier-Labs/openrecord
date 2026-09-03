import { describe, it, expect, mock } from 'bun:test'
import { getGoals, fetchGoalsRaw, goalsProcessor } from '../goals'
import { MyChartRequest } from '../../../core/myChartRequest'
import { MissingVerificationTokenError } from '../../../core/util'
import { renderOutput } from '../../../processors/processor'

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

const TOKEN = { body: '<input name="__RequestVerificationToken" value="t" />' }

describe('getGoals', () => {
  it('throws when no token found', async () => {
    const req = mockRequest([{ body: '<html></html>' }])
    await expect(getGoals(req)).rejects.toBeInstanceOf(MissingVerificationTokenError)
  })

  it('passes each list through whole, tagged with its source', async () => {
    const req = mockRequest([
      TOKEN,
      { body: JSON.stringify({ careTeamGoals: [{ name: 'Lose weight', status: 'In Progress' }], quickLinkDictionary: {} }) },
      // The captured patient-goal element has none of the fixture's display
      // fields; whatever it carries is passed through untouched.
      { body: JSON.stringify({ patientGoals: [{ goalId: 'G-1', goalType: 2, readings: [], complianceType: 0, lastUpdatedDate: '2026-01-01', creationDate: '2025-12-01' }] }) },
    ])
    expect(await getGoals(req)).toEqual({
      careTeamGoals: [{ name: 'Lose weight', status: 'In Progress', source: 'care_team' }],
      patientGoals: [{ goalId: 'G-1', goalType: 2, readings: [], complianceType: 0, lastUpdatedDate: '2026-01-01', creationDate: '2025-12-01', source: 'patient' }],
    })
  })

  it('handles missing lists and renders every mode', async () => {
    const req = mockRequest([TOKEN, { body: JSON.stringify({}) }, { body: JSON.stringify({ patientGoals: [] }) }])
    const raw = await fetchGoalsRaw(req)
    expect(raw.requests.map((r) => r.path)).toEqual(['/app/goals', '/api/goals/LoadCareTeamGoals', '/api/goals/LoadPatientGoals'])
    expect(goalsProcessor.standard(raw)).toEqual({ careTeamGoals: [], patientGoals: [] })
    expect(renderOutput(goalsProcessor, raw, 'concise')).toBe('- **careTeamGoals**: (none)\n- **patientGoals**: (none)\n')
    expect(renderOutput(goalsProcessor, raw, 'raw')).toBe(raw)
  })
})
