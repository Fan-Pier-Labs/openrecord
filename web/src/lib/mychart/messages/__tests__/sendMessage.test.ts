import { describe, it, expect, mock } from 'bun:test'
import { sendNewMessage, getVerificationToken, getMessageTopics, getMessageRecipients } from '../sendMessage'
import { MyChartRequest } from '../../myChartRequest'

const TOKEN_HTML = '<input name="__RequestVerificationToken" value="csrf_tok" />'

function mockRequest(responses: Array<{ body: string; status?: number }>) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  let i = 0
  req.fetchWithCookieJar = mock(async () => {
    const r = responses[i++]
    return new Response(r.body, { status: r.status ?? 200 })
  }) as typeof req.fetchWithCookieJar
  return req
}

function mockRequestWithCapture(responses: Array<{ body: string; status?: number }>) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  const calls: Array<{ url: string; init?: RequestInit }> = []
  let i = 0
  req.fetchWithCookieJar = mock(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: url.toString(), init })
    const r = responses[i++]
    return new Response(r.body, { status: r.status ?? 200 })
  }) as typeof req.fetchWithCookieJar
  return { req, calls }
}

describe('getVerificationToken', () => {
  it('extracts token from HTML', async () => {
    const req = mockRequest([{ body: TOKEN_HTML }])
    const token = await getVerificationToken(req)
    expect(token).toBe('csrf_tok')
  })

  it('returns undefined when no token in HTML', async () => {
    const req = mockRequest([{ body: '<html></html>' }])
    const token = await getVerificationToken(req)
    expect(token).toBeUndefined()
  })
})

describe('getMessageTopics', () => {
  it('returns topic list from API', async () => {
    const { req, calls } = mockRequestWithCapture([
      {
        body: JSON.stringify({
          topicList: [
            { displayName: 'COVID-19 Related Inquiry', value: '15' },
            { displayName: 'Help with Booking an Appointment', value: '12' },
            { displayName: 'Other', value: '8' },
          ],
        }),
      },
    ])

    const topics = await getMessageTopics(req, 'tok123')
    expect(topics).toHaveLength(3)
    expect(topics[0].displayName).toBe('COVID-19 Related Inquiry')
    expect(topics[1].value).toBe('12')

    // Verify the API call
    const headers = calls[0].init!.headers as Record<string, string>
    expect(headers['__RequestVerificationToken']).toBe('tok123')
    const body = JSON.parse(calls[0].init!.body as string)
    expect(body.organizationId).toBe('')
  })

  it('returns empty array when no topics', async () => {
    const req = mockRequest([{ body: JSON.stringify({ topicList: [] }) }])
    const topics = await getMessageTopics(req, 'tok')
    expect(topics).toHaveLength(0)
  })

  it('returns empty array on null response', async () => {
    const req = mockRequest([{ body: 'null' }])
    const topics = await getMessageTopics(req, 'tok')
    expect(topics).toHaveLength(0)
  })
})

describe('getMessageRecipients', () => {
  it('returns recipient list from API', async () => {
    const req = mockRequest([
      {
        body: JSON.stringify([
          {
            recipientType: 1,
            displayName: 'Claudia L. Ma, MD',
            specialty: '',
            userId: 'WP-user1',
            departmentId: '',
            poolId: '',
            providerId: 'WP-prov1',
            organizationId: '',
            pcpTypeDisplayName: 'General',
          },
          {
            recipientType: 99,
            displayName: 'Qura Tul Ain Rashid, MD',
            specialty: 'Allergy',
            userId: 'WP-user2',
            departmentId: 'WP-dept2',
            poolId: '',
            providerId: 'WP-prov2',
            organizationId: '',
          },
        ]),
      },
    ])

    const recipients = await getMessageRecipients(req, 'tok')
    expect(recipients).toHaveLength(2)
    expect(recipients[0].displayName).toBe('Claudia L. Ma, MD')
    expect(recipients[0].recipientType).toBe(1)
    expect(recipients[1].specialty).toBe('Allergy')
  })

  it('returns empty array when no recipients', async () => {
    const req = mockRequest([{ body: JSON.stringify([]) }])
    const recipients = await getMessageRecipients(req, 'tok')
    expect(recipients).toHaveLength(0)
  })
})

