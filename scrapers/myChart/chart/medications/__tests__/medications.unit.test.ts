import { describe, it, expect, mock } from 'bun:test'
import { getMedications, fetchMedicationsRaw, medicationsProcessor } from '../medications'
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

const LISINOPRIL = {
  id: 'RX-1',
  name: 'Lisinopril 10mg',
  patientFriendlyName: { text: 'Lisinopril', caption: 'for blood pressure', captionType: 'Indication' },
  sig: 'Take 1 tablet daily',
  sigTranslationFromOrder: 'Take one tablet every day',
  dateToDisplay: '01/01/2024',
  dateDisplayKey: 'Last filled',
  startDate: '06/15/2023',
  authorizingProvider: { name: 'Dr. Smith', id: 'EMP-1', hasPhotoOnBlob: false },
  orderingProvider: { name: 'Dr. Jones' },
  isPatientReported: false,
  classList: ['ACE inhibitor'],
  showRefillButton: true,
  organization: { organizationName: 'Springfield General', logoUrl: 'x.png' },
  refillDetails: {
    isRefillable: true,
    refillsRemaining: '2',
    hasRefillsRemaining: true,
    writtenDispenseQuantity: '90',
    daySupply: '90',
    refillButtonStatus: 3,
    lastDispense: { dispenseDate: '01/01/2024', costDetails: { formattedCopay: '$5.00', copay: 5 }, delivery: { formattedAddress: ['1 Main St'] } },
    owningPharmacy: {
      name: 'Kwik-E-Mart Pharmacy',
      phoneNumber: '555-0100',
      formattedAddress: ['123 Main St', 'Springfield, NT 49007'],
      isPreferred: true,
      supportedDeliveryMethods: [{ name: 'Pickup' }],
    },
  },
}

