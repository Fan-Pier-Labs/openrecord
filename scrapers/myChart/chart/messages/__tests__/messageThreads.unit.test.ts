import { describe, it, expect, mock } from 'bun:test'
import { getConversationMessages } from '../messageThreads'
import { MyChartRequest } from '../../../core/myChartRequest'

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

const TOKEN_PAGE = { body: '<input name="__RequestVerificationToken" value="t" />' }

/**
 * A thread exactly as Epic serializes it: `wmgId` / `body` /
 * `deliveryInstantISO`, with the author keyed by `empKey` (care team) or
 * `wprKey` (patient). Same message shape the conversation LIST inlines, which
 * is the one held to a live capture in `fake-mychart/src/data/realShapes.ts`.
 */
const REAL_THREAD = {
  messages: [
    {
      wmgId: 'MSG-001',
      isUnread: false,
      deliveryInstantISO: '2026-01-10T14:30:00Z',
      body: 'Your results are back and everything looks normal.',
      author: { displayName: 'A. Provider, MD', empKey: 'PROV-1', wprKey: '' },
      attachments: [],
      tasks: [],
      suggestedActions: [],
    },
    {
      wmgId: 'MSG-002',
      isUnread: false,
      deliveryInstantISO: '2026-01-10T15:45:00Z',
      body: 'Thanks — should I keep taking the same dose?',
      author: { displayName: 'Test Patient', empKey: '', wprKey: 'WPR-1' },
      attachments: [],
      tasks: [],
      suggestedActions: [],
    },
  ],
}

describe('getConversationMessages', () => {
  it('returns empty thread when no token found', async () => {
    const req = mockRequest([{ body: '<html></html>' }])
    const result = await getConversationMessages(req, 'conv-1')
    expect(result).toEqual({ conversationId: 'conv-1', subject: '', messages: [] })
  })

  it("reads Epic's real message field names", async () => {
    const req = mockRequest([TOKEN_PAGE, { body: JSON.stringify(REAL_THREAD) }])

    const result = await getConversationMessages(req, 'conv-1')

    expect(result.conversationId).toBe('conv-1')
    expect(result.messages).toEqual([
      {
        messageId: 'MSG-001',
        senderName: 'A. Provider, MD',
        sentDate: '2026-01-10T14:30:00Z',
        messageBody: 'Your results are back and everything looks normal.',
        isFromPatient: false,
      },
      {
        messageId: 'MSG-002',
        senderName: 'Test Patient',
        sentDate: '2026-01-10T15:45:00Z',
        messageBody: 'Thanks — should I keep taking the same dose?',
        isFromPatient: true,
      },
    ])
  })

  it('never reports a message it could not read as a blank message', async () => {
    // The regression this file exists for: the parser used to read invented
    // field names, so a populated thread came back with the right NUMBER of
    // messages and every field empty — a silent wrong answer on a medical
    // record. Any future rename of the wire fields fails here.
    const req = mockRequest([TOKEN_PAGE, { body: JSON.stringify(REAL_THREAD) }])

    const result = await getConversationMessages(req, 'conv-1')

    expect(result.messages).toHaveLength(REAL_THREAD.messages.length)
    for (const message of result.messages) {
      expect(message.messageId).not.toBe('')
      expect(message.senderName).not.toBe('')
      expect(message.sentDate).not.toBe('')
      expect(message.messageBody).not.toBe('')
    }
  })

  it('ignores the invented field names the parser used to read', async () => {
    const req = mockRequest([
      TOKEN_PAGE,
      {
        body: JSON.stringify({
          messages: [
            {
              messageId: 'NOT-A-REAL-FIELD',
              senderName: 'Nobody',
              sentDate: '2026-01-01',
              messageBody: 'Never sent by Epic',
              isFromPatient: true,
            },
          ],
        }),
      },
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

  describe('isFromPatient', () => {
    const cases: Array<[string, { empKey?: string; wprKey?: string } | undefined, boolean]> = [
      ['the patient wrote it (wprKey only)', { empKey: '', wprKey: 'WPR-1' }, true],
      ['the care team wrote it (empKey only)', { empKey: 'PROV-1', wprKey: '' }, false],
      ['the key is absent rather than empty', { wprKey: 'WPR-1' }, true],
      ['both keys are set, which we must not read as the patient', { empKey: 'PROV-1', wprKey: 'WPR-1' }, false],
      ['neither key is set', { empKey: '', wprKey: '' }, false],
      ['there is no author at all', undefined, false],
    ]

    for (const [label, author, expected] of cases) {
      it(`is ${expected} when ${label}`, async () => {
        const req = mockRequest([
          TOKEN_PAGE,
          { body: JSON.stringify({ messages: [{ wmgId: 'M', body: 'b', ...(author ? { author } : {}) }] }) },
        ])
        const result = await getConversationMessages(req, 'conv-1')
        expect(result.messages[0]!.isFromPatient).toBe(expected)
      })
    }
  })

  it('handles missing fields with defaults', async () => {
    const req = mockRequest([TOKEN_PAGE, { body: JSON.stringify({ messages: [{}] }) }])

    const result = await getConversationMessages(req, 'conv-1')
    expect(result.messages[0]).toEqual({
      messageId: '',
      senderName: '',
      sentDate: '',
      messageBody: '',
      isFromPatient: false,
    })
  })

  it('uses the conversationId and subject the response carries, when it carries them', async () => {
    // Not seen on a live capture of this endpoint — the conversation list is
    // the authority for a subject — but read tolerantly rather than dropped.
    const req = mockRequest([
      TOKEN_PAGE,
      { body: JSON.stringify({ conversationId: 'CONV-9', subject: 'Question about medication', messages: [] }) },
    ])

    const result = await getConversationMessages(req, 'conv-1')
    expect(result.conversationId).toBe('CONV-9')
    expect(result.subject).toBe('Question about medication')
  })

  it('falls back to the requested id when the response omits one', async () => {
    const req = mockRequest([TOKEN_PAGE, { body: JSON.stringify({ messages: [] }) }])

    const result = await getConversationMessages(req, 'conv-1')
    expect(result).toEqual({ conversationId: 'conv-1', subject: '', messages: [] })
  })
})
