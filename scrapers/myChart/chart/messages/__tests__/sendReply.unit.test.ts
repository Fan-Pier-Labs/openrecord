import { describe, it, expect, mock } from 'bun:test'
import { sendReply } from '../sendReply'
import { MyChartRequest } from '../../../core/myChartRequest'

const TOKEN_HTML = '<input name="__RequestVerificationToken" value="csrf_tok" />'
const OPEN_THREAD = JSON.stringify({ hthId: 'WP-convo1', replyFlags: { canReply: true, cannotReplyReason: 0 } })

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

function mockRequestWithCapture(responses: Array<{ body: string; status?: number }>) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  const calls: Array<{ url: string; init?: RequestInit | undefined }> = []
  let i = 0
  req.transport = mock(async (url: string, init?: RequestInit) => {
    calls.push({ url: url.toString(), init })
    const r = responses[i++]
    return new Response(r!.body, { status: r!.status ?? 200 })
  })
  return { req, calls }
}

describe('sendReply', () => {
  it('returns error when no verification token', async () => {
    const req = mockRequest([{ body: '<html></html>' }])
    const result = await sendReply(req, {
      conversationId: 'WP-convo1',
      messageBody: 'Hello',
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('verification token')
  })

  it('returns error when no viewer wprId', async () => {
    const req = mockRequest([
      { body: TOKEN_HTML },
      { body: OPEN_THREAD },
      { body: JSON.stringify({ viewers: [] }) },
    ])
    const result = await sendReply(req, {
      conversationId: 'WP-convo1',
      messageBody: 'Hello',
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('wprId')
  })

  it('returns error when no compose ID', async () => {
    const req = mockRequest([
      { body: TOKEN_HTML },
      { body: OPEN_THREAD },
      { body: JSON.stringify({ viewers: [{ wprId: 'WP-wpr1', isSelf: true }] }) },
      { body: 'null' },
    ])
    const result = await sendReply(req, {
      conversationId: 'WP-convo1',
      messageBody: 'Hello',
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('compose ID')
  })

  it('reports a reply MyChart filed nothing for as a failure', async () => {
    const req = mockRequest([
      { body: TOKEN_HTML },
      { body: OPEN_THREAD },
      { body: JSON.stringify({ viewers: [{ wprId: 'WP-wpr1', isSelf: true }] }) },
      { body: JSON.stringify('WP-compose123') },
      { body: '""' },
      { body: '""' },
    ])
    const result = await sendReply(req, { conversationId: 'WP-convo1', messageBody: 'hi' })
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/filed nothing/)
  })

  // MyChart answers SendReply to a closed thread with 200 and an empty id, and
  // files nothing, so the refusal has to come before anything is prepared.
  it('refuses a thread that does not take replies before composing or sending', async () => {
    const { req, calls } = mockRequestWithCapture([
      { body: TOKEN_HTML },
      { body: JSON.stringify({ hthId: 'WP-convo1', replyFlags: { canReply: false, cannotReplyReason: 3 } }) },
    ])
    const result = await sendReply(req, { conversationId: 'WP-convo1', messageBody: 'hi' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('does not accept replies')
    expect(calls).toHaveLength(2)
    expect(calls[1]!.url).toContain('/api/conversations/GetConversationDetails')
    expect(JSON.parse(calls[1]!.init!.body as string)).toMatchObject({ id: 'WP-convo1', PageNonce: '' })
    for (const path of ['GetViewers', 'GetComposeId', 'SendReply']) {
      expect(calls.some((c) => c.url.includes(path))).toBe(false)
    }
  })

  it('refuses a conversation MyChart does not have', async () => {
    const { req, calls } = mockRequestWithCapture([
      { body: TOKEN_HTML },
      { body: 'null' },
    ])
    const result = await sendReply(req, { conversationId: 'WP-nope', messageBody: 'hi' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('no conversation WP-nope')
    expect(calls).toHaveLength(2)
  })

  it('refuses when the thread cannot be read', async () => {
    const req = mockRequest([
      { body: TOKEN_HTML },
      { body: '{"Message":"An error has occurred."}', status: 500 },
    ])
    const result = await sendReply(req, { conversationId: 'WP-convo1', messageBody: 'hi' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('status 500')
  })

  it('sends reply successfully and returns conversation ID', async () => {
    const { req, calls } = mockRequestWithCapture([
      { body: TOKEN_HTML },                                                         // getVerificationToken
      { body: OPEN_THREAD },                                                        // GetConversationDetails
      { body: JSON.stringify({ viewers: [{ wprId: 'WP-wpr1', isSelf: true }] }) }, // getViewerWprId
      { body: JSON.stringify('WP-compose123') },                                    // getComposeId
      { body: JSON.stringify('WP-convo1') },                                        // SendReply
      { body: '""' },                                                               // RemoveComposeId
    ])

    const result = await sendReply(req, {
      conversationId: 'WP-convo1',
      messageBody: 'can you find when my last appointment was',
    })

    expect(result.success).toBe(true)
    expect(result.conversationId).toBe('WP-convo1')

    // Verify the send request (5th call, index 4)
    const sendCall = calls[4]
    expect(sendCall!.url).toContain('/api/conversations/SendReply')
    const sendBody = JSON.parse(sendCall!.init!.body as string)
    expect(sendBody.conversationId).toBe('WP-convo1')
    expect(sendBody.messageBody).toEqual(['can you find when my last appointment was'])
    expect(sendBody.viewers).toEqual([{ wprId: 'WP-wpr1' }])
    expect(sendBody.composeId).toBe('WP-compose123')
    expect(sendBody.organizationId).toBe('')
    expect(sendBody.documentIds).toEqual([])
    expect(sendBody.includeOtherViewers).toBe(false)

    // Verify cleanup (6th call, index 5)
    const cleanupCall = calls[5]
    expect(cleanupCall!.url).toContain('/api/conversations/RemoveComposeId')
  })

  it('returns error on non-200 response', async () => {
    const req = mockRequest([
      { body: TOKEN_HTML },
      { body: OPEN_THREAD },
      { body: JSON.stringify({ viewers: [{ wprId: 'WP-wpr1', isSelf: true }] }) },
      { body: JSON.stringify('WP-compose123') },
      { body: JSON.stringify({ error: 'forbidden' }), status: 403 },
      { body: '""' },
    ])

    const result = await sendReply(req, {
      conversationId: 'WP-convo1',
      messageBody: 'Hello',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('403')
  })

  it('does not include subject or recipient in reply body', async () => {
    const { req, calls } = mockRequestWithCapture([
      { body: TOKEN_HTML },
      { body: OPEN_THREAD },
      { body: JSON.stringify({ viewers: [{ wprId: 'WP-wpr1', isSelf: true }] }) },
      { body: JSON.stringify('WP-compose123') },
      { body: JSON.stringify('WP-convo1') },
      { body: '""' },
    ])

    await sendReply(req, {
      conversationId: 'WP-convo1',
      messageBody: 'Test reply',
    })

    const sendBody = JSON.parse(calls[4]!.init!.body as string)
    expect(sendBody).not.toHaveProperty('recipient')
    expect(sendBody).not.toHaveProperty('topic')
    expect(sendBody).not.toHaveProperty('messageSubject')
  })

  it('picks self viewer from multiple viewers', async () => {
    const { req, calls } = mockRequestWithCapture([
      { body: TOKEN_HTML },
      { body: OPEN_THREAD },
      {
        body: JSON.stringify({
          viewers: [
            { wprId: 'WP-other', name: 'Other Person', isSelf: false },
            { wprId: 'WP-self', name: 'Ryan Hughes', isSelf: true },
          ],
        }),
      },
      { body: JSON.stringify('WP-compose123') },
      { body: JSON.stringify('WP-convo1') },
      { body: '""' },
    ])

    await sendReply(req, {
      conversationId: 'WP-convo1',
      messageBody: 'Test',
    })

    const sendBody = JSON.parse(calls[4]!.init!.body as string)
    expect(sendBody.viewers).toEqual([{ wprId: 'WP-self' }])
  })

  it('passes custom organizationId', async () => {
    const { req, calls } = mockRequestWithCapture([
      { body: TOKEN_HTML },
      { body: OPEN_THREAD },
      { body: JSON.stringify({ viewers: [{ wprId: 'WP-wpr1', isSelf: true }] }) },
      { body: JSON.stringify('WP-compose123') },
      { body: JSON.stringify('WP-convo1') },
      { body: '""' },
    ])

    await sendReply(req, {
      conversationId: 'WP-convo1',
      messageBody: 'Test',
      organizationId: 'WP-org1',
    })

    const viewersBody = JSON.parse(calls[2]!.init!.body as string)
    expect(viewersBody.organizationId).toBe('WP-org1')

    const sendBody = JSON.parse(calls[4]!.init!.body as string)
    expect(sendBody.organizationId).toBe('WP-org1')
  })

  it('wraps messageBody as array of strings', async () => {
    const { req, calls } = mockRequestWithCapture([
      { body: TOKEN_HTML },
      { body: OPEN_THREAD },
      { body: JSON.stringify({ viewers: [{ wprId: 'WP-wpr1', isSelf: true }] }) },
      { body: JSON.stringify('WP-compose123') },
      { body: JSON.stringify('WP-convo1') },
      { body: '""' },
    ])

    await sendReply(req, {
      conversationId: 'WP-convo1',
      messageBody: 'plain text message',
    })

    const sendBody = JSON.parse(calls[4]!.init!.body as string)
    expect(Array.isArray(sendBody.messageBody)).toBe(true)
    expect(sendBody.messageBody).toEqual(['plain text message'])
  })
})
