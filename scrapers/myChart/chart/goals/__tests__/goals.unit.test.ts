import { describe, it, expect, mock } from 'bun:test'
import {
  LOAD_CARE_TEAM_GOALS_PATH,
  LOAD_PATIENT_GOALS_PATH,
  fetchGoalsRaw,
  getGoals,
  goalsProcessor,
} from '../goals'
import { MyChartRequest } from '../../../core/myChartRequest'
import { MissingVerificationTokenError } from '../../../core/util'
import { renderOutput } from '../../../processors/processor'

function mockRequest(responses: Array<{ body: string; status?: number }>) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  let i = 0
  req.transport = mock(async () => {
    const r = responses[i++]
    return new Response(r!.body, { status: r!.status ?? 200 })
  })
  return req
}

const TOKEN = { body: '<input name="__RequestVerificationToken" value="t" />' }

/**
 * The element MyChart appends for every patient: an empty editable slot, not a
 * goal. Three of four captured accounts returned exactly this and nothing else.
 */
const EMPTY_SLOT = {
  goalId: '',
  goalType: 0,
  readings: [],
  complianceType: 0,
  lastUpdatedDate: '',
  creationDate: '',
  isSharingNotesEnabled: false,
}

describe('fetchGoalsRaw', () => {
  it('throws when no token found', async () => {
    await expect(getGoals(mockRequest([{ body: '<html></html>' }]))).rejects.toBeInstanceOf(
      MissingVerificationTokenError,
    )
  })

  it("asks for the activity's whole care-team list, not the widget's abbreviated one", async () => {
    const raw = await fetchGoalsRaw(
      mockRequest([TOKEN, { body: '{"careTeamGoals":[]}' }, { body: '{"patientGoals":[]}' }]),
    )
    expect(raw.requests.map((r) => r.path)).toEqual([
      '/app/goals',
      LOAD_CARE_TEAM_GOALS_PATH,
      LOAD_PATIENT_GOALS_PATH,
    ])
    expect(raw.requests[1]!.requestBody).toEqual({ FullLoad: true })
    expect(raw.requests[2]!.requestBody).toEqual({})
  })
})

describe('getGoals', () => {
  it('passes each list through whole, tagged with its source', async () => {
    const patientGoal = { goalId: 'G-1', text: 'Walk 30 minutes a day', goalType: 6, readings: [] }
    const result = await getGoals(
      mockRequest([
        TOKEN,
        { body: JSON.stringify({ careTeamGoals: [{ goalId: 'IGO-1', title: 'Lose 50 lbs', goalType: 3 }] }) },
        { body: JSON.stringify({ patientGoals: [patientGoal] }) },
      ]),
    )
    expect(result).toEqual({
      careTeamGoals: [{ goalId: 'IGO-1', title: 'Lose 50 lbs', goalType: 3, source: 'care_team' }],
      patientGoals: [{ ...patientGoal, source: 'patient' }],
      unavailable: [],
    })
  })

  // Without this every patient in the product has exactly one nameless goal.
  it('drops the empty editable slot MyChart returns for a patient with no goals', async () => {
    const result = await getGoals(
      mockRequest([TOKEN, { body: '{"careTeamGoals":[]}' }, { body: JSON.stringify({ patientGoals: [EMPTY_SLOT] }) }]),
    )
    expect(result.patientGoals).toEqual([])
  })

  it('keeps a real goal that sits alongside the slot', async () => {
    const real = { ...EMPTY_SLOT, goalId: 'G-1', text: 'Walk 30 minutes a day' }
    const result = await getGoals(
      mockRequest([
        TOKEN,
        { body: '{"careTeamGoals":[]}' },
        { body: JSON.stringify({ patientGoals: [real, EMPTY_SLOT] }) },
      ]),
    )
    expect(result.patientGoals).toEqual([{ ...real, source: 'patient' }])
  })

  // One captured instance answers LoadPatientGoals with HTTP 500 on every
  // request while care-team goals load fine. "You have set no goals" is the
  // wrong thing to say about that, and losing the care-team half is the wrong
  // thing to do about it.
  it('names a failed endpoint instead of reporting it empty, and keeps the other list', async () => {
    const result = await getGoals(
      mockRequest([
        TOKEN,
        { body: JSON.stringify({ careTeamGoals: [{ goalId: 'IGO-1', title: 'Lose 50 lbs' }] }) },
        { body: '{}', status: 500 },
      ]),
    )
    expect(result.careTeamGoals).toHaveLength(1)
    expect(result.patientGoals).toEqual([])
    expect(result.unavailable).toEqual([LOAD_PATIENT_GOALS_PATH])
  })

  it('throws when neither endpoint answered — nothing loaded is a failed read, not no goals', async () => {
    await expect(
      getGoals(mockRequest([TOKEN, { body: 'server error', status: 500 }, { body: 'server error', status: 500 }])),
    ).rejects.toThrow(/POST \/api\/goals\/LoadCareTeamGoals with HTTP 500/)
  })

  it('handles missing lists and renders every mode', async () => {
    const raw = await fetchGoalsRaw(mockRequest([TOKEN, { body: '{}' }, { body: '{"patientGoals":[]}' }]))
    expect(goalsProcessor.standard(raw)).toEqual({ careTeamGoals: [], patientGoals: [], unavailable: [] })
    expect(renderOutput(goalsProcessor, raw, 'concise')).toBe(
      '- **careTeamGoals**: (none)\n- **patientGoals**: (none)\n- **unavailable**: (none)\n',
    )
    expect(renderOutput(goalsProcessor, raw, 'raw')).toBe(raw)
  })
})
