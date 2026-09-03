import { describe, it, expect, mock } from 'bun:test'
import {
  getEmergencyContacts,
  fetchEmergencyContactsRaw,
  emergencyContactsProcessor,
  addEmergencyContact,
  updateEmergencyContact,
  removeEmergencyContact,
} from '../emergencyContacts'
import { MyChartRequest } from '../../core/myChartRequest'
import { MissingVerificationTokenError } from '../../core/util'
import type { RawResponse } from '../../core/rawResponse'

function mockRequest(responses: Array<{ body: string; status?: number }>) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  let i = 0
  req.transport = mock(async () => {
    const r = responses[i++]
    return new Response(r!.body, { status: r!.status ?? 200, headers: { 'content-type': 'application/json' } })
  })
  return req
}

const TOKEN_HTML = '<input name="__RequestVerificationToken" value="t" />'

/** The captured `contacts` element: the fields the processor reads plus the edit-form state it drops. */
const JANE = {
  id: 'EC-1',
  formattedName: 'Jane Doe',
  relationToPatient: { name: 'Spouse', labelText: 'Spouse', isInactive: false },
  isPrimaryContact: true,
  isLinkedToOtherPatient: false,
  isHCA: false,
  isAddressLinkedToPatient: false,
  contactInformation: {
    address: { street: '1 Main St', city: 'Springfield', zip: '00000', formattedValues: ['1 Main St', 'Springfield 00000'], allowArbitraryInput: false },
    emailAddress: 'jane@example.com',
    phoneNumbers: [{ phoneNumber: '555-1234', type: 'Home' }, { phoneNumber: '555-9999', type: 'Mobile' }],
  },
  savedSuccessfully: false,
  isPending: false,
  isVRK: false,
}

const JANE_STANDARD = {
  id: 'EC-1',
  formattedName: 'Jane Doe',
  relationToPatient: { name: 'Spouse' },
  contactInformation: {
    phoneNumbers: [{ phoneNumber: '555-1234', type: 'Home' }, { phoneNumber: '555-9999', type: 'Mobile' }],
    emailAddress: 'jane@example.com',
    address: { formattedValues: ['1 Main St', 'Springfield 00000'] },
  },
  isPrimaryContact: true,
  isEmergencyContact: null,
}

const BODY = { isViewOnly: false, hideEmergencyContacts: false, contacts: [JANE], relationToPatientChoices: [], requiredFields: [], vrkFields: [], hasEndOfLifePageMnemonic: false }

function envelope(body: unknown): RawResponse {
  return { requests: [{ path: '/api/personalInformation/GetRelationships', method: 'POST', requestBody: {}, status: 200, contentType: 'application/json', body }] }
}

describe('fetchEmergencyContactsRaw', () => {
  it('throws rather than returning no contacts when the page has no token', async () => {
    await expect(fetchEmergencyContactsRaw(mockRequest([{ body: '<html></html>' }]))).rejects.toBeInstanceOf(MissingVerificationTokenError)
  })

  it('records the page and the GetRelationships POST', async () => {
    const raw = await fetchEmergencyContactsRaw(mockRequest([{ body: TOKEN_HTML }, { body: JSON.stringify(BODY) }]))
    expect(raw.requests.map((r) => `${r.method} ${r.path}`)).toEqual(['GET /app/personal-information', 'POST /api/personalInformation/GetRelationships'])
    expect(raw.requests[1]!.body).toEqual(BODY)
  })
})

describe('emergencyContactsProcessor', () => {
  it('keeps the handle, name, relationship and contact details under MyChart names', () => {
    const standard = emergencyContactsProcessor.standard(envelope(BODY))
    expect(standard).toEqual({ hideEmergencyContacts: false, contacts: [JANE_STANDARD] })
    expect(standard.contacts[0]!.relationToPatient).not.toHaveProperty('labelText')
    expect(standard.contacts[0]!.contactInformation.address).not.toHaveProperty('street')
  })

  it('keeps isEmergencyContact where an instance sends it', () => {
    const standard = emergencyContactsProcessor.standard(envelope({ contacts: [{ ...JANE, isEmergencyContact: true }] }))
    expect(standard.contacts[0]!.isEmergencyContact).toBe(true)
  })

  it('emits every field as null on a contact with nothing in it', () => {
    const standard = emergencyContactsProcessor.standard(envelope({ contacts: [{}] }))
    expect(standard.contacts[0]).toEqual({
      id: null,
      formattedName: null,
      relationToPatient: { name: null },
      contactInformation: { phoneNumbers: [], emailAddress: null, address: { formattedValues: [] } },
      isPrimaryContact: null,
      isEmergencyContact: null,
    })
    expect(standard.hideEmergencyContacts).toBeNull()
  })

  it('reports an empty or missing list as empty', () => {
    expect(emergencyContactsProcessor.standard(envelope({ contacts: [] })).contacts).toEqual([])
    expect(emergencyContactsProcessor.standard({ requests: [] }).contacts).toEqual([])
  })

  it('projects concise to the handle, who, how related and one phone number', () => {
    expect(emergencyContactsProcessor.concise(emergencyContactsProcessor.standard(envelope(BODY)))).toEqual({
      contacts: [{
        id: 'EC-1',
        formattedName: 'Jane Doe',
        relationToPatient: { name: 'Spouse' },
        contactInformation: { phoneNumbers: [{ phoneNumber: '555-1234', type: 'Home' }] },
      }],
    })
  })
})

