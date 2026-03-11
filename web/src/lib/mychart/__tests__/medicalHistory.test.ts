import { describe, it, expect, mock } from 'bun:test'
import { getMedicalHistory } from '../medicalHistory'
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

describe('getMedicalHistory', () => {
  it('returns empty result when no token found', async () => {
    const req = mockRequest([{ body: '<html></html>' }])
    const result = await getMedicalHistory(req)
    expect(result).toEqual({
      medicalHistory: { diagnoses: [], notes: '' },
      surgicalHistory: { surgeries: [], notes: '' },
      familyHistory: { familyMembers: [] },
    })
  })

  it('parses full medical history', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      {
        body: JSON.stringify({
          medicalHistory: {
            diagnoses: [
              { diagnosisName: 'Hypertension', diagnosisDate: '2019' },
              { diagnosisName: 'Asthma', diagnosisDate: '2015' },
            ],
            medicalHistoryNotes: 'Patient has controlled conditions.',
          },
          surgicalHistory: {
            surgeries: [{ surgeryName: 'Appendectomy', surgeryDate: '2010' }],
            surgicalHistoryNotes: 'No complications.',
          },
          familyHistoryAndStatus: {
            familyMembers: [
              {
                relationshipToPatientName: 'Mother',
                statusName: 'Living',
                conditions: ['Diabetes', 'Heart Disease'],
              },
              {
                relationshipToPatientName: 'Father',
                statusName: 'Deceased',
                conditions: ['Cancer'],
              },
            ],
          },
        }),
      },
    ])

    const result = await getMedicalHistory(req)
    expect(result.medicalHistory.diagnoses).toHaveLength(2)
    expect(result.medicalHistory.diagnoses[0]).toEqual({ diagnosisName: 'Hypertension', diagnosisDate: '2019' })
    expect(result.medicalHistory.notes).toBe('Patient has controlled conditions.')
    expect(result.surgicalHistory.surgeries).toHaveLength(1)
    expect(result.surgicalHistory.notes).toBe('No complications.')
    expect(result.familyHistory.familyMembers).toHaveLength(2)
    expect(result.familyHistory.familyMembers[0].conditions).toEqual(['Diabetes', 'Heart Disease'])
  })

  it('filters empty/whitespace conditions', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      {
        body: JSON.stringify({
          familyHistoryAndStatus: {
            familyMembers: [{ relationshipToPatientName: 'Sibling', statusName: '', conditions: ['Asthma', '', '  ', 'Diabetes'] }],
          },
        }),
      },
    ])

    const result = await getMedicalHistory(req)
    expect(result.familyHistory.familyMembers[0].conditions).toEqual(['Asthma', 'Diabetes'])
  })

  it('handles missing sections gracefully', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      { body: JSON.stringify({}) },
    ])

    const result = await getMedicalHistory(req)
    expect(result.medicalHistory.diagnoses).toEqual([])
    expect(result.surgicalHistory.surgeries).toEqual([])
    expect(result.familyHistory.familyMembers).toEqual([])
  })
})
