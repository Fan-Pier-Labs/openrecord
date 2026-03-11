import { describe, it, expect, mock } from 'bun:test'
import { getMedications } from '../medications'
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

describe('getMedications', () => {
  it('returns empty when no token found', async () => {
    const req = mockRequest([{ body: '<html></html>' }])
    const result = await getMedications(req)
    expect(result).toEqual({ medications: [], patientFirstName: '' })
  })

  it('parses medications from communityMembers', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      {
        body: JSON.stringify({
          communityMembers: [
            {
              prescriptionList: {
                prescriptions: [
                  {
                    name: 'Lisinopril 10mg',
                    patientFriendlyName: { text: 'Lisinopril' },
                    sig: 'Take 1 tablet daily',
                    dateToDisplay: '01/01/2024',
                    startDate: '06/15/2023',
                    authorizingProvider: { name: 'Dr. Smith' },
                    orderingProvider: { name: 'Dr. Jones' },
                    isPatientReported: false,
                    refillDetails: {
                      isRefillable: true,
                      writtenDispenseQuantity: '90',
                      daySupply: '90',
                      owningPharmacy: {
                        name: 'CVS Pharmacy',
                        phoneNumber: '617-555-1234',
                        formattedAddress: ['123 Main St', 'Boston, MA 02101'],
                      },
                    },
                  },
                ],
              },
            },
          ],
          getPatientFirstName: 'Alice',
        }),
      },
    ])

    const result = await getMedications(req)
    expect(result.patientFirstName).toBe('Alice')
    expect(result.medications).toHaveLength(1)

    const med = result.medications[0]
    expect(med.name).toBe('Lisinopril 10mg')
    expect(med.commonName).toBe('Lisinopril')
    expect(med.sig).toBe('Take 1 tablet daily')
    expect(med.authorizingProviderName).toBe('Dr. Smith')
    expect(med.isRefillable).toBe(true)
    expect(med.pharmacy).toEqual({
      name: 'CVS Pharmacy',
      phoneNumber: '617-555-1234',
      formattedAddress: ['123 Main St', 'Boston, MA 02101'],
    })
    expect(med.refillDetails).toEqual({ writtenDispenseQuantity: '90', daySupply: '90' })
  })

  it('handles medication without pharmacy or refill details', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      {
        body: JSON.stringify({
          communityMembers: [{
            prescriptionList: {
              prescriptions: [{ name: 'Aspirin', isPatientReported: true }],
            },
          }],
        }),
      },
    ])

    const result = await getMedications(req)
    expect(result.medications[0].pharmacy).toBeNull()
    expect(result.medications[0].refillDetails).toBeNull()
    expect(result.medications[0].isPatientReported).toBe(true)
  })

  it('aggregates medications across multiple community members', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      {
        body: JSON.stringify({
          communityMembers: [
            { prescriptionList: { prescriptions: [{ name: 'Med A' }] } },
            { prescriptionList: { prescriptions: [{ name: 'Med B' }, { name: 'Med C' }] } },
          ],
        }),
      },
    ])

    const result = await getMedications(req)
    expect(result.medications).toHaveLength(3)
    expect(result.medications.map(m => m.name)).toEqual(['Med A', 'Med B', 'Med C'])
  })
})