describe('sendNewMessage', () => {
  const recipient = {
    recipientType: 1,
    displayName: 'Dr. Test',
    specialty: '',
    userId: 'WP-user1',
    departmentId: 'WP-dept1',
    poolId: 'WP-pool1',
    providerId: 'WP-prov1',
    organizationId: '',
  }

  const topic = { displayName: 'Help with Booking', value: '12' }

  it('returns error when no verification token', async () => {
    const req = mockRequest([{ body: '<html></html>' }])
    const result = await sendNewMessage(req, {
      recipient,
      topic,
      subject: 'Test',
      messageBody: 'Hello',
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('verification token')
  })

  it('returns error when no viewer wprId', async () => {
    const req = mockRequest([
      { body: TOKEN_HTML },
      { body: JSON.stringify({ viewers: [] }) },
    ])
    const result = await sendNewMessage(req, {
      recipient,
      topic,
      subject: 'Test',
      messageBody: 'Hello',
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('wprId')
  })

  it('returns error when no compose ID', async () => {
    const req = mockRequest([
      { body: TOKEN_HTML },
      { body: JSON.stringify({ viewers: [{ wprId: 'WP-wpr1', isSelf: true }] }) },
      { body: 'null' },
    ])
    const result = await sendNewMessage(req, {
      recipient,
      topic,
      subject: 'Test',
      messageBody: 'Hello',
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('compose ID')
  })

  it('sends message successfully and returns conversation ID', async () => {
    const { req, calls } = mockRequestWithCapture([
      { body: TOKEN_HTML },                                                         // getVerificationToken
      { body: JSON.stringify({ viewers: [{ wprId: 'WP-wpr1', isSelf: true }] }) }, // getViewerWprId
      { body: JSON.stringify('WP-compose123') },                                    // getComposeId
      { body: JSON.stringify('WP-convo456') },                                      // SendMedicalAdviceRequest
      { body: '""' },                                                               // RemoveComposeId
    ])

    const result = await sendNewMessage(req, {
      recipient,
      topic,
      subject: 'booking appointment',
      messageBody: 'i have a questiion when is the availability',
    })

    expect(result.success).toBe(true)
    expect(result.conversationId).toBe('WP-convo456')

    // Verify the send request (4th call, index 3)
    const sendCall = calls[3]
    expect(sendCall.url).toContain('/api/medicaladvicerequests/SendMedicalAdviceRequest')
    const sendBody = JSON.parse(sendCall.init!.body as string)
    expect(sendBody.recipient.displayName).toBe('Dr. Test')
    expect(sendBody.recipient.userId).toBe('WP-user1')
    expect(sendBody.topic.title).toBe('Help with Booking')
    expect(sendBody.topic.value).toBe('12')
    expect(sendBody.messageBody).toEqual(['i have a questiion when is the availability'])
    expect(sendBody.messageSubject).toBe('booking appointment')
    expect(sendBody.viewers).toEqual([{ wprId: 'WP-wpr1' }])
    expect(sendBody.composeId).toBe('WP-compose123')
    expect(sendBody.conversationId).toBe('')
    expect(sendBody.documentIds).toEqual([])
    expect(sendBody.includeOtherViewers).toBe(false)

    // Verify cleanup (5th call, index 4)
    const cleanupCall = calls[4]
    expect(cleanupCall.url).toContain('/api/conversations/RemoveComposeId')
    const cleanupBody = JSON.parse(cleanupCall.init!.body as string)
    expect(cleanupBody.composeId).toBe('WP-compose123')
  })

  it('returns error on non-200 send response', async () => {
    const req = mockRequest([
      { body: TOKEN_HTML },
      { body: JSON.stringify({ viewers: [{ wprId: 'WP-wpr1', isSelf: true }] }) },
      { body: JSON.stringify('WP-compose123') },
      { body: JSON.stringify({ error: 'server error' }), status: 500 },
      { body: '""' },
    ])

    const result = await sendNewMessage(req, {
      recipient,
      topic,
      subject: 'Test',
      messageBody: 'Hello',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('500')
  })

  it('passes custom organizationId through all API calls', async () => {
    const { req, calls } = mockRequestWithCapture([
      { body: TOKEN_HTML },
      { body: JSON.stringify({ viewers: [{ wprId: 'WP-wpr1', isSelf: true }] }) },
      { body: JSON.stringify('WP-compose123') },
      { body: JSON.stringify('WP-convo789') },
      { body: '""' },
    ])

    await sendNewMessage(req, {
      recipient,
      topic,
      subject: 'Test',
      messageBody: 'Hello',
      organizationId: 'WP-org1',
    })

    // GetViewers should include organizationId
    const viewersBody = JSON.parse(calls[1].init!.body as string)
    expect(viewersBody.organizationId).toBe('WP-org1')

    // Send should include organizationId
    const sendBody = JSON.parse(calls[3].init!.body as string)
    expect(sendBody.organizationId).toBe('WP-org1')
  })
})
