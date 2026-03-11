import { describe, it, expect, mock } from 'bun:test'
import { sendReply } from '../sendReply'
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

  it('sends reply successfully and returns conversation ID', async () => {
    const { req, calls } = mockRequestWithCapture([
      { body: TOKEN_HTML },                                                         // getVerificationToken
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

    // Verify the send request (4th call, index 3)
    const sendCall = calls[3]
    expect(sendCall.url).toContain('/api/conversations/SendReply')
    const sendBody = JSON.parse(sendCall.init!.body as string)
    expect(sendBody.conversationId).toBe('WP-convo1')
    expect(sendBody.messageBody).toEqual(['can you find when my last appointment was'])
    expect(sendBody.viewers).toEqual([{ wprId: 'WP-wpr1' }])
    expect(sendBody.composeId).toBe('WP-compose123')
    expect(sendBody.organizationId).toBe('')
    expect(sendBody.documentIds).toEqual([])
    expect(sendBody.includeOtherViewers).toBe(false)

    // Verify cleanup (5th call, index 4)
    const cleanupCall = calls[4]
    expect(cleanupCall.url).toContain('/api/conversations/RemoveComposeId')
  })

  it('returns error on non-200 response', async () => {
    const req = mockRequest([
      { body: TOKEN_HTML },
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
      { body: JSON.stringify({ viewers: [{ wprId: 'WP-wpr1', isSelf: true }] }) },
      { body: JSON.stringify('WP-compose123') },
      { body: JSON.stringify('WP-convo1') },
      { body: '""' },
    ])

    await sendReply(req, {
      conversationId: 'WP-convo1',
      messageBody: 'Test reply',
    })

    const sendBody = JSON.parse(calls[3].init!.body as string)
    expect(sendBody).not.toHaveProperty('recipient')
    expect(sendBody).not.toHaveProperty('topic')
    expect(sendBody).not.toHaveProperty('messageSubject')
  })

  it('picks self viewer from multiple viewers', async () => {
    const { req, calls } = mockRequestWithCapture([
      { body: TOKEN_HTML },
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

    const sendBody = JSON.parse(calls[3].init!.body as string)
    expect(sendBody.viewers).toEqual([{ wprId: 'WP-self' }])
  })

  it('passes custom organizationId', async () => {
    const { req, calls } = mockRequestWithCapture([
      { body: TOKEN_HTML },
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

    const viewersBody = JSON.parse(calls[1].init!.body as string)
    expect(viewersBody.organizationId).toBe('WP-org1')

    const sendBody = JSON.parse(calls[3].init!.body as string)
    expect(sendBody.organizationId).toBe('WP-org1')
  })

  it('wraps messageBody as array of strings', async () => {
    const { req, calls } = mockRequestWithCapture([
      { body: TOKEN_HTML },
      { body: JSON.stringify({ viewers: [{ wprId: 'WP-wpr1', isSelf: true }] }) },
      { body: JSON.stringify('WP-compose123') },
      { body: JSON.stringify('WP-convo1') },
      { body: '""' },
    ])

    await sendReply(req, {
      conversationId: 'WP-convo1',
      messageBody: 'plain text message',
    })

    const sendBody = JSON.parse(calls[3].init!.body as string)
    expect(Array.isArray(sendBody.messageBody)).toBe(true)
    expect(sendBody.messageBody).toEqual(['plain text message'])
  })
})