describe('getMedications', () => {
  it('throws when no token found', async () => {
    const req = mockRequest([{ body: '<html></html>' }])
    await expect(getMedications(req)).rejects.toBeInstanceOf(MissingVerificationTokenError)
  })

  it('flattens prescriptions with MyChart field names, lifting the organization onto the row', async () => {
    const req = mockRequest([
      TOKEN,
      {
        body: JSON.stringify({
          communityMembers: [
            {
              organization: { organizationName: 'Springfield General', logoUrl: 'x.png' },
              prescriptionList: { prescriptions: [LISINOPRIL], numRefillsDueSoon: 1, pickups: [] },
            },
          ],
          getPatientFirstName: 'Alice',
        }),
      },
    ])

    const result = await getMedications(req)
    expect(result.getPatientFirstName).toBe('Alice')
    expect(result.prescriptions).toHaveLength(1)

    const med = result.prescriptions[0]!
    expect(med.id).toBe('RX-1')
    expect(med.name).toBe('Lisinopril 10mg')
    expect(med.patientFriendlyName).toEqual({ text: 'Lisinopril', caption: 'for blood pressure', captionType: 'Indication' })
    expect(med.sig).toBe('Take 1 tablet daily')
    expect(med.sigTranslationFromOrder).toBe('Take one tablet every day')
    expect(med.dateDisplayKey).toBe('Last filled')
    expect(med.authorizingProvider).toEqual({ name: 'Dr. Smith' })
    expect(med.orderingProvider).toEqual({ name: 'Dr. Jones' })
    expect(med.classList).toEqual(['ACE inhibitor'])
    expect(med.organizationName).toBe('Springfield General')
    expect(med.refillDetails!.isRefillable).toBe(true)
    expect(med.refillDetails!.refillsRemaining).toBe('2')
    expect(med.refillDetails!.writtenDispenseQuantity).toBe('90')
    expect(med.refillDetails!.daySupply).toBe('90')
    expect(med.refillDetails!.lastDispense.dispenseDate).toBe('01/01/2024')
    expect(med.refillDetails!.lastDispense.costDetails).toEqual({ formattedCopay: '$5.00', copay: 5, isCopayPending: null })
    expect(med.refillDetails!.lastDispense.delivery.formattedAddress).toEqual(['1 Main St'])
    expect(med.refillDetails!.owningPharmacy).toEqual({
      name: 'Kwik-E-Mart Pharmacy',
      phoneNumber: '555-0100',
      formattedAddress: ['123 Main St', 'Springfield, NT 49007'],
      hours: [],
      isPreferred: true,
    })
    // UI flags and the organization blob never reach the standard object.
    expect(med).not.toHaveProperty('showRefillButton')
    expect(med).not.toHaveProperty('organization')
    expect(med.refillDetails).not.toHaveProperty('refillButtonStatus')
    expect(med.refillDetails!.owningPharmacy).not.toHaveProperty('supportedDeliveryMethods')
    // medicationKey is not a MyChart field and is never invented.
    expect(med).not.toHaveProperty('medicationKey')

    expect(result.prescriptionLists).toEqual([
      { organizationName: 'Springfield General', numRefillsDueSoon: 1, previousTakingValuesDate: null, pickups: [], deliveries: [], inProgressWorkRequests: [] },
    ])
  })

  it('emits every field, as null, for a sparse prescription — nothing is dropped for being empty', async () => {
    const req = mockRequest([
      TOKEN,
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

    const med = (await getMedications(req)).prescriptions[0]!
    expect(med.refillDetails).toBeNull()
    expect(med.isPatientReported).toBe(true)
    expect(med.isClinicReported).toBeNull()
    expect(med.sig).toBeNull()
    expect(med.organizationName).toBeNull()
    expect(med.patientFriendlyName).toEqual({ text: null, caption: null, captionType: null })
    expect(Object.keys(med)).toContain('criticalMedMessage')
  })

  it('aggregates medications across multiple community members', async () => {
    const req = mockRequest([
      TOKEN,
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
    expect(result.prescriptions).toHaveLength(3)
    expect(result.prescriptions.map(m => m.name)).toEqual(['Med A', 'Med B', 'Med C'])
    expect(result.prescriptionLists).toHaveLength(2)
  })

  it('records the two requests in the raw envelope', async () => {
    const req = mockRequest([TOKEN, { body: JSON.stringify({ communityMembers: [] }) }])
    const raw = await fetchMedicationsRaw(req)
    expect(raw.requests.map((r) => [r.method, r.path])).toEqual([
      ['GET', '/Clinical/Medications'],
      ['POST', '/api/medications/LoadMedicationsPage'],
    ])
    expect(raw.requests[1]!.requestBody).toEqual({})
    expect(raw.requests[1]!.body).toEqual({ communityMembers: [] })
  })

  it('renders concise with the summary fields and every other mode from the same envelope', async () => {
    const req = mockRequest([
      TOKEN,
      { body: JSON.stringify({ communityMembers: [{ prescriptionList: { prescriptions: [LISINOPRIL] } }] }) },
    ])
    const raw = await fetchMedicationsRaw(req)
    const concise = medicationsProcessor.concise(medicationsProcessor.standard(raw)) as { prescriptions: Record<string, unknown>[] }
    expect(concise.prescriptions[0]).toEqual({
      id: 'RX-1',
      name: 'Lisinopril 10mg',
      patientFriendlyName: 'Lisinopril',
      sig: 'Take 1 tablet daily',
      dateToDisplay: '01/01/2024',
      dateDisplayKey: 'Last filled',
      authorizingProvider: 'Dr. Smith',
      isPatientReported: false,
      isRefillable: true,
      refillsRemaining: '2',
      hasRefillsRemaining: true,
      owningPharmacy: 'Kwik-E-Mart Pharmacy',
    })
    expect(renderOutput(medicationsProcessor, raw, 'raw')).toEqual(raw.requests[1]!.body)
    expect(renderOutput(medicationsProcessor, raw, 'json')).toEqual(medicationsProcessor.standard(raw))
    expect(renderOutput(medicationsProcessor, raw, 'standard')).toContain('Kwik-E-Mart Pharmacy')
    expect(renderOutput(medicationsProcessor, raw, 'concise')).toContain('| RX-1 |')
  })
})
