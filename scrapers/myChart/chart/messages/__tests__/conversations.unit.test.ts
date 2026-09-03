import { describe, it, expect, mock } from 'bun:test'
import {
  listConversations,
  fetchConversationsRaw,
  conversationsProcessor,
  type MessageStandard,
} from '../conversations'
import { isFromPatient, messageDirectory, messageStandard, senderName } from '../conversations.processor'
import { MyChartRequest } from '../../../core/myChartRequest'
import { MissingVerificationTokenError } from '../../../core/util'
import type { RawResponse } from '../../../core/rawResponse'

function mockRequest(responses: Array<{ body: string }>) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  const calls: Array<{ url: string; init?: RequestInit | undefined }> = []
  let i = 0
  req.transport = mock(async (url: string, init?: RequestInit) => {
    calls.push({ url: url.toString(), init })
    const r = responses[i++]
    return new Response(r!.body, { status: 200, headers: { 'content-type': 'application/json' } })
  })
  return { req, calls }
}

const TOKEN_PAGE = '<input name="__RequestVerificationToken" value="csrf_tok" />'

/** MyChart's real listing shape: names live in `users` / `viewers`, never on the author. */
const LISTING = {
  legacyXUnreadCount: 2,
  conversations: [
    {
      hthId: 'HTH-1',
      subject: 'Lab Results Question',
      previewText: 'Your recent results look normal.',
      tags: { Messages: false, Unread: true },
      hasAttachments: false,
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
          attachments: [{ type: 0, dcsId: 'd', etxId: 'e', name: 'results.pdf', fileExtension: 'pdf', legacyUrlForCommunityJump: '', organizationId: '' }],
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
  localSummary: { hasMoreConversations: true, newestLoadedInstantISO: 'n', numberLoaded: 1, oldestLoadedInstantISO: '2026-01-01T00:00:00Z', pagingInfo: 0 },
  users: { 'EMP-HIBBERT': { empId: 'E1', name: 'Julius Hibbert, MD', photoUrl: '' } },
  viewers: { 'WPR-HOMER': { wprId: 'W1', name: 'Homer Simpson', isSelf: true } },
  externalSummaries: {},
}

describe('fetchConversationsRaw', () => {
  it('throws rather than returning an empty inbox when the page has no token', async () => {
    const { req, calls } = mockRequest([{ body: '<html></html>' }])
    await expect(fetchConversationsRaw(req)).rejects.toBeInstanceOf(MissingVerificationTokenError)
    expect(calls).toHaveLength(1)
  })

  it('records the communication-center page and the listing POST', async () => {
    const { req, calls } = mockRequest([{ body: TOKEN_PAGE }, { body: JSON.stringify(LISTING) }])
    const raw = await fetchConversationsRaw(req)

    expect(raw.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      'GET /app/communication-center',
      'POST /api/conversations/GetConversationList',
    ])
    expect(raw.requests[1]!.body).toEqual(LISTING)
    expect(raw.requests[1]!.requestBody).toMatchObject({ tag: 1, searchQuery: '', localLoadParams: { pagingInfo: 1 } })

    const headers = calls[1]!.init!.headers as Record<string, string>
    expect(headers['__RequestVerificationToken']).toBe('csrf_tok')
    expect(headers['Content-Type']).toBe('application/json; charset=utf-8')
  })
})

describe('conversationsProcessor', () => {
  const raw: RawResponse = {
    requests: [
      { path: '/app/communication-center', method: 'GET', status: 200, contentType: 'text/html', body: TOKEN_PAGE },
      { path: '/api/conversations/GetConversationList', method: 'POST', status: 200, contentType: 'application/json', body: LISTING },
    ],
  }

  it('builds the standard object under MyChart names with the derived message fields', () => {
    const standard = conversationsProcessor.standard(raw)
    expect(standard.legacyXUnreadCount).toBe(2)
    expect(standard.localSummary).toEqual({ hasMoreConversations: true, oldestLoadedInstantISO: '2026-01-01T00:00:00Z' })
    expect(standard.conversations).toHaveLength(1)

    const c = standard.conversations[0]!
    expect(c).toMatchObject({
      hthId: 'HTH-1',
      subject: 'Lab Results Question',
      audience: [{ name: 'Julius Hibbert, MD' }],
      tags: { Unread: true },
      hasUrgentMsgs: false,
      hasMoreMessages: true,
      previewText: 'Your recent results look normal.',
      hasAttachments: false,
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
      bodyText: 'Your recent results look normal.\nSee you next month.',
      author: { empKey: 'EMP-HIBBERT', wprKey: null },
      attachments: [{ name: 'results.pdf', fileExtension: 'pdf' }],
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

  it('emits every listed field even when the listing is empty', () => {
    const standard = conversationsProcessor.standard({
      requests: [{ path: '/api/conversations/GetConversationList', method: 'POST', status: 200, contentType: 'application/json', body: { conversations: [] } }],
    })
    expect(standard).toEqual({
      legacyXUnreadCount: null,
      conversations: [],
      localSummary: { hasMoreConversations: null, oldestLoadedInstantISO: null },
    })
  })

  it('keeps a message with nothing in it as nulls rather than dropping it', () => {
    const standard = conversationsProcessor.standard({
      requests: [{ path: '/api/conversations/GetConversationList', method: 'POST', status: 200, contentType: 'application/json', body: { conversations: [{ messages: [{}] }] } }],
    })
    expect(standard.conversations[0]!.messages[0]).toEqual({
      wmgId: null,
      deliveryInstantISO: null,
      senderName: '',
      isFromPatient: false,
      isUnread: null,
      bodyText: '',
      author: { empKey: null, wprKey: null },
      attachments: [],
      tasks: [],
      suggestedActions: [],
    })
    expect(standard.conversations[0]!.tags).toEqual({ Unread: null })
  })

  it('projects concise to the who / what / when fields', () => {
    const concise = conversationsProcessor.concise(conversationsProcessor.standard(raw)) as {
      legacyXUnreadCount: number
      conversations: Array<Record<string, unknown> & { messages: Array<Record<string, unknown>> }>
    }
    expect(concise.legacyXUnreadCount).toBe(2)
    expect(Object.keys(concise.conversations[0]!)).toEqual([
      'hthId', 'subject', 'audience', 'tags', 'hasUrgentMsgs', 'hasMoreMessages', 'previewText', 'messages',
    ])
    expect(concise.conversations[0]!.messages[0]).toEqual({
      deliveryInstantISO: '2026-01-10T14:30:00Z',
      senderName: 'Julius Hibbert, MD',
      isFromPatient: false,
      bodyText: 'Your recent results look normal.\nSee you next month.',
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
    const { req } = mockRequest([{ body: TOKEN_PAGE }, { body: JSON.stringify(LISTING) }])
    const result = await listConversations(req)
    expect(result.conversations[0]!.subject).toBe('Lab Results Question')
    expect(result.conversations[0]!.messages[1]!.senderName).toBe('Homer Simpson')
  })
})
