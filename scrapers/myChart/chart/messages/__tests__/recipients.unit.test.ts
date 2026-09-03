import { describe, it, expect, mock } from 'bun:test'
import {
  fetchMessageRecipientsRaw,
  fetchMessageTopicsRaw,
  listMessageRecipients,
  listMessageTopics,
  messageRecipientsProcessor,
  messageTopicsProcessor,
  recipientList,
} from '../recipients'
import { MyChartRequest } from '../../../core/myChartRequest'
import { MissingVerificationTokenError } from '../../../core/util'
import type { RawResponse } from '../../../core/rawResponse'

function mockRequest(responses: Array<{ body: string }>) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  const calls: Array<{ url: string; init?: RequestInit | undefined }> = []
  let i = 0
  req.transport = mock(async (url: string, init?: RequestInit) => {
    calls.push({ url: url.toString(), init })
    const r = responses[i++]
    return new Response(r!.body, { status: 200, headers: { 'content-type': 'application/json' } })
  })
  return { req, calls }
}

const TOKEN_PAGE = '<input name="__RequestVerificationToken" value="tok" />'

/** The captured element: a bare array with these fields, `organizationId` empty. */
const HIBBERT = {
  recipientType: 1,
  pcpTypeDisplayName: 'Primary Care Provider',
  displayName: 'Julius Hibbert, MD',
  specialty: 'Internal Medicine',
  userId: 'U1',
  departmentId: 'D1',
  poolId: '',
  oocContext: 0,
  photoUrl: '/photo.jpg',
  providerId: 'P1',
  organizationId: '',
}

const HIBBERT_STANDARD = {
  displayName: 'Julius Hibbert, MD',
  specialty: 'Internal Medicine',
  pcpTypeDisplayName: 'Primary Care Provider',
  recipientType: 1,
  oocContext: 0,
  userId: 'U1',
  departmentId: 'D1',
  poolId: '',
  providerId: 'P1',
}

function single(path: string, body: unknown): RawResponse {
  return { requests: [{ path, method: 'POST', requestBody: { organizationId: '' }, status: 200, contentType: 'application/json', body }] }
}

describe('fetchMessageRecipientsRaw / fetchMessageTopicsRaw', () => {
  it('throw rather than returning nobody / nothing when the page has no token', async () => {
    await expect(fetchMessageRecipientsRaw(mockRequest([{ body: '<html></html>' }]).req)).rejects.toBeInstanceOf(MissingVerificationTokenError)
    await expect(fetchMessageTopicsRaw(mockRequest([{ body: '<html></html>' }]).req)).rejects.toBeInstanceOf(MissingVerificationTokenError)
  })

  it('records the recipients POST with the communication-center token', async () => {
    const { req, calls } = mockRequest([{ body: TOKEN_PAGE }, { body: JSON.stringify([HIBBERT]) }])
    const raw = await fetchMessageRecipientsRaw(req, 'ORG-1')

    expect(calls[0]!.url).toContain('/app/communication-center')
    expect(calls[1]!.url).toContain('/api/medicaladvicerequests/GetMedicalAdviceRequestRecipients')
    expect((calls[1]!.init!.headers as Record<string, string>)['__RequestVerificationToken']).toBe('tok')

    expect(raw.requests).toHaveLength(1)
    expect(raw.requests[0]).toMatchObject({
      path: '/api/medicaladvicerequests/GetMedicalAdviceRequestRecipients',
      method: 'POST',
      requestBody: { organizationId: 'ORG-1' },
      body: [HIBBERT],
    })
  })

  it('records the topics POST', async () => {
    const { req } = mockRequest([{ body: TOKEN_PAGE }, { body: JSON.stringify({ topicList: [{ displayName: 'Refill', value: '2' }], organizationId: '' }) }])
    const raw = await fetchMessageTopicsRaw(req)
    expect(raw.requests).toHaveLength(1)
    expect(raw.requests[0]).toMatchObject({ path: '/api/medicaladvicerequests/GetSubtopics', requestBody: { organizationId: '' } })
  })
})

describe('messageRecipientsProcessor', () => {
  it('keeps the send ids and drops the photo and the always-empty organizationId', () => {
    const standard = messageRecipientsProcessor.standard(single('/api/medicaladvicerequests/GetMedicalAdviceRequestRecipients', [HIBBERT]))
    expect(standard).toEqual({ recipients: [HIBBERT_STANDARD] })
  })

  it('reads the list from every wrapper key an instance has used', () => {
    for (const key of ['recipients', 'recipientList', 'Providers', 'providers', 'ProviderList', 'providerList']) {
      expect(recipientList({ [key]: [HIBBERT] })).toEqual([HIBBERT])
    }
    expect(recipientList([HIBBERT])).toEqual([HIBBERT])
    expect(recipientList({ something: [HIBBERT] })).toEqual([])
    expect(recipientList(null)).toEqual([])
  })

  it('emits every field as null on a recipient with nothing in it', () => {
    const standard = messageRecipientsProcessor.standard(single('/GetMedicalAdviceRequestRecipients', { recipients: [{}] }))
    expect(standard.recipients[0]).toEqual({
      displayName: null,
      specialty: null,
      pcpTypeDisplayName: null,
      recipientType: null,
      oocContext: null,
      userId: null,
      departmentId: null,
      poolId: null,
      providerId: null,
    })
  })

  it('projects concise to name, specialty and PCP designation', () => {
    const standard = messageRecipientsProcessor.standard(single('/GetMedicalAdviceRequestRecipients', [HIBBERT]))
    expect(messageRecipientsProcessor.concise(standard)).toEqual({
      recipients: [{ displayName: 'Julius Hibbert, MD', specialty: 'Internal Medicine', pcpTypeDisplayName: 'Primary Care Provider' }],
    })
  })
})

describe('messageTopicsProcessor', () => {
  it('keeps the topic label and code and nothing else', () => {
    const standard = messageTopicsProcessor.standard(single('/GetSubtopics', { topicList: [{ displayName: 'Refill', value: '2', extra: 1 }], organizationId: '' }))
    expect(standard).toEqual({ topicList: [{ displayName: 'Refill', value: '2' }] })
    expect(messageTopicsProcessor.concise(standard)).toEqual(standard)
  })

  it('emits an empty list for a body with no topics', () => {
    expect(messageTopicsProcessor.standard(single('/GetSubtopics', {}))).toEqual({ topicList: [] })
    expect(messageTopicsProcessor.standard(single('/GetSubtopics', { topicList: [{}] }))).toEqual({ topicList: [{ displayName: null, value: null }] })
  })
})

describe('listMessageRecipients / listMessageTopics', () => {
  it('return the standard objects', async () => {
    const recipients = mockRequest([{ body: TOKEN_PAGE }, { body: JSON.stringify([HIBBERT]) }])
    expect(await listMessageRecipients(recipients.req)).toEqual({ recipients: [HIBBERT_STANDARD] })

    const topics = mockRequest([{ body: TOKEN_PAGE }, { body: JSON.stringify({ topicList: [{ displayName: 'Refill', value: '2' }] }) }])
    expect(await listMessageTopics(topics.req)).toEqual({ topicList: [{ displayName: 'Refill', value: '2' }] })
  })
})
