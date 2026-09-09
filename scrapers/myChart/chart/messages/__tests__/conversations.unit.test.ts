import { describe, it, expect, mock } from 'bun:test'
import {
  listConversations,
  fetchConversationsRaw,
  conversationsProcessor,
  MAX_PAGES,
  type MessageStandard,
} from '../conversations'
import { isFromPatient, messageDirectory, messageStandard, senderName } from '../conversations.processor'
import { MyChartRequest } from '../../../core/myChartRequest'
import { MissingVerificationTokenError } from '../../../core/util'
import type { RawResponse } from '../../../core/rawResponse'

type Call = { url: string; init?: RequestInit | undefined; body: Record<string, unknown> | null }

function mockRequest(responses: Array<{ body: string }>) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  const calls: Call[] = []
  let i = 0
  req.transport = mock(async (url: string, init?: RequestInit) => {
    calls.push({ url: url.toString(), init, body: init?.method === 'POST' ? JSON.parse(init.body as string) : null })
    const r = responses[i++]
    return new Response(r!.body, { status: 200, headers: { 'content-type': 'application/json' } })
  })
  return { req, calls }
}

const TOKEN_PAGE = '<input name="__RequestVerificationToken" value="csrf_tok" />'

const ATTACHMENT = { type: 2, dcsId: 'WP-DCS-1', etxId: '', name: 'results.pdf', fileExtension: 'PDF', legacyUrlForCommunityJump: '', organizationId: '' }

/** MyChart's real listing shape: names live in `users` / `viewers`, never on the author. */
const LISTING = {
  legacyXUnreadCount: 2,
  conversations: [
    {
      hthId: 'HTH-1',
      subject: 'Lab Results Question',
      previewText: 'Your recent results look normal.',
      tags: { Messages: false, Unread: true },
      hasAttachments: true,
      hasTasks: false,
      hasUrgentMsgs: false,
      hasMoreMessages: true,
      messageType: 'MedicalAdvice',
      audience: [{ empId: 'E1', hipId: '', name: 'Julius Hibbert, MD', providerId: 'P1' }],
      legacyMessageDetailsUrl: '/x',
      organizationId: '',
      userOverrideNames: {},
      messages: [
        {
          wmgId: 'MSG-1',
          isUnread: true,
          deliveryInstantISO: '2026-01-10T14:30:00Z',
          body: '<p>Your recent results look <b>normal</b>.</p><p>See you next month.</p>',
          author: { displayName: '', empKey: 'EMP-HIBBERT' },
          attachments: [ATTACHMENT],
          tasks: [],
          suggestedActions: [],
        },
        {
          wmgId: 'MSG-2',
          isUnread: false,
          deliveryInstantISO: '2026-01-10T15:45:00Z',
          body: 'Thanks doctor',
          author: { displayName: '', wprKey: 'WPR-HOMER' },
          attachments: [],
          tasks: [{ taskId: 't1' }],
          suggestedActions: [],
        },
      ],
    },
  ],
  localSummary: { hasMoreConversations: true, newestLoadedInstantISO: '2026-01-10T15:45:00Z', numberLoaded: 1, oldestLoadedInstantISO: '2026-01-10T15:45:00Z', pagingInfo: 0 },
  users: { 'EMP-HIBBERT': { empId: 'E1', name: 'Julius Hibbert, MD', photoUrl: '' } },
  viewers: { 'WPR-HOMER': { wprId: 'W1', name: 'Homer Simpson', isSelf: true } },
  externalSummaries: {},
}

/** The second (and last) page: one older thread, nothing beyond it. */
const PAGE_2 = {
  legacyXUnreadCount: 2,
  conversations: [
    {
      hthId: 'HTH-2',
      subject: 'Flu shot',
      previewText: 'Booked.',
      tags: { Messages: false, Unread: false },
      hasAttachments: false,
      hasTasks: false,
      hasUrgentMsgs: true,
      hasMoreMessages: false,
      messageType: '',
      audience: [{ name: 'Springfield Clinic' }],
      userOverrideNames: {},
      messages: [
        { wmgId: 'MSG-9', isUnread: false, deliveryInstantISO: '2025-10-01T09:00:00Z', body: 'Booked.', author: { displayName: '', empKey: 'EMP-HIBBERT' }, attachments: [], tasks: [], suggestedActions: [] },
      ],
    },
  ],
  localSummary: { hasMoreConversations: false, newestLoadedInstantISO: '2025-10-01T09:00:00Z', numberLoaded: 1, oldestLoadedInstantISO: '2025-10-01T09:00:00Z', pagingInfo: 0 },
  users: { 'EMP-HIBBERT': { name: 'Julius Hibbert, MD' } },
  viewers: {},
}

