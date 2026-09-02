import { describe, it, expect, mock } from 'bun:test'
import { getConversationMessages, toThreadMessage } from '../messages/messageThreads'
import { MyChartRequest } from '../../core/myChartRequest'

/**
 * MyChart's own wire shape, as captured from GetConversationList /
 * GetConversationMessages: messages are `wmgId` / `body` /
 * `deliveryInstantISO` / `author`, never the camelCase names our output uses.
 */
const HIBBERT = { empKey: 'PROV-HIBBERT', wprKey: '', displayName: 'Julius Hibbert, MD' }
const HOMER = { empKey: '', wprKey: 'WPR-HOMER', displayName: 'Homer Simpson' }

const THREAD_MESSAGES = [
  { wmgId: 'MSG-001', author: HIBBERT, deliveryInstantISO: '2026-01-10T14:30:00Z', body: 'How are you feeling?' },
  { wmgId: 'MSG-002', author: HOMER, deliveryInstantISO: '2026-01-10T15:45:00Z', body: 'Much better, thanks.' },
]

const CONVERSATION_LIST = {
  conversations: [
    { hthId: 'conv-1', subject: 'Follow-up', messages: THREAD_MESSAGES },
    { hthId: 'conv-2', subject: 'Other thread', messages: [] },
  ],
  users: { 'PROV-HIBBERT': { name: 'Julius Hibbert, MD' } },
  viewers: { 'WPR-HOMER': { name: 'Homer Simpson', isSelf: true } },
}

/**
 * Routes by URL rather than call order: the thread fetches the list and the
 * messages concurrently, so their order on the wire isn't fixed.
 */
function mockRequest(bodies: { page: string; list?: unknown; messages?: unknown }) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  req.transport = mock(async (url: string | URL) => {
    const href = String(url)
    if (href.includes('GetConversationList')) return new Response(JSON.stringify(bodies.list ?? {}), { status: 200 })
    if (href.includes('GetConversationMessages')) return new Response(JSON.stringify(bodies.messages ?? {}), { status: 200 })
    return new Response(bodies.page, { status: 200 })
  })
  return req
}

const TOKEN_PAGE = '<input name="__RequestVerificationToken" value="t" />'

describe('toThreadMessage', () => {
  it('maps MyChart field names onto the thread shape', () => {
    expect(toThreadMessage(THREAD_MESSAGES[0]!)).toEqual({
      messageId: 'MSG-001',
      senderName: 'Julius Hibbert, MD',
      sentDate: '2026-01-10T14:30:00Z',
      messageBody: 'How are you feeling?',
      isFromPatient: false,
    })
  })

  it('treats an author with a viewer key and no staff key as the patient', () => {
    expect(toThreadMessage(THREAD_MESSAGES[1]!).isFromPatient).toBe(true)
  })

  it('falls back to the key maps when an author has no display name', () => {
    expect(toThreadMessage({ wmgId: 'M', author: { empKey: 'PROV-HIBBERT' } }, CONVERSATION_LIST).senderName)
      .toBe('Julius Hibbert, MD')
    expect(toThreadMessage({ wmgId: 'M', author: { wprKey: 'WPR-HOMER' } }, CONVERSATION_LIST).senderName)
      .toBe('Homer Simpson')
  })

  it('defaults every field on a message with nothing in it', () => {
    expect(toThreadMessage({})).toEqual({
      messageId: '',
      senderName: '',
      sentDate: '',
      messageBody: '',
      isFromPatient: false,
    })
  })
})

describe('getConversationMessages', () => {
  it('returns empty thread when no token found', async () => {
    const req = mockRequest({ page: '<html></html>' })
    const result = await getConversationMessages(req, 'conv-1')
    expect(result).toEqual({ conversationId: 'conv-1', subject: '', messages: [] })
  })

  it('populates every field from the API response', async () => {
    const req = mockRequest({
      page: TOKEN_PAGE,
      list: CONVERSATION_LIST,
      messages: { messages: THREAD_MESSAGES },
    })

    const result = await getConversationMessages(req, 'conv-1')
    expect(result).toEqual({
      conversationId: 'conv-1',
      subject: 'Follow-up',
      messages: [
        {
          messageId: 'MSG-001',
          senderName: 'Julius Hibbert, MD',
          sentDate: '2026-01-10T14:30:00Z',
          messageBody: 'How are you feeling?',
          isFromPatient: false,
        },
        {
          messageId: 'MSG-002',
          senderName: 'Homer Simpson',
          sentDate: '2026-01-10T15:45:00Z',
          messageBody: 'Much better, thanks.',
          isFromPatient: true,
        },
      ],
    })
  })

  it('still returns the messages when the conversation list cannot be read', async () => {
    const req = mockRequest({ page: TOKEN_PAGE, list: {}, messages: { messages: THREAD_MESSAGES } })
    const result = await getConversationMessages(req, 'conv-1')
    expect(result.subject).toBe('')
    expect(result.messages).toHaveLength(2)
    expect(result.messages[0]!.messageBody).toBe('How are you feeling?')
  })

  it('returns no messages for a conversation the API does not know', async () => {
    const req = mockRequest({ page: TOKEN_PAGE, list: CONVERSATION_LIST, messages: { messages: [] } })
    const result = await getConversationMessages(req, 'conv-404')
    expect(result).toEqual({ conversationId: 'conv-404', subject: '', messages: [] })
  })
})
