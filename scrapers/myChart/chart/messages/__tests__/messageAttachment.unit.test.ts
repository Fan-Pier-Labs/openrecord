import { describe, it, expect, mock } from 'bun:test'
import { downloadMessageAttachment } from '../messageAttachment'
import { MyChartRequest } from '../../../core/myChartRequest'

/**
 * The portal's own sequence, as measured on two live instances: the thread
 * (for the attachment's own extension and organization), the details call,
 * then the mount-relative download link it returns.
 */
const TOKEN_PAGE = '<input name="__RequestVerificationToken" value="csrf_tok" />'

const ATTACHMENT = {
  type: 2,
  dcsId: 'WP-DCS-1',
  etxId: '',
  name: 'insurance card.jpg',
  fileExtension: 'JPG',
  legacyUrlForCommunityJump: '',
  organizationId: '',
}

const thread = (attachments: unknown[] = [ATTACHMENT]) => ({
  hthId: 'CONV-1',
  subject: 'Insurance',
  totalMessages: 1,
  numUnread: 0,
  hasMoreMessages: false,
  users: {},
  viewers: {},
  messages: [
    {
      wmgId: 'MSG-1',
      deliveryInstantISO: '2026-01-10T14:30:00Z',
      body: 'Attached.',
      author: { displayName: '', wprKey: 'WPR-HOMER' },
      isUnread: false,
      attachments,
      tasks: [],
      suggestedActions: [],
    },
  ],
})

const DETAILS = {
  dcsId: 'WP-DCS-1',
  token: 'tok',
  orgId: '',
  displayName: 'MyChart_Document_1',
  userFriendlyDisplayName: '',
  legacyEncryption: true,
  isMobile: false,
  fileDescription: 'insurance card.jpg',
  allowPreview: true,
  downloadUrl: '/Documents/ViewDocument/Download?dcsid=WP-DCS-1&displayName=MyChart_Document_1&dcsExt=JPG',
  previewUrl: '/Documents/ViewDocument/Download?dcsid=WP-DCS-1&dcsExt=JPG&method=preview',
  mimeType: 'image/jpeg',
}

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])

type Canned = { body: string | Uint8Array; status?: number; contentType?: string | null }
type Call = { url: string; method: string; body?: unknown; headers: Record<string, string> }

function mockRequest(responses: Canned[]) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  const calls: Call[] = []
  let i = 0
  req.transport = mock(async (url: string, init: RequestInit) => {
    calls.push({
      url,
      method: init.method ?? 'GET',
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
      headers: (init.headers ?? {}) as Record<string, string>,
    })
    const r = responses[i++]
    if (!r) throw new Error(`unexpected request #${i}: ${url}`)
    const headers: Record<string, string> = {}
    const contentType = r.contentType === undefined ? (typeof r.body === 'string' ? 'application/json' : 'application/octet-stream') : r.contentType
    if (contentType) headers['content-type'] = contentType
    return new Response(r.body as BodyInit, { status: r.status ?? 200, headers })
  })
  return { req, calls }
}

const json = (payload: unknown): Canned => ({ body: JSON.stringify(payload) })
const page = (): Canned => ({ body: TOKEN_PAGE, contentType: 'text/html' })

