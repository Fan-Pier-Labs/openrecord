import { describe, it, expect, mock } from 'bun:test'
import { getConversationMessages } from '../messages/messageThreads'
import { MyChartRequest } from '../../core/myChartRequest'

const TOKEN_PAGE = '<input name="__RequestVerificationToken" value="t" />'

type Call = { url: string; body: Record<string, unknown> }

/**
 * Serve the token page first, then one canned response per API call, recording
 * what was asked for. The request bodies are the point of most of these tests:
 * the endpoints key on `id`, and `conversationId` — the name the mutating
 * endpoints use — is a 500 on every real instance.
 */
function mockRequest(responses: Array<{ body: string; status?: number }>) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  const calls: Call[] = []
  let i = 0
  req.transport = mock(async (url: string, init: RequestInit) => {
    if (init.method === 'POST') {
      calls.push({ url, body: JSON.parse(init.body as string) as Record<string, unknown> })
    }
    const r = responses[i++]
    return new Response(r!.body, { status: r!.status ?? 200 })
  })
  return { req, calls }
}

const message = (wmgId: string, instant: string, author: Record<string, string>, body = 'text') =>
  ({ wmgId, deliveryInstantISO: instant, body, author: { displayName: '', ...author } })

describe('getConversationMessages', () => {
  it('returns empty thread when no token found', async () => {
    const { req } = mockRequest([{ body: '<html></html>' }])
    const result = await getConversationMessages(req, 'conv-1')
    expect(result).toEqual({ conversationId: 'conv-1', subject: '', messages: [] })
  })

  it('seeds from GetConversationDetails, keyed on id', async () => {
    const { req, calls } = mockRequest([
      { body: TOKEN_PAGE },
      {
        body: JSON.stringify({
          hthId: 'conv-1',
          subject: 'Question about medication',
          hasMoreMessages: false,
          users: { 'EMP-1': { name: 'Dr. Smith' } },
          viewers: { 'WPR-1': { name: 'John Doe' } },
          messages: [
            message('M1', '2026-03-01T10:00:00Z', { empKey: 'EMP-1' }, 'Hello, how can I help?'),
            message('M2', '2026-03-01T11:00:00Z', { wprKey: 'WPR-1' }, 'A question about my dosage.'),
          ],
        }),
      },
    ])

    const result = await getConversationMessages(req, 'conv-1')

    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toContain('/api/conversations/GetConversationDetails')
    expect(calls[0]!.body.id).toBe('conv-1')
    expect(calls[0]!.body).not.toHaveProperty('conversationId')

    expect(result.subject).toBe('Question about medication')
    expect(result.messages).toEqual([
      { messageId: 'M1', senderName: 'Dr. Smith', sentDate: '2026-03-01T10:00:00Z', messageBody: 'Hello, how can I help?', isFromPatient: false },
      { messageId: 'M2', senderName: 'John Doe', sentDate: '2026-03-01T11:00:00Z', messageBody: 'A question about my dosage.', isFromPatient: true },
    ])
  })

  it('pages backwards through older messages until hasMoreMessages clears', async () => {
    const { req, calls } = mockRequest([
      { body: TOKEN_PAGE },
      {
        body: JSON.stringify({
          hthId: 'conv-1',
          subject: 'Long thread',
          hasMoreMessages: true,
          users: { 'EMP-1': { name: 'Dr. Smith' } },
          messages: [message('M3', '2026-03-03T00:00:00Z', { empKey: 'EMP-1' })],
        }),
      },
      {
        body: JSON.stringify({
          hasMoreMessages: true,
          messages: [message('M2', '2026-03-02T00:00:00Z', { empKey: 'EMP-1' })],
        }),
      },
      {
        body: JSON.stringify({
          hasMoreMessages: false,
          messages: [message('M1', '2026-03-01T00:00:00Z', { empKey: 'EMP-1' })],
        }),
      },
    ])

    const result = await getConversationMessages(req, 'conv-1')

    // Oldest first, with each page prepended in front of what came before.
    expect(result.messages.map(m => m.messageId)).toEqual(['M1', 'M2', 'M3'])
    // Every page asks for messages strictly older than the oldest one held.
    expect(calls.map(c => c.body.startInstantISO)).toEqual([undefined, '2026-03-03T00:00:00Z', '2026-03-02T00:00:00Z'])
    expect(calls.slice(1).every(c => c.url.includes('/api/conversations/GetConversationMessages'))).toBe(true)
    expect(calls.slice(1).every(c => c.body.id === 'conv-1')).toBe(true)
  })

  it('stops when a page comes back empty even though hasMoreMessages stays set', async () => {
    const { req, calls } = mockRequest([
      { body: TOKEN_PAGE },
      { body: JSON.stringify({ hasMoreMessages: true, messages: [message('M1', '2026-03-01T00:00:00Z', { empKey: 'E' })] }) },
      { body: JSON.stringify({ hasMoreMessages: true, messages: [] }) },
    ])

    const result = await getConversationMessages(req, 'conv-1')

    expect(result.messages.map(m => m.messageId)).toEqual(['M1'])
    expect(calls).toHaveLength(2)
  })

  it('prefers the conversation userOverrideNames over the shared users map', async () => {
    const { req } = mockRequest([
      { body: TOKEN_PAGE },
      {
        body: JSON.stringify({
          hasMoreMessages: false,
          users: { 'EMP-1': { name: 'Covering Provider' } },
          userOverrideNames: { 'EMP-1': 'Spine Clinic' },
          messages: [message('M1', '2026-03-01T00:00:00Z', { empKey: 'EMP-1' })],
        }),
      },
    ])

    const result = await getConversationMessages(req, 'conv-1')
    expect(result.messages[0]!.senderName).toBe('Spine Clinic')
  })

  it("falls back to the message's own displayName when no map has the key", async () => {
    const { req } = mockRequest([
      { body: TOKEN_PAGE },
      {
        body: JSON.stringify({
          hasMoreMessages: false,
          messages: [{ wmgId: 'M1', deliveryInstantISO: '2026-03-01T00:00:00Z', body: 'b', author: { displayName: 'Dr. Nobody', empKey: 'EMP-9' } }],
        }),
      },
    ])

    const result = await getConversationMessages(req, 'conv-1')
    expect(result.messages[0]!.senderName).toBe('Dr. Nobody')
  })

  it('handles missing fields with defaults', async () => {
    const { req } = mockRequest([
      { body: TOKEN_PAGE },
      { body: JSON.stringify({ messages: [{}] }) },
    ])

    const result = await getConversationMessages(req, 'conv-1')
    expect(result.conversationId).toBe('conv-1')
    expect(result.messages[0]).toEqual({
      messageId: '',
      senderName: '',
      sentDate: '',
      messageBody: '',
      isFromPatient: false,
    })
  })

  it('throws rather than reporting an empty thread when the endpoint fails', async () => {
    const { req } = mockRequest([
      { body: TOKEN_PAGE },
      { body: JSON.stringify({ Message: 'An error has occurred.' }), status: 500 },
    ])

    await expect(getConversationMessages(req, 'conv-1')).rejects.toThrow('GetConversationDetails failed with status 500')
  })
})
