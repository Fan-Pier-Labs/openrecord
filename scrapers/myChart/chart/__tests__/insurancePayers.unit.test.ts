import { describe, it, expect, mock } from 'bun:test'
import { getInsurancePayers, GET_PAYORS_PATH } from '../insurancePayers'
import { MyChartRequest } from '../../core/myChartRequest'

type Reply = { body: string; status?: number; headers?: Record<string, string> }

type Sent = { path: string; method: string; headers: Record<string, string>; body: unknown }

/** Replies in order, recording what was sent so the request shape can be asserted. */
function mockRequest(replies: Reply[]) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  const sent: Sent[] = []
  let i = 0
  req.transport = mock(async (url: string, init?: RequestInit) => {
    sent.push({
      path: new URL(url).pathname,
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body,
    })
    const reply = replies[i++]
    if (!reply) throw new Error(`unexpected request ${i}: ${url}`)
    return new Response(reply.body, { status: reply.status ?? 200, headers: reply.headers ?? {} })
  })
  return { req, sent }
}

/** `/Home/CSRFToken` answering with the JSON envelope, one of its real shapes. */
const TOKEN_REPLY: Reply = { body: JSON.stringify({ Token: 'tok' }) }

// One entry exactly as the four captured instances return it: Fields is a
// name → 1|2 map, SortKey and NameUTF8 are null, SampleCardImages is empty.
const SPRINGFIELD_MUTUAL = {
  Fields: { MemberId: 2, SubscriberDateOfBirth: 1, SubscriberFirstName: 2, SubscriberId: 1, SubscriberLastName: 2 },
  SampleCardImages: [],
  CanUpload: true,
  IsNonConfiguredPayer: false,
  SortKey: null,
  ID: 'WP-24abc-3D-3D-24def-2Fghi-3D',
  Name: 'Springfield Mutual Health',
  NameUTF8: null,
}

function payorReplies(payors: unknown[]): Reply[] {
  return [TOKEN_REPLY, { body: JSON.stringify({ Payors: payors }) }]
}

describe('getInsurancePayers', () => {
  it('maps the PascalCase catalogue and decodes the field requirement levels', async () => {
    const { req } = mockRequest(payorReplies([
      SPRINGFIELD_MUTUAL,
      { ...SPRINGFIELD_MUTUAL, ID: 'WP-2', Name: 'Shelbyville Blue', Fields: { MemberId: 2 }, CanUpload: false },
      { ...SPRINGFIELD_MUTUAL, ID: 'WP-3', Name: 'Other payer', Fields: { MemberId: 2, GroupNumber: 1 }, IsNonConfiguredPayer: true },
    ]))

    const result = await getInsurancePayers(req)

    expect(result.scope).toBe('organization')
    expect(result.payers).toEqual([
      {
        id: 'WP-24abc-3D-3D-24def-2Fghi-3D',
        name: 'Springfield Mutual Health',
        fields: {
          MemberId: 'required',
          SubscriberDateOfBirth: 'optional',
          SubscriberFirstName: 'required',
          SubscriberId: 'optional',
          SubscriberLastName: 'required',
        },
        canUploadCard: true,
        isNonConfigured: false,
      },
      { id: 'WP-2', name: 'Shelbyville Blue', fields: { MemberId: 'required' }, canUploadCard: false, isNonConfigured: false },
      {
        id: 'WP-3',
        name: 'Other payer',
        fields: { MemberId: 'required', GroupNumber: 'optional' },
        canUploadCard: true,
        isNonConfigured: true,
      },
    ])
  })

  it('posts the legacy form exactly as the Insurance page does, with the antiforgery token', async () => {
    const { req, sent } = mockRequest(payorReplies([SPRINGFIELD_MUTUAL]))

    await getInsurancePayers(req)

    const post = sent.find((s) => s.path.endsWith(GET_PAYORS_PATH))!
    expect(post.method).toBe('POST')
    expect(post.headers['__RequestVerificationToken']).toBe('tok')
    expect(post.headers['Content-Type']).toContain('application/x-www-form-urlencoded')
    expect(post.headers['X-Requested-With']).toBe('XMLHttpRequest')
    // Both encounter fields present and empty: the standalone Insurance page's
    // request. A bogus value is answered with an empty 200, not an error.
    expect(post.body).toBe('encounterCsn=&encounterDepartmentId=')
  })

  it('drops fields the payer does not collect (level 0, null Fields)', async () => {
    const { req } = mockRequest(payorReplies([
      { ...SPRINGFIELD_MUTUAL, Fields: { MemberId: 2, GroupNumber: 0 } },
      { ...SPRINGFIELD_MUTUAL, ID: 'WP-2', Fields: null },
    ]))

    const result = await getInsurancePayers(req)

    expect(result.payers[0]!.fields).toEqual({ MemberId: 'required' })
    expect(result.payers[1]!.fields).toEqual({})
  })

  it('returns an empty catalogue only for a real, empty Payors array', async () => {
    const { req } = mockRequest(payorReplies([]))
    expect((await getInsurancePayers(req)).payers).toEqual([])
  })

  it('refuses the empty 200 body MyChart sends for an unrecognized encounter context', async () => {
    const { req } = mockRequest([TOKEN_REPLY, { body: '' }])
    await expect(getInsurancePayers(req)).rejects.toThrow(/empty body/)
  })

  it('refuses a login page instead of reading it as no payers', async () => {
    const { req } = mockRequest([
      TOKEN_REPLY,
      { body: '<html><body>Log in</body></html>', headers: { 'content-type': 'text/html' } },
    ])
    await expect(getInsurancePayers(req)).rejects.toThrow(/rather than JSON/)
  })

  it('refuses JSON without a Payors array', async () => {
    const { req } = mockRequest([TOKEN_REPLY, { body: JSON.stringify({ Message: 'An error has occurred.' }) }])
    await expect(getInsurancePayers(req)).rejects.toThrow(/no Payors array/)
  })

  it('refuses a non-2xx status', async () => {
    const { req } = mockRequest([TOKEN_REPLY, { body: '{"Message":"An error has occurred."}', status: 500 }])
    await expect(getInsurancePayers(req)).rejects.toThrow(/HTTP 500/)
  })

  it('refuses to POST without a token', async () => {
    // CSRFToken empty, and the /Home fallback carries no hidden input either.
    const { req, sent } = mockRequest([{ body: '' }, { body: '<html><body>Home</body></html>' }])
    await expect(getInsurancePayers(req)).rejects.toThrow(/verification token/)
    expect(sent.some((s) => s.path.endsWith(GET_PAYORS_PATH))).toBe(false)
  })
})
