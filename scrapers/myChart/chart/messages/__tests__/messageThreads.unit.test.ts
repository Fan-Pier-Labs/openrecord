import { describe, it, expect, mock } from 'bun:test'
import { getConversationMessages, toThreadMessage } from '../messageThreads'
import { MyChartRequest } from '../../../core/myChartRequest'

/**
 * MyChart's own wire shape, as captured from GetConversationList /
 * GetConversationMessages: messages are `wmgId` / `body` /
 * `deliveryInstantISO` / `author`, never the camelCase names our output uses.
 */
const HIBBERT = { empKey: 'PROV-HIBBERT', wprKey: '', displayName: 'Julius Hibbert, MD' }
const HOMER = { empKey: '', wprKey: 'WPR-HOMER', displayName: 'Homer Simpson' }

/**
 * What the live instances actually send, on all four without exception:
 * exactly one key per author, and an empty displayName with the name only in
 * the users / viewers maps.
 */
const NAMELESS_STAFF = { displayName: '', empKey: 'PROV-HIBBERT' }
const NAMELESS_PATIENT = { displayName: '', wprKey: 'WPR-HOMER' }

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
function mockRequest(bodies: {
  page: string
  list?: unknown
  messages?: unknown
  messagesRaw?: string
  messagesStatus?: number
}) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  req.transport = mock(async (url: string | URL) => {
    const href = String(url)
    if (href.includes('GetConversationList')) return new Response(JSON.stringify(bodies.list ?? {}), { status: 200 })
    if (href.includes('GetConversationMessages')) {
      return new Response(bodies.messagesRaw ?? JSON.stringify(bodies.messages ?? {}), {
        status: bodies.messagesStatus ?? 200,
      })
    }
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

  // Every inline message on the live instances we can check had an empty
  // displayName, so the maps carry the whole load rather than filling an
  // occasional gap.
  it('resolves names through the key maps when displayName is empty', () => {
    expect(toThreadMessage({ wmgId: 'M', author: NAMELESS_STAFF }, CONVERSATION_LIST).senderName)
      .toBe('Julius Hibbert, MD')
    expect(toThreadMessage({ wmgId: 'M', author: NAMELESS_PATIENT }, CONVERSATION_LIST).senderName)
      .toBe('Homer Simpson')
  })

  it('attributes a nameless author by which key it carries', () => {
    expect(toThreadMessage({ wmgId: 'M', author: NAMELESS_STAFF }).isFromPatient).toBe(false)
    expect(toThreadMessage({ wmgId: 'M', author: NAMELESS_PATIENT }).isFromPatient).toBe(true)
  })

  it("falls back to the conversation's userOverrideNames for a staff author", () => {
    const named = toThreadMessage({ wmgId: 'M', author: { displayName: '', empKey: 'PROV-NICK' } }, CONVERSATION_LIST, {
      'PROV-NICK': 'Nick Riviera, MD',
    })
    expect(named.senderName).toBe('Nick Riviera, MD')
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
    expect(result).toEqual({ conversationId: 'conv-1', subject: '', messages: [], truncated: false })
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
      truncated: false,
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

  // All four instances we can check answer this endpoint with a 500 and
  // `{"Message":"An error has occurred."}` — every conversation, every body
  // and content-type tried. Every message on those accounts is inlined in the
  // listing instead, so that is where the thread has to come from.
  it('falls back to the listing when GetConversationMessages errors', async () => {
    const req = mockRequest({
      page: TOKEN_PAGE,
      list: CONVERSATION_LIST,
      messages: { Message: 'An error has occurred.' },
      messagesStatus: 500,
    })

    const result = await getConversationMessages(req, 'conv-1')
    expect(result.subject).toBe('Follow-up')
    expect(result.messages).toHaveLength(2)
    expect(result.messages[1]!.isFromPatient).toBe(true)
    expect(result.truncated).toBe(false)
  })

  it('survives an HTML error page from GetConversationMessages', async () => {
    const req = mockRequest({ page: TOKEN_PAGE, list: CONVERSATION_LIST, messagesRaw: '<html>error</html>' })
    const result = await getConversationMessages(req, 'conv-1')
    expect(result.messages).toHaveLength(2)
  })

  // Conversations do claim more messages than the listing carries, and the
  // endpoint that would fetch them is the one that 500s.
  it('reports a thread as truncated when the listing is all there is', async () => {
    const req = mockRequest({
      page: TOKEN_PAGE,
      list: {
        ...CONVERSATION_LIST,
        conversations: [{ ...CONVERSATION_LIST.conversations[0]!, hasMoreMessages: true }],
      },
      messages: { Message: 'An error has occurred.' },
      messagesStatus: 500,
    })

    const result = await getConversationMessages(req, 'conv-1')
    expect(result.messages).toHaveLength(2)
    expect(result.truncated).toBe(true)
  })

  // Null and [] are different answers: a served empty thread is the endpoint
  // saying the conversation is empty, and that wins over a stale listing.
  // Pinned so the distinction stays a decision rather than an accident.
  it('trusts a served empty thread over the listing', async () => {
    const req = mockRequest({ page: TOKEN_PAGE, list: CONVERSATION_LIST, messages: { messages: [] } })
    const result = await getConversationMessages(req, 'conv-1')
    expect(result.messages).toEqual([])
    expect(result.truncated).toBe(false)
  })

  it('uses the served thread, not the listing, when the endpoint answers', async () => {
    const req = mockRequest({
      page: TOKEN_PAGE,
      list: {
        ...CONVERSATION_LIST,
        conversations: [{ ...CONVERSATION_LIST.conversations[0]!, hasMoreMessages: true, messages: [THREAD_MESSAGES[0]!] }],
      },
      messages: { messages: THREAD_MESSAGES },
    })

    const result = await getConversationMessages(req, 'conv-1')
    expect(result.messages).toHaveLength(2)
    expect(result.truncated).toBe(false)
  })

  it('returns no messages for a conversation the API does not know', async () => {
    const req = mockRequest({ page: TOKEN_PAGE, list: CONVERSATION_LIST, messages: { messages: [] } })
    const result = await getConversationMessages(req, 'conv-404')
    expect(result).toEqual({ conversationId: 'conv-404', subject: '', messages: [], truncated: false })
  })
})
