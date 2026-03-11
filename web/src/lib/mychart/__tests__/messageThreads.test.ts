import { describe, it, expect, mock } from 'bun:test'
import { getConversationMessages } from '../messageThreads'
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

describe('getConversationMessages', () => {
  it('returns empty thread when no token found', async () => {
    const req = mockRequest([{ body: '<html></html>' }])
    const result = await getConversationMessages(req, 'conv-1')
    expect(result).toEqual({ conversationId: 'conv-1', subject: '', messages: [] })
  })

  it('parses messages from API response', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      {
        body: JSON.stringify({
          conversationId: 'conv-1',
          subject: 'Question about medication',
          messages: [
            { messageId: 'M1', senderName: 'Dr. Smith', sentDate: '2024-03-01', messageBody: 'Hello, how can I help?', isFromPatient: false },
            { messageId: 'M2', senderName: 'John Doe', sentDate: '2024-03-01', messageBody: 'I have a question about my dosage.', isFromPatient: true },
          ],
        }),
      },
    ])

    const result = await getConversationMessages(req, 'conv-1')
    expect(result.subject).toBe('Question about medication')
    expect(result.messages).toHaveLength(2)
    expect(result.messages[0].senderName).toBe('Dr. Smith')
    expect(result.messages[1].isFromPatient).toBe(true)
  })

  it('handles missing fields with defaults', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      { body: JSON.stringify({ messages: [{}] }) },
    ])

    const result = await getConversationMessages(req, 'conv-1')
    expect(result.messages[0]).toEqual({
      messageId: '',
      senderName: '',
      sentDate: '',
      messageBody: '',
      isFromPatient: false,
    })
  })
})