const json = (payload: unknown) => ({ body: JSON.stringify(payload) })

function envelope(...pages: unknown[]): RawResponse {
  return {
    requests: [
      { path: '/app/communication-center', method: 'GET', status: 200, contentType: 'text/html', body: TOKEN_PAGE },
      ...pages.map((body) => ({ path: '/api/conversations/GetConversationList', method: 'POST' as const, status: 200, contentType: 'application/json', body })),
    ],
  }
}

describe('fetchConversationsRaw', () => {
  it('throws rather than returning an empty inbox when the page has no token', async () => {
    const { req, calls } = mockRequest([{ body: '<html></html>' }])
    await expect(fetchConversationsRaw(req)).rejects.toBeInstanceOf(MissingVerificationTokenError)
    expect(calls).toHaveLength(1)
  })

  it('records the communication-center page and every listing page, asking for each with the previous oldest instant', async () => {
    const { req, calls } = mockRequest([{ body: TOKEN_PAGE }, json(LISTING), json(PAGE_2)])
    const raw = await fetchConversationsRaw(req)

    expect(raw.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      'GET /app/communication-center',
      'POST /api/conversations/GetConversationList',
      'POST /api/conversations/GetConversationList',
    ])
    expect(raw.requests[1]!.body).toEqual(LISTING)
    expect(raw.requests[2]!.body).toEqual(PAGE_2)

    // The first page is the portal's opening request; the second carries the
    // first page's oldestLoadedInstantISO and pagingInfo, as the portal's
    // own load-more does.
    expect(calls[1]!.body).toMatchObject({ tag: 1, searchQuery: '', localLoadParams: { loadStartInstantISO: '', loadEndInstantISO: '', pagingInfo: 1 } })
    expect(calls[2]!.body).toMatchObject({ tag: 1, localLoadParams: { loadStartInstantISO: '2026-01-10T15:45:00Z', loadEndInstantISO: '', pagingInfo: 0 } })

    const headers = calls[1]!.init!.headers as Record<string, string>
    expect(headers['__RequestVerificationToken']).toBe('csrf_tok')
    expect(headers['Content-Type']).toBe('application/json; charset=utf-8')
  })

  it('stops after one page when the summary says there is nothing older', async () => {
    const { req, calls } = mockRequest([{ body: TOKEN_PAGE }, json(PAGE_2)])
    await fetchConversationsRaw(req)
    expect(calls).toHaveLength(2)
  })

  it('stops when a page comes back empty, or ends where the last one did, even though hasMoreConversations stays set', async () => {
    const empty = mockRequest([{ body: TOKEN_PAGE }, json(LISTING), json({ conversations: [], localSummary: { hasMoreConversations: true, oldestLoadedInstantISO: '2020-01-01T00:00:00Z' } })])
    await fetchConversationsRaw(empty.req)
    expect(empty.calls).toHaveLength(3)

    const stuck = mockRequest([{ body: TOKEN_PAGE }, json(LISTING), json(LISTING)])
    await fetchConversationsRaw(stuck.req)
    expect(stuck.calls).toHaveLength(3)
  })

  it('stops at MAX_PAGES when the inbox never stops claiming more', async () => {
    const page = (n: number) => json({
      conversations: [{ hthId: `HTH-${n}`, messages: [] }],
      localSummary: { hasMoreConversations: true, oldestLoadedInstantISO: `2025-01-01T00:00:${String(n).padStart(2, '0')}Z`, pagingInfo: 0 },
    })
    const { req, calls } = mockRequest([{ body: TOKEN_PAGE }, ...Array.from({ length: 60 }, (_, i) => page(59 - i))])
    await fetchConversationsRaw(req)
    expect(calls).toHaveLength(MAX_PAGES + 1)
  })
})