describe('downloadMessageAttachment', () => {
  it('reads the thread, asks for the document details, and downloads the link they carry', async () => {
    const { req, calls } = mockRequest([
      page(), json(thread()),
      page(), json(DETAILS),
      { body: JPEG, contentType: 'image/jpeg' },
    ])
    const file = await downloadMessageAttachment(req, 'CONV-1', 'WP-DCS-1')

    expect(file).toEqual({
      conversationId: 'CONV-1',
      dcsId: 'WP-DCS-1',
      name: 'insurance card.jpg',
      fileExtension: 'JPG',
      mimeType: 'image/jpeg',
      bytes: JPEG,
    })

    expect(calls.map((c) => `${c.method} ${c.url.replace(/[?&]noCache=[^&]*/, '')}`)).toEqual([
      'GET https://mychart.example.com/MyChart/app/communication-center',
      'POST https://mychart.example.com/MyChart/api/conversations/GetConversationDetails',
      'GET https://mychart.example.com/MyChart/app/communication-center',
      'POST https://mychart.example.com/MyChart/api/documents/viewer/GetDocumentDetailsLegacy',
      'GET https://mychart.example.com/MyChart/Documents/ViewDocument/Download?dcsid=WP-DCS-1&displayName=MyChart_Document_1&dcsExt=JPG',
    ])
    // The body the portal's useDcsDocument hook posts, with the attachment's
    // own extension and organization rather than anything guessed.
    expect(calls[3]!.body).toEqual({ dcsId: 'WP-DCS-1', fileExtension: 'JPG', organizationId: '', useOldMobileLink: false })
    expect(calls[3]!.headers['__RequestVerificationToken']).toBe('csrf_tok')
  })

  it('falls back to the download’s Content-Type when the details carry no mimeType', async () => {
    const { req } = mockRequest([
      page(), json(thread()),
      page(), json({ ...DETAILS, mimeType: '' }),
      { body: JPEG, contentType: 'image/jpeg; charset=binary' },
    ])
    const file = await downloadMessageAttachment(req, 'CONV-1', 'WP-DCS-1')
    expect(file.mimeType).toBe('image/jpeg')
  })

  it('refuses an unknown conversation rather than downloading nothing', async () => {
    // GetConversationDetails answers an unknown id with a literal JSON null.
    const { req, calls } = mockRequest([page(), json(null)])
    await expect(downloadMessageAttachment(req, 'CONV-404', 'WP-DCS-1')).rejects.toThrow(/No conversation CONV-404/)
    expect(calls).toHaveLength(2)
  })

  it('names the attachments the thread does have when the id matches none of them', async () => {
    const { req, calls } = mockRequest([page(), json(thread())])
    await expect(downloadMessageAttachment(req, 'CONV-1', 'WP-DCS-9')).rejects.toThrow(
      'No attachment WP-DCS-9 on conversation CONV-1. The attachments on that conversation are: insurance card.jpg (attachment_id WP-DCS-1).',
    )
    expect(calls).toHaveLength(2)
  })

  it('refuses an attachment that is not a downloadable document', async () => {
    const clinicalReference = { ...ATTACHMENT, type: 1, dcsId: '', etxId: 'WP-ETX-1', name: 'Care instructions' }
    const { req } = mockRequest([page(), json(thread([clinicalReference]))])
    await expect(downloadMessageAttachment(req, 'CONV-1', 'WP-ETX-1')).rejects.toThrow(/not a downloadable document \(MyChart type 1\)/)
  })

  it('refuses a community-jump attachment held by another organization', async () => {
    const community = { ...ATTACHMENT, legacyUrlForCommunityJump: '/CommunityJump?x=1' }
    const { req } = mockRequest([page(), json(thread([community]))])
    await expect(downloadMessageAttachment(req, 'CONV-1', 'WP-DCS-1')).rejects.toThrow(/another organization's portal/)
  })

  // Measured live on two instances: an id the record does not hold gets 200
  // and a literal JSON null from the details call, not an error status.
  it('treats a null from GetDocumentDetailsLegacy as "no such document", not as an empty file', async () => {
    const { req, calls } = mockRequest([page(), json(thread()), page(), json(null)])
    await expect(downloadMessageAttachment(req, 'CONV-1', 'WP-DCS-1')).rejects.toThrow(/has no document WP-DCS-1/)
    expect(calls).toHaveLength(4)
  })

  it('throws when the details carry no download link', async () => {
    const { req } = mockRequest([page(), json(thread()), page(), json({ ...DETAILS, downloadUrl: '' })])
    await expect(downloadMessageAttachment(req, 'CONV-1', 'WP-DCS-1')).rejects.toThrow(/no download link/)
  })

  // Also measured live: a bogus id on the download GET is 200, no
  // Content-Type, empty body — which must never come back as a zero-byte file.
  it('throws on a 200 with an empty body where the file should be', async () => {
    const { req } = mockRequest([page(), json(thread()), page(), json(DETAILS), { body: '', contentType: null }])
    await expect(downloadMessageAttachment(req, 'CONV-1', 'WP-DCS-1')).rejects.toThrow(/an empty body; nothing was downloaded/)
  })

  it('throws on a web page where the file should be', async () => {
    const { req } = mockRequest([
      page(), json(thread()), page(), json(DETAILS),
      { body: '<html><title>Home</title></html>', contentType: 'text/html' },
    ])
    await expect(downloadMessageAttachment(req, 'CONV-1', 'WP-DCS-1')).rejects.toThrow(/a web page instead of the file/)
  })

  it('throws on a non-2xx download', async () => {
    const { req } = mockRequest([page(), json(thread()), page(), json(DETAILS), { body: 'nope', status: 500, contentType: 'text/plain' }])
    await expect(downloadMessageAttachment(req, 'CONV-1', 'WP-DCS-1')).rejects.toThrow(/HTTP 500/)
  })
})
