import { describe, it, expect, mock } from 'bun:test'
import {
  getConversationMessages,
  fetchConversationThreadRaw,
  conversationThreadProcessor,
  MAX_PAGES,
} from '../messageThreads'
import { MyChartRequest } from '../../../core/myChartRequest'
import { MissingVerificationTokenError } from '../../../core/util'
import type { RawResponse } from '../../../core/rawResponse'

/**
 * What the live instances actually send, without exception: exactly one key per
 * author, and an empty displayName with the name only in the users / viewers
 * maps.
 */
const NAMELESS_STAFF = { displayName: '', empKey: 'PROV-HIBBERT' }
const NAMELESS_PATIENT = { displayName: '', wprKey: 'WPR-HOMER' }

const DIRECTORY = {
  users: { 'PROV-HIBBERT': { name: 'Julius Hibbert, MD' } },
  viewers: { 'WPR-HOMER': { name: 'Homer Simpson', isSelf: true } },
}

const TOKEN_PAGE = '<input name="__RequestVerificationToken" value="t" />'

type Call = { url: string; body: Record<string, unknown> }

/**
 * Serve the token page first, then one canned response per API call, recording
 * what was asked for. The request bodies are the point of several of these
 * tests: the read endpoints key on `id`, and `conversationId` — the name the
 * mutating endpoints use — is a 500 on every real instance.
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
    return new Response(r!.body, { status: r!.status ?? 200, headers: { 'content-type': 'application/json' } })
  })
  return { req, calls }
}

/** A canned JSON response body. */
const json = (payload: unknown) => ({ body: JSON.stringify(payload) })

const message = (wmgId: string, instant: string, author: Record<string, string>, body = 'text') =>
  ({ wmgId, deliveryInstantISO: instant, body, author: { displayName: '', ...author }, isUnread: false, attachments: [], tasks: [], suggestedActions: [] })

const DETAILS = {
  hthId: 'conv-1',
  subject: 'Follow-up',
  numUnread: 1,
  totalMessages: 2,
  replyUrl: '/x',
  replyFlags: { canReply: true, cannotReplyReason: 0 },
  hasPreviouslyViewed: true,
  hasAttachments: false,
  hasTasks: false,
  hasUrgentMsgs: false,
  messageType: 'MedicalAdvice',
  previewText: 'Much better, thanks.',
  audience: [{ empId: 'E1', hipId: '', name: 'Julius Hibbert, MD', providerId: 'P1' }],
  hasMoreMessages: false,
  userOverrideNames: {},
  ...DIRECTORY,
  messages: [
    message('MSG-001', '2026-01-10T14:30:00Z', NAMELESS_STAFF, 'How are you feeling?'),
    message('MSG-002', '2026-01-10T15:45:00Z', NAMELESS_PATIENT, 'Much better, thanks.'),
  ],
}

function envelope(details: unknown, ...pages: unknown[]): RawResponse {
  return {
    requests: [
      { path: '/app/communication-center', method: 'GET', status: 200, contentType: 'text/html', body: TOKEN_PAGE },
      { path: '/api/conversations/GetConversationDetails', method: 'POST', requestBody: { id: 'conv-1' }, status: 200, contentType: 'application/json', body: details },
      ...pages.map((body) => ({ path: '/api/conversations/GetConversationMessages', method: 'POST' as const, requestBody: { id: 'conv-1' }, status: 200, contentType: 'application/json', body })),
    ],
  }
}

