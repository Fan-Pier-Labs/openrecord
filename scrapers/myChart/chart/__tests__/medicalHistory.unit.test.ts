import { describe, it, expect, mock } from 'bun:test'
import { getMedicalHistory, fetchMedicalHistoryRaw, medicalHistoryProcessor } from '../medicalHistory'
import { MyChartRequest } from '../../core/myChartRequest'
import { MissingVerificationTokenError } from '../../core/util'
import { renderOutput } from '../../processors/processor'

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

const FULL = {
  medicalHistory: {
    diagnoses: [{ diagnosisName: 'Hypertension', diagnosisDate: '2015' }, { diagnosisName: 'Obesity', diagnosisDate: '' }],
    medicalHistoryNotes: 'Long-standing.',
  },
  surgicalHistory: { surgeries: [{ surgeryName: 'Appendectomy', surgeryDate: '1985' }], surgicalHistoryNotes: '' },
  familyHistoryAndStatus: {
    familyMembers: [
      { relationshipToPatientName: 'Father', statusName: 'Alive', conditions: ['Heart disease', ' ', ''], nameOrAlias: 'Abe', sexName: 'Male', relativeAge: '86', familyMemberId: 'FM-1', removeFamilyMember: false },
      { relationshipToPatientName: 'Mother', statusName: 'Deceased', conditions: [] },
    ],
    familyHistoryNotes: 'n1',
    familyStatusNotes: 'n2',
  },
  socialHistory: {
    smokingHistory: { smokingTobaccoStatus: 'Never Smoker', smokingTobaccoTypes: [], tobaccoUse: 'Never', smokingTobaccoQuitDate: '', showSmokingTobaccoQuitDate: false },
    smokelessHistory: { smokelessTobaccoStatus: 'Never Used', smokelessTobaccoTypes: [], smokelessQuitDate: '' },
    alcoholHistory: { alcoholUse: 'Yes', alcoholAmount: '10', alcoholUnit: 'drinks/week' },
    socialHistoryNotes: 'Duff.',
    isProxy: false,
  },
  isShareEverywhere: false,
}

describe('getMedicalHistory', () => {
  it('throws when no token found', async () => {
    const req = mockRequest([{ body: '<html></html>' }])
    await expect(getMedicalHistory(req)).rejects.toBeInstanceOf(MissingVerificationTokenError)
  })

  it('keeps medical, surgical, family AND social history with MyChart names', async () => {
    const req = mockRequest([TOKEN, { body: JSON.stringify(FULL) }])
    const result = await getMedicalHistory(req)
    expect(result.medicalHistory).toEqual({
      diagnoses: [{ diagnosisName: 'Hypertension', diagnosisDate: '2015' }, { diagnosisName: 'Obesity', diagnosisDate: '' }],
      medicalHistoryNotes: 'Long-standing.',
    })
    expect(result.surgicalHistory.surgeries).toEqual([{ surgeryName: 'Appendectomy', surgeryDate: '1985' }])
    expect(result.familyHistoryAndStatus.familyMembers[0]).toEqual({
      relationshipToPatientName: 'Father',
      conditions: ['Heart disease', ' ', ''],
      statusName: 'Alive',
      nameOrAlias: 'Abe',
      sexName: 'Male',
      relativeAge: '86',
      relativeAgeEnd: null,
    })
    expect(result.familyHistoryAndStatus.familyMembers[0]).not.toHaveProperty('familyMemberId')
    expect(result.familyHistoryAndStatus.familyHistoryNotes).toBe('n1')
    expect(result.socialHistory.smokingHistory.smokingTobaccoStatus).toBe('Never Smoker')
    expect(result.socialHistory.alcoholHistory).toEqual({ alcoholUse: 'Yes', alcoholAmount: '10', alcoholUnit: 'drinks/week' })
    expect(result.socialHistory).not.toHaveProperty('isProxy')
  })

  it('emits every section with nulls when the response is sparse', async () => {
    const req = mockRequest([TOKEN, { body: JSON.stringify({}) }])
    const result = await getMedicalHistory(req)
    expect(result.medicalHistory).toEqual({ diagnoses: [], medicalHistoryNotes: null })
    expect(result.surgicalHistory).toEqual({ surgeries: [], surgicalHistoryNotes: null })
    expect(result.familyHistoryAndStatus.familyMembers).toEqual([])
    expect(result.socialHistory.smokingHistory).toEqual({ smokingTobaccoStatus: null, tobaccoUse: null, smokingTobaccoTypes: [], smokingTobaccoQuitDate: null })
  })

  it('concise carries the headline facts and renders', async () => {
    const req = mockRequest([TOKEN, { body: JSON.stringify(FULL) }])
    const raw = await fetchMedicalHistoryRaw(req)
    expect(raw.requests.map((r) => r.path)).toEqual(['/app/histories', '/api/histories/LoadHistoriesViewModel'])
    const concise = medicalHistoryProcessor.concise(medicalHistoryProcessor.standard(raw)) as Record<string, unknown>
    expect(concise).toEqual({
      diagnoses: FULL.medicalHistory.diagnoses,
      surgeries: FULL.surgicalHistory.surgeries,
      familyMembers: [
        { relationshipToPatientName: 'Father', statusName: 'Alive', conditions: ['Heart disease', ' ', ''] },
        { relationshipToPatientName: 'Mother', statusName: 'Deceased', conditions: [] },
      ],
      smokingTobaccoStatus: 'Never Smoker',
      tobaccoUse: 'Never',
      alcoholUse: 'Yes',
    })
    expect(renderOutput(medicalHistoryProcessor, raw, 'standard')).toContain('drinks/week')
    expect(renderOutput(medicalHistoryProcessor, raw, 'concise')).toContain('- **alcoholUse**: Yes')
  })
})