describe('getEmergencyContacts', () => {
  it('returns the standard object', async () => {
    const result = await getEmergencyContacts(mockRequest([{ body: TOKEN_HTML }, { body: JSON.stringify(BODY) }]))
    expect(result.contacts[0]!.formattedName).toBe('Jane Doe')
  })
})

describe('addEmergencyContact', () => {
  it('returns error when no token found', async () => {
    const req = mockRequest([{ body: '<html></html>' }])
    const result = await addEmergencyContact(req, { name: 'Test', relationshipType: 'Friend', phoneNumber: '555-0000' })
    expect(result).toEqual({ success: false, error: 'Could not get verification token' })
  })

  it('returns success on 200 response', async () => {
    const req = mockRequest([
      { body: TOKEN_HTML },
      { body: JSON.stringify({ success: true }), status: 200 },
    ])
    const result = await addEmergencyContact(req, { name: 'John', relationshipType: 'Friend', phoneNumber: '555-1111' })
    expect(result).toEqual({ success: true })
  })

  it('returns error on non-200 response', async () => {
    const req = mockRequest([
      { body: TOKEN_HTML },
      { body: 'Server error', status: 500 },
    ])
    const result = await addEmergencyContact(req, { name: 'John', relationshipType: 'Friend', phoneNumber: '555-1111' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('500')
  })

  it('sends correct payload', async () => {
    const req = mockRequest([
      { body: TOKEN_HTML },
      { body: '{}', status: 200 },
    ])
    await addEmergencyContact(req, { name: 'Lisa', relationshipType: 'Child', phoneNumber: '555-2222' })

    const fetchMock = req.transport as ReturnType<typeof mock>
    const secondCall = fetchMock.mock.calls[1]
    const body = JSON.parse(secondCall![1]?.body as string)
    expect(body).toEqual({
      name: 'Lisa',
      relationshipType: 'Child',
      phoneNumber: '555-2222',
      isEmergencyContact: true,
    })
  })
})

describe('updateEmergencyContact', () => {
  it('returns error when no token found', async () => {
    const req = mockRequest([{ body: '<html></html>' }])
    const result = await updateEmergencyContact(req, { id: 'EC-1', name: 'Updated' })
    expect(result).toEqual({ success: false, error: 'Could not get verification token' })
  })

  it('returns success on 200 response', async () => {
    const req = mockRequest([
      { body: TOKEN_HTML },
      { body: '{}', status: 200 },
    ])
    const result = await updateEmergencyContact(req, { id: 'EC-1', phoneNumber: '555-9999' })
    expect(result).toEqual({ success: true })
  })

  it('sends only provided fields', async () => {
    const req = mockRequest([
      { body: TOKEN_HTML },
      { body: '{}', status: 200 },
    ])
    await updateEmergencyContact(req, { id: 'EC-1', phoneNumber: '555-9999' })

    const fetchMock = req.transport as ReturnType<typeof mock>
    const secondCall = fetchMock.mock.calls[1]
    const body = JSON.parse(secondCall![1]?.body as string)
    expect(body).toEqual({
      id: 'EC-1',
      phoneNumber: '555-9999',
      isEmergencyContact: true,
    })
    expect(body.name).toBeUndefined()
    expect(body.relationshipType).toBeUndefined()
  })
})

describe('removeEmergencyContact', () => {
  it('returns error when no token found', async () => {
    const req = mockRequest([{ body: '<html></html>' }])
    const result = await removeEmergencyContact(req, 'EC-1')
    expect(result).toEqual({ success: false, error: 'Could not get verification token' })
  })

  it('returns success on 200 response', async () => {
    const req = mockRequest([
      { body: TOKEN_HTML },
      { body: '{}', status: 200 },
    ])
    const result = await removeEmergencyContact(req, 'EC-1')
    expect(result).toEqual({ success: true })
  })

  it('sends correct payload', async () => {
    const req = mockRequest([
      { body: TOKEN_HTML },
      { body: '{}', status: 200 },
    ])
    await removeEmergencyContact(req, 'EC-42')

    const fetchMock = req.transport as ReturnType<typeof mock>
    const secondCall = fetchMock.mock.calls[1]
    const body = JSON.parse(secondCall![1]?.body as string)
    expect(body).toEqual({ id: 'EC-42' })
  })

  it('returns error on non-200 response', async () => {
    const req = mockRequest([
      { body: TOKEN_HTML },
      { body: 'Not found', status: 404 },
    ])
    const result = await removeEmergencyContact(req, 'EC-999')
    expect(result.success).toBe(false)
    expect(result.error).toContain('404')
  })
})