describe('fetchConversationThreadRaw', () => {
  it('throws rather than returning an empty thread when the page has no token', async () => {
    const { req } = mockRequest([{ body: '<html></html>' }])
    await expect(fetchConversationThreadRaw(req, 'conv-1')).rejects.toBeInstanceOf(MissingVerificationTokenError)
  })

  it('seeds from GetConversationDetails, keyed on id, and records the exchange', async () => {
    const { req, calls } = mockRequest([{ body: TOKEN_PAGE }, json(DETAILS)])

    const raw = await fetchConversationThreadRaw(req, 'conv-1')

    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toContain('/api/conversations/GetConversationDetails')
    expect(calls[0]!.body.id).toBe('conv-1')
    expect(calls[0]!.body).not.toHaveProperty('conversationId')

    expect(raw.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      'GET /app/communication-center',
      'POST /api/conversations/GetConversationDetails',
    ])
    expect(raw.requests[1]!.requestBody).toMatchObject({ id: 'conv-1', maxReadMessages: 100 })
    expect(raw.requests[1]!.body).toEqual(DETAILS)
  })

  it('pages backwards through older messages until hasMoreMessages clears, recording every page', async () => {
    const { req, calls } = mockRequest([
      { body: TOKEN_PAGE },
      json({ ...DETAILS, hasMoreMessages: true, messages: [message('M3', '2026-03-03T00:00:00Z', NAMELESS_STAFF)] }),
      json({ hasMoreMessages: true, messages: [message('M2', '2026-03-02T00:00:00Z', NAMELESS_STAFF)] }),
      json({ hasMoreMessages: false, messages: [message('M1', '2026-03-01T00:00:00Z', NAMELESS_STAFF)] }),
    ])

    const raw = await fetchConversationThreadRaw(req, 'conv-1')

    // Every page asks for messages strictly older than the oldest one held.
    expect(calls.map((c) => c.body.startInstantISO)).toEqual([undefined, '2026-03-03T00:00:00Z', '2026-03-02T00:00:00Z'])
    expect(calls.slice(1).every((c) => c.url.includes('/api/conversations/GetConversationMessages'))).toBe(true)
    expect(calls.slice(1).every((c) => c.body.id === 'conv-1')).toBe(true)
    expect(raw.requests).toHaveLength(4)
  })

  it('stops when a page comes back empty even though hasMoreMessages stays set', async () => {
    const { req, calls } = mockRequest([
      { body: TOKEN_PAGE },
      json({ hasMoreMessages: true, messages: [message('M1', '2026-03-01T00:00:00Z', { empKey: 'E' })] }),
      json({ hasMoreMessages: true, messages: [] }),
    ])
    await fetchConversationThreadRaw(req, 'conv-1')
    expect(calls).toHaveLength(2)
  })

  it('stops at MAX_PAGES when the thread never stops claiming more', async () => {
    const page = (n: number) => json({
      hasMoreMessages: true,
      messages: [message(`M${n}`, `2026-03-${String(n).padStart(2, '0')}T00:00:00Z`, { empKey: 'E' })],
    })
    const { req, calls } = mockRequest([{ body: TOKEN_PAGE }, ...Array.from({ length: 60 }, (_, i) => page(60 - i))])
    await fetchConversationThreadRaw(req, 'conv-1')
    // The seed plus MAX_PAGES pages, and not one request more.
    expect(calls).toHaveLength(MAX_PAGES + 1)
  })

  // The failure this whole module exists to stop being: an error read as an
  // empty thread looks exactly like a conversation with nothing in it.
  it('throws rather than recording an empty thread when the endpoint fails', async () => {
    const { req } = mockRequest([
      { body: TOKEN_PAGE },
      { body: JSON.stringify({ Message: 'An error has occurred.' }), status: 500 },
    ])
    await expect(fetchConversationThreadRaw(req, 'conv-1')).rejects.toThrow('GetConversationDetails failed with status 500')
  })

  it('records a literal null from GetConversationDetails without paging', async () => {
    const { req, calls } = mockRequest([{ body: TOKEN_PAGE }, { body: 'null' }])
    const raw = await fetchConversationThreadRaw(req, 'conv-404')
    expect(calls).toHaveLength(1)
    expect(raw.requests[1]!.body).toBeNull()
  })

  it('stops paging if a later page answers null', async () => {
    const { req, calls } = mockRequest([
      { body: TOKEN_PAGE },
      json({ hasMoreMessages: true, messages: [message('M1', '2026-03-01T00:00:00Z', { empKey: 'E' })] }),
      { body: 'null' },
    ])
    await fetchConversationThreadRaw(req, 'conv-1')
    expect(calls).toHaveLength(2)
  })
})

