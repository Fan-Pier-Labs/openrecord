import { describe, it, expect, mock } from 'bun:test'
import { getConversationMessages, toThreadMessage } from '../messageThreads'
import { MyChartRequest } from '../../../core/myChartRequest'

/**
 * MyChart's own wire shape, as captured from the conversation endpoints:
 * messages are `wmgId` / `body` / `deliveryInstantISO` / `author`, never the
 * camelCase names our output uses.
 */
const HIBBERT = { empKey: 'PROV-HIBBERT', wprKey: '', displayName: 'Julius Hibbert, MD' }
const HOMER = { empKey: '', wprKey: 'WPR-HOMER', displayName: 'Homer Simpson' }

/**
 * What the live instances actually send, without exception: exactly one key per
 * author, and an empty displayName with the name only in the users / viewers
 * maps.
 */
const NAMELESS_STAFF = { displayName: '', empKey: 'PROV-HIBBERT' }
const NAMELESS_PATIENT = { displayName: '', wprKey: 'WPR-HOMER' }

const THREAD_MESSAGES = [
  { wmgId: 'MSG-001', author: HIBBERT, deliveryInstantISO: '2026-01-10T14:30:00Z', body: 'How are you feeling?' },
  { wmgId: 'MSG-002', author: HOMER, deliveryInstantISO: '2026-01-10T15:45:00Z', body: 'Much better, thanks.' },
]

const DIRECTORY = {
  users: { 'PROV-HIBBERT': { name: 'Julius Hibbert, MD' } },
  viewers: { 'WPR-HOMER': { name: 'Homer Simpson', isSelf: true } },
}

const TOKEN_PAGE = '<input name="__RequestVerificationToken" value="t" />'

type Call = { url: string; body: Record<string, unknown> }

/**
 * Serve the token page first, then one canned response per API call, recording
 * what was asked for. The request bodies are the point of most of these tests:
 * the read endpoints key on `id`, and `conversationId` — the name the mutating
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

/** A canned JSON response body. */
const json = (payload: unknown) => ({ body: JSON.stringify(payload) })