describe('conversationsProcessor', () => {
  const raw = envelope(LISTING)

  it('builds the standard object under MyChart names with the derived message and thread fields', () => {
    const standard = conversationsProcessor.standard(raw)
    expect(standard.legacyXUnreadCount).toBe(2)
    expect(standard.localSummary).toEqual({ hasMoreConversations: true, oldestLoadedInstantISO: '2026-01-10T15:45:00Z' })
    expect(standard.conversations).toHaveLength(1)

    const c = standard.conversations[0]!
    expect(c).toMatchObject({
      hthId: 'HTH-1',
      subject: 'Lab Results Question',
      audience: [{ name: 'Julius Hibbert, MD' }],
      audienceNames: ['Julius Hibbert, MD'],
      latestMessageInstantISO: '2026-01-10T15:45:00Z',
      tags: { Unread: true },
      hasUnreadMessages: true,
      hasUrgentMsgs: false,
      hasMoreMessages: true,
      previewText: 'Your recent results look normal.',
      hasAttachments: true,
      hasTasks: false,
      messageType: 'MedicalAdvice',
    })
    expect(c).not.toHaveProperty('legacyMessageDetailsUrl')
    expect(c).not.toHaveProperty('userOverrideNames')

    expect(c.messages[0]).toEqual({
      wmgId: 'MSG-1',
      deliveryInstantISO: '2026-01-10T14:30:00Z',
      senderName: 'Julius Hibbert, MD',
      isFromPatient: false,
      isUnread: true,
      bodyText: 'Your recent results look normal.\n\nSee you next month.',
      author: { empKey: 'EMP-HIBBERT', wprKey: null },
      attachments: [{ name: 'results.pdf', fileExtension: 'PDF', dcsId: 'WP-DCS-1', type: 2 }],
      tasks: [],
      suggestedActions: [],
    })
    expect(c.messages[1]).toMatchObject({
      senderName: 'Homer Simpson',
      isFromPatient: true,
      bodyText: 'Thanks doctor',
      tasks: [{ taskId: 't1' }],
    })
    // Markup stays in raw.
    expect(c.messages[0]).not.toHaveProperty('body')
    expect(standard).not.toHaveProperty('users')
  })

  it('merges every page in inbox order, de-duplicating a thread two pages both carry', () => {
    const standard = conversationsProcessor.standard(envelope(LISTING, { ...PAGE_2, conversations: [...LISTING.conversations, ...PAGE_2.conversations] }))
    expect(standard.conversations.map((c) => c.hthId)).toEqual(['HTH-1', 'HTH-2'])
    // The page's own name maps resolve its messages.
    expect(standard.conversations[1]!.messages[0]!.senderName).toBe('Julius Hibbert, MD')
    // The unread count comes from the first page; the paging summary from the last.
    expect(standard.legacyXUnreadCount).toBe(2)
    expect(standard.localSummary.hasMoreConversations).toBe(false)
    expect(standard.truncated).toBe(false)
  })

  // The only way `truncated` is reachable: the scraper stopped on a non-empty
  // page that still claimed older threads.
  it('reports truncated only when the last page is non-empty and still claims more', () => {
    expect(conversationsProcessor.standard(envelope(LISTING)).truncated).toBe(true)
    expect(conversationsProcessor.standard(envelope(LISTING, PAGE_2)).truncated).toBe(false)
    expect(conversationsProcessor.standard(envelope(LISTING, { conversations: [], localSummary: { hasMoreConversations: true } })).truncated).toBe(false)
  })

  // The scraper also stops when a page ends at the instant it asked to start
  // from: the server repeating itself, not an inbox with more to read.
  it('does not report truncated when the last page ends where the scraper asked it to start', () => {
    const repeated: RawResponse = {
      requests: [
        { path: '/app/communication-center', method: 'GET', status: 200, contentType: 'text/html', body: TOKEN_PAGE },
        { path: '/api/conversations/GetConversationList', method: 'POST', status: 200, contentType: 'application/json', body: LISTING },
        {
          path: '/api/conversations/GetConversationList', method: 'POST', status: 200, contentType: 'application/json', body: LISTING,
          requestBody: { localLoadParams: { loadStartInstantISO: LISTING.localSummary.oldestLoadedInstantISO } },
        },
      ],
    }
    expect(conversationsProcessor.standard(repeated).truncated).toBe(false)
  })

  it('emits every listed field even when the listing is empty', () => {
    const standard = conversationsProcessor.standard({
      requests: [{ path: '/api/conversations/GetConversationList', method: 'POST', status: 200, contentType: 'application/json', body: { conversations: [] } }],
    })
    expect(standard).toEqual({
      legacyXUnreadCount: null,
      truncated: false,
      conversations: [],
      localSummary: { hasMoreConversations: null, oldestLoadedInstantISO: null },
    })
  })

  it('keeps a message with nothing in it as nulls rather than dropping it', () => {
    const standard = conversationsProcessor.standard({
      requests: [{ path: '/api/conversations/GetConversationList', method: 'POST', status: 200, contentType: 'application/json', body: { conversations: [{ messages: [{ attachments: [{}] }] }] } }],
    })
    expect(standard.conversations[0]!.messages[0]).toEqual({
      wmgId: null,
      deliveryInstantISO: null,
      senderName: '',
      isFromPatient: false,
      isUnread: null,
      bodyText: '',
      author: { empKey: null, wprKey: null },
      attachments: [{ name: null, fileExtension: null, dcsId: null, type: null }],
      tasks: [],
      suggestedActions: [],
    })
    expect(standard.conversations[0]!).toMatchObject({ tags: { Unread: null }, hasUnreadMessages: null, audienceNames: [], latestMessageInstantISO: null })
  })

  // A thread per row and no messages: the listing only ever inlines the newest
  // five anyway, and the hthId is what get_message_thread takes.
  it('projects concise to one flat row per thread — id, subject, who, when and the flags — and never the messages', () => {
    const concise = conversationsProcessor.concise(conversationsProcessor.standard(envelope(LISTING, PAGE_2)))
    expect(concise).toEqual({
      legacyXUnreadCount: 2,
      truncated: false,
      conversations: [
        { hthId: 'HTH-1', subject: 'Lab Results Question', audienceNames: ['Julius Hibbert, MD'], latestMessageInstantISO: '2026-01-10T15:45:00Z', hasUnreadMessages: true, hasUrgentMsgs: false, hasAttachments: true },
        { hthId: 'HTH-2', subject: 'Flu shot', audienceNames: ['Springfield Clinic'], latestMessageInstantISO: '2025-10-01T09:00:00Z', hasUnreadMessages: false, hasUrgentMsgs: true, hasAttachments: false },
      ],
    })
  })
})