describe('conversationThreadProcessor', () => {
  it('builds the standard object under MyChart names with names resolved through the maps', () => {
    const standard = conversationThreadProcessor.standard(envelope(DETAILS))
    expect(standard).toEqual({
      hthId: 'conv-1',
      subject: 'Follow-up',
      audience: [{ name: 'Julius Hibbert, MD' }],
      totalMessages: 2,
      numUnread: 1,
      truncated: false,
      messages: [
        {
          wmgId: 'MSG-001',
          deliveryInstantISO: '2026-01-10T14:30:00Z',
          senderName: 'Julius Hibbert, MD',
          isFromPatient: false,
          isUnread: false,
          bodyText: 'How are you feeling?',
          author: { empKey: 'PROV-HIBBERT', wprKey: null },
          attachments: [],
          tasks: [],
          suggestedActions: [],
        },
        {
          wmgId: 'MSG-002',
          deliveryInstantISO: '2026-01-10T15:45:00Z',
          senderName: 'Homer Simpson',
          isFromPatient: true,
          isUnread: false,
          bodyText: 'Much better, thanks.',
          author: { empKey: null, wprKey: 'WPR-HOMER' },
          attachments: [],
          tasks: [],
          suggestedActions: [],
        },
      ],
      replyFlags: { canReply: true, cannotReplyReason: 0 },
      hasPreviouslyViewed: true,
      hasAttachments: false,
      hasUrgentMsgs: false,
      hasTasks: false,
      messageType: 'MedicalAdvice',
      previewText: 'Much better, thanks.',
    })
    expect(standard).not.toHaveProperty('replyUrl')
    expect(standard).not.toHaveProperty('users')
  })

  it('merges every page ascending by deliveryInstantISO', () => {
    const standard = conversationThreadProcessor.standard(envelope(
      { ...DETAILS, hasMoreMessages: true, messages: [message('M3', '2026-03-03T00:00:00Z', NAMELESS_STAFF)] },
      { hasMoreMessages: true, messages: [message('M2', '2026-03-02T00:00:00Z', NAMELESS_STAFF)] },
      { hasMoreMessages: false, messages: [message('M1', '2026-03-01T00:00:00Z', NAMELESS_PATIENT)] },
    ))!
    expect(standard.messages.map((m) => m.wmgId)).toEqual(['M1', 'M2', 'M3'])
    expect(standard.messages.map((m) => m.senderName)).toEqual(['Homer Simpson', 'Julius Hibbert, MD', 'Julius Hibbert, MD'])
    expect(standard.truncated).toBe(false)
  })

  it('de-duplicates a message two pages both carry', () => {
    const standard = conversationThreadProcessor.standard(envelope(
      { ...DETAILS, hasMoreMessages: true, messages: [message('M2', '2026-03-02T00:00:00Z', NAMELESS_STAFF)] },
      { hasMoreMessages: false, messages: [message('M1', '2026-03-01T00:00:00Z', NAMELESS_STAFF), message('M2', '2026-03-02T00:00:00Z', NAMELESS_STAFF)] },
    ))!
    expect(standard.messages.map((m) => m.wmgId)).toEqual(['M1', 'M2'])
  })

  // A page's own userOverrideNames win over the shared users map, as the
  // portal's bundle resolves `userOverrideNames[empKey] || users[empKey].name`.
  it("prefers a page's userOverrideNames over the shared users map", () => {
    const standard = conversationThreadProcessor.standard(envelope(
      { ...DETAILS, hasMoreMessages: true, messages: [] },
      { hasMoreMessages: false, userOverrideNames: { 'PROV-HIBBERT': 'Springfield Spine Clinic' }, messages: [message('M1', '2026-03-01T00:00:00Z', NAMELESS_STAFF)] },
    ))!
    expect(standard.messages[0]!.senderName).toBe('Springfield Spine Clinic')
  })

  // The only way `truncated` is reachable: the scraper hit its page cap on a
  // non-empty page that still claimed older messages.
  it('reports truncated when the last recorded page is non-empty and still claims more', () => {
    const standard = conversationThreadProcessor.standard(envelope(
      { ...DETAILS, hasMoreMessages: true, messages: [message('M2', '2026-03-02T00:00:00Z', NAMELESS_STAFF)] },
      { hasMoreMessages: true, messages: [message('M1', '2026-03-01T00:00:00Z', NAMELESS_STAFF)] },
    ))!
    expect(standard.truncated).toBe(true)
  })

  it('does not report truncated for an empty or null final page', () => {
    const seed = { ...DETAILS, hasMoreMessages: true, messages: [message('M2', '2026-03-02T00:00:00Z', NAMELESS_STAFF)] }
    expect(conversationThreadProcessor.standard(envelope(seed, { hasMoreMessages: true, messages: [] }))!.truncated).toBe(false)
    expect(conversationThreadProcessor.standard(envelope(seed, null))!.truncated).toBe(false)
    expect(conversationThreadProcessor.standard(envelope(seed))!.truncated).toBe(true)
  })

  // All four live instances answer GetConversationDetails with 200 and a
  // literal `null` for an id they don't recognise; it passes through as-is.
  it('passes a literal null through as null', () => {
    expect(conversationThreadProcessor.standard(envelope(null))).toBeNull()
    expect(conversationThreadProcessor.concise(null)).toBeNull()
    expect(conversationThreadProcessor.standard({ requests: [] })).toBeNull()
  })

  it('emits every listed field as null on a thread with nothing in it', () => {
    const standard = conversationThreadProcessor.standard(envelope({ messages: [{}] }))!
    expect(standard).toMatchObject({
      hthId: null,
      subject: null,
      audience: [],
      totalMessages: null,
      numUnread: null,
      truncated: false,
      replyFlags: { canReply: null, cannotReplyReason: null },
      hasPreviouslyViewed: null,
      previewText: null,
    })
    expect(standard.messages[0]).toMatchObject({ wmgId: null, senderName: '', isFromPatient: false, bodyText: '' })
  })

  it('projects concise to identity, counts, truncation and every message', () => {
    const concise = conversationThreadProcessor.concise(conversationThreadProcessor.standard(envelope(DETAILS)))
    expect(concise).toEqual({
      hthId: 'conv-1',
      subject: 'Follow-up',
      audience: [{ name: 'Julius Hibbert, MD' }],
      totalMessages: 2,
      numUnread: 1,
      truncated: false,
      messages: [
        { deliveryInstantISO: '2026-01-10T14:30:00Z', senderName: 'Julius Hibbert, MD', isFromPatient: false, bodyText: 'How are you feeling?' },
        { deliveryInstantISO: '2026-01-10T15:45:00Z', senderName: 'Homer Simpson', isFromPatient: true, bodyText: 'Much better, thanks.' },
      ],
    })
  })
})

describe('getConversationMessages', () => {
  it('returns the standard object', async () => {
    const { req } = mockRequest([{ body: TOKEN_PAGE }, json(DETAILS)])
    const result = await getConversationMessages(req, 'conv-1')
    expect(result!.subject).toBe('Follow-up')
    expect(result!.messages.map((m) => m.wmgId)).toEqual(['MSG-001', 'MSG-002'])
  })

  it('returns null for an unknown conversation', async () => {
    const { req } = mockRequest([{ body: TOKEN_PAGE }, { body: 'null' }])
    expect(await getConversationMessages(req, 'conv-404')).toBeNull()
  })
})