const message = (wmgId: string, instant: string, author: Record<string, string>, body = 'text') =>
  ({ wmgId, deliveryInstantISO: instant, body, author: { displayName: '', ...author } })

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

  // Every message on the live instances we can check had an empty displayName,
  // so the maps carry the whole load rather than filling an occasional gap.
  it('resolves names through the key maps when displayName is empty', () => {
    expect(toThreadMessage({ wmgId: 'M', author: NAMELESS_STAFF }, DIRECTORY).senderName)
      .toBe('Julius Hibbert, MD')
    expect(toThreadMessage({ wmgId: 'M', author: NAMELESS_PATIENT }, DIRECTORY).senderName)
      .toBe('Homer Simpson')
  })

  it('attributes a nameless author by which key it carries', () => {
    expect(toThreadMessage({ wmgId: 'M', author: NAMELESS_STAFF }).isFromPatient).toBe(false)
    expect(toThreadMessage({ wmgId: 'M', author: NAMELESS_PATIENT }).isFromPatient).toBe(true)
  })

  // The bundle resolves a staff name as `userOverrideNames[empKey] || users[empKey].name`,
  // so a thread that renames a participant wins over the shared map.
  it("prefers the conversation's userOverrideNames over the shared users map", () => {
    const named = toThreadMessage({ wmgId: 'M', author: NAMELESS_STAFF }, DIRECTORY, {
      'PROV-HIBBERT': 'Springfield Spine Clinic',
    })
    expect(named.senderName).toBe('Springfield Spine Clinic')
  })

  it('falls back to displayName only when no map has the key', () => {
    expect(toThreadMessage({ wmgId: 'M', author: { displayName: 'Dr. Nobody', empKey: 'EMP-9' } }, DIRECTORY).senderName)
      .toBe('Dr. Nobody')
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
    const { req } = mockRequest([{ body: '<html></html>' }])
    const result = await getConversationMessages(req, 'conv-1')
    expect(result).toEqual({ conversationId: 'conv-1', subject: '', messages: [], truncated: false })
  })

  it('seeds from GetConversationDetails, keyed on id', async () => {
    const { req, calls } = mockRequest([
      { body: TOKEN_PAGE },
      json({ hthId: 'conv-1', subject: 'Follow-up', hasMoreMessages: false, ...DIRECTORY, messages: THREAD_MESSAGES }),
    ])

    const result = await getConversationMessages(req, 'conv-1')

    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toContain('/api/conversations/GetConversationDetails')
    expect(calls[0]!.body.id).toBe('conv-1')
    expect(calls[0]!.body).not.toHaveProperty('conversationId')

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

  it('pages backwards through older messages until hasMoreMessages clears', async () => {
    const { req, calls } = mockRequest([
      { body: TOKEN_PAGE },
      json({
        hthId: 'conv-1',
        subject: 'Long thread',
        hasMoreMessages: true,
        ...DIRECTORY,
        messages: [message('M3', '2026-03-03T00:00:00Z', { empKey: 'PROV-HIBBERT' })],
      }),
      json({ hasMoreMessages: true, messages: [message('M2', '2026-03-02T00:00:00Z', { empKey: 'PROV-HIBBERT' })] }),
      json({ hasMoreMessages: false, messages: [message('M1', '2026-03-01T00:00:00Z', { empKey: 'PROV-HIBBERT' })] }),
    ])

    const result = await getConversationMessages(req, 'conv-1')

    // Oldest first, with each page prepended in front of what came before.
    expect(result.messages.map(m => m.messageId)).toEqual(['M1', 'M2', 'M3'])
    expect(result.truncated).toBe(false)
    // Every page asks for messages strictly older than the oldest one held.
    expect(calls.map(c => c.body.startInstantISO)).toEqual([undefined, '2026-03-03T00:00:00Z', '2026-03-02T00:00:00Z'])
    expect(calls.slice(1).every(c => c.url.includes('/api/conversations/GetConversationMessages'))).toBe(true)
    expect(calls.slice(1).every(c => c.body.id === 'conv-1')).toBe(true)
  })

  it('stops when a page comes back empty even though hasMoreMessages stays set', async () => {
    const { req, calls } = mockRequest([
      { body: TOKEN_PAGE },
      json({ hasMoreMessages: true, messages: [message('M1', '2026-03-01T00:00:00Z', { empKey: 'E' })] }),
      json({ hasMoreMessages: true, messages: [] }),
    ])

    const result = await getConversationMessages(req, 'conv-1')

    expect(result.messages.map(m => m.messageId)).toEqual(['M1'])
    expect(result.truncated).toBe(false)
    expect(calls).toHaveLength(2)
  })

  // The only way `truncated` is reachable now that the endpoint works: a server
  // that keeps claiming more messages past the page cap.
  it('reports truncated when the thread never stops claiming more', async () => {
    const page = (n: number) => json({
      hasMoreMessages: true,
      messages: [message(`M${n}`, `2026-03-${String(n).padStart(2, '0')}T00:00:00Z`, { empKey: 'E' })],
    })
    const { req, calls } = mockRequest([{ body: TOKEN_PAGE }, ...Array.from({ length: 60 }, (_, i) => page(60 - i))])

    const result = await getConversationMessages(req, 'conv-1')

    expect(result.truncated).toBe(true)
    // The seed plus MAX_PAGES pages, and not one request more.
    expect(calls).toHaveLength(51)
  })

  it('handles missing fields with defaults', async () => {
    const { req } = mockRequest([{ body: TOKEN_PAGE }, json({ messages: [{}] })])

    const result = await getConversationMessages(req, 'conv-1')
    expect(result.conversationId).toBe('conv-1')
    expect(result.subject).toBe('')
    expect(result.messages[0]).toEqual({
      messageId: '',
      senderName: '',
      sentDate: '',
      messageBody: '',
      isFromPatient: false,
    })
  })

  // The failure this whole module exists to stop being: an error read as an
  // empty thread looks exactly like a conversation with nothing in it.
  it('throws rather than reporting an empty thread when the endpoint fails', async () => {
    const { req } = mockRequest([
      { body: TOKEN_PAGE },
      { body: JSON.stringify({ Message: 'An error has occurred.' }), status: 500 },
    ])

    await expect(getConversationMessages(req, 'conv-1')).rejects.toThrow('GetConversationDetails failed with status 500')
  })

  // All four live instances answer GetConversationDetails with 200 and a
  // literal `null` for an id they don't recognise — the tidy 500 is only what
  // its sibling gives. A status-only check sails past that and then reads
  // `null.messages`, so the payload is checked too.
  it('rejects a 200 with a literal null body as an unknown conversation', async () => {
    const { req } = mockRequest([{ body: TOKEN_PAGE }, { body: 'null' }])

    await expect(getConversationMessages(req, 'conv-404')).rejects.toThrow(/No conversation conv-404/)
  })

  it('keeps paging robust if a later page answers null', async () => {
    const { req } = mockRequest([
      { body: TOKEN_PAGE },
      json({ hasMoreMessages: true, messages: [message('M1', '2026-03-01T00:00:00Z', { empKey: 'E' })] }),
      { body: 'null' },
    ])

    const result = await getConversationMessages(req, 'conv-1')
    expect(result.messages.map(m => m.messageId)).toEqual(['M1'])
    expect(result.truncated).toBe(false)
  })
})