describe('senderName / isFromPatient', () => {
  const directory = messageDirectory(
    { users: { 'EMP-1': { name: 'Julius Hibbert, MD' } }, viewers: { 'WPR-1': { name: 'Homer Simpson' } } },
    { userOverrideNames: { 'EMP-2': 'Springfield Spine Clinic' } },
  )

  it('resolves a viewer key through viewers', () => {
    expect(senderName({ displayName: '', wprKey: 'WPR-1' }, directory)).toBe('Homer Simpson')
  })

  it('resolves a staff key through userOverrideNames before users', () => {
    expect(senderName({ displayName: '', empKey: 'EMP-1' }, directory)).toBe('Julius Hibbert, MD')
    expect(senderName({ displayName: 'ignored', empKey: 'EMP-2' }, directory)).toBe('Springfield Spine Clinic')
  })

  it('falls back to displayName only when no map has the key', () => {
    expect(senderName({ displayName: 'Dr. Nobody', empKey: 'EMP-9' }, directory)).toBe('Dr. Nobody')
    expect(senderName({ displayName: 'Someone' }, directory)).toBe('Someone')
    expect(senderName(undefined, directory)).toBe('')
  })

  it('attributes a message to the patient only when it carries a viewer key and no staff key', () => {
    expect(isFromPatient({ wprKey: 'WPR-1' })).toBe(true)
    expect(isFromPatient({ wprKey: 'WPR-1', empKey: '' })).toBe(true)
    expect(isFromPatient({ empKey: 'EMP-1', wprKey: '' })).toBe(false)
    expect(isFromPatient({ empKey: 'EMP-1', wprKey: 'WPR-1' })).toBe(false)
    expect(isFromPatient({})).toBe(false)
  })

  it('strips markup from the body into bodyText', () => {
    const m: MessageStandard = messageStandard({ body: 'Line one<br>Line two<ul><li>a</li><li>b</li></ul>' }, directory)
    expect(m.bodyText).toBe('Line one\nLine two\n- a\n- b')
  })
})

describe('listConversations', () => {
  it('returns the standard object', async () => {
    const { req } = mockRequest([{ body: TOKEN_PAGE }, json(LISTING), json(PAGE_2)])
    const result = await listConversations(req)
    expect(result.conversations.map((c) => c.subject)).toEqual(['Lab Results Question', 'Flu shot'])
    expect(result.conversations[0]!.messages[1]!.senderName).toBe('Homer Simpson')
  })
})
