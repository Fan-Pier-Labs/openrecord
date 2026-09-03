import { describe, it, expect, mock } from 'bun:test'
import { getInsurancePayers, fetchInsurancePayersRaw, insurancePayersProcessor, GET_PAYORS_PATH } from '../insurancePayers'
import { MyChartRequest } from '../../../core/myChartRequest'
import { MissingVerificationTokenError } from '../../../core/util'
import type { RawResponse } from '../../../core/rawResponse'

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
    return new Response(reply.body, { status: reply.status ?? 200, headers: reply.headers ?? { 'content-type': 'application/json' } })
  })
  return { req, sent }
}

const TOKEN_PAGE = '<input name="__RequestVerificationToken" value="tok" />'

/**
 * One `Payors` element exactly as all four live instances return it: `Fields`
 * is a name → 1|2 map, `SortKey`/`NameUTF8` are null and `SampleCardImages`
 * is empty.
 */
const SPRINGFIELD = {
  Fields: { MemberId: 2, SubscriberDateOfBirth: 1, SubscriberFirstName: 2, SubscriberId: 1, SubscriberLastName: 2 },
  SampleCardImages: [],
  CanUpload: true,
  IsNonConfiguredPayer: false,
  SortKey: null,
  ID: 'WP-24abc-3D-3D-24def-2Fghi-3D',
  Name: 'Springfield Mutual Health',
  NameUTF8: null,
}

const SPRINGFIELD_STANDARD = {
  ID: 'WP-24abc-3D-3D-24def-2Fghi-3D',
  Name: 'Springfield Mutual Health',
  Fields: { MemberId: 2, SubscriberDateOfBirth: 1, SubscriberFirstName: 2, SubscriberId: 1, SubscriberLastName: 2 },
  requiredFields: ['MemberId', 'SubscriberFirstName', 'SubscriberLastName'],
  optionalFields: ['SubscriberDateOfBirth', 'SubscriberId'],
  CanUpload: true,
  IsNonConfiguredPayer: false,
}

function payorReplies(payors: unknown[]): Reply[] {
  return [{ body: TOKEN_PAGE, headers: { 'content-type': 'text/html' } }, { body: JSON.stringify({ Payors: payors }) }]
}

/** The recorded envelope, as the scraper would build it. */
function envelope(payors: { body: unknown; status?: number; contentType?: string }): RawResponse {
  return {
    requests: [
      { path: '/Insurance', method: 'GET', status: 200, contentType: 'text/html', body: TOKEN_PAGE, purpose: 'token' },
      {
        path: GET_PAYORS_PATH,
        method: 'POST',
        requestBody: 'encounterCsn=&encounterDepartmentId=',
        status: payors.status ?? 200,
        contentType: payors.contentType ?? 'application/json',
        body: payors.body,
      },
    ],
  }
}

describe('fetchInsurancePayersRaw', () => {
  it('posts the legacy form exactly as the Insurance page does, with the page token', async () => {
    const { req, sent } = mockRequest(payorReplies([SPRINGFIELD]))

    const raw = await fetchInsurancePayersRaw(req)

    // The token comes off the activity page, which is recorded but is not the payload.
    expect(sent[0]!.path).toBe('/MyChart/Insurance')
    expect(raw.requests[0]!.purpose).toBe('token')

    const post = sent[1]!
    expect(post.path).toBe(`/MyChart${GET_PAYORS_PATH}`)
    expect(post.method).toBe('POST')
    expect(post.headers['__RequestVerificationToken']).toBe('tok')
    expect(post.headers['Content-Type']).toContain('application/x-www-form-urlencoded')
    expect(post.headers['X-Requested-With']).toBe('XMLHttpRequest')
    // Both encounter fields present and empty: the standalone Insurance page's
    // request. A bogus value is answered with an empty 200, not an error.
    expect(post.body).toBe('encounterCsn=&encounterDepartmentId=')
  })

  it('refuses to POST when the activity page carries no token', async () => {
    const { req, sent } = mockRequest([{ body: '<html><body>no token here</body></html>', headers: { 'content-type': 'text/html' } }])

    await expect(fetchInsurancePayersRaw(req)).rejects.toBeInstanceOf(MissingVerificationTokenError)
    expect(sent.some((s) => s.path.endsWith(GET_PAYORS_PATH))).toBe(false)
  })
})

describe('insurancePayersProcessor', () => {
  it('passes MyChart field names through and derives the requirement levels', () => {
    const standard = insurancePayersProcessor.standard(envelope({ body: { Payors: [SPRINGFIELD] } }))
    expect(standard.Payors).toEqual([SPRINGFIELD_STANDARD])
  })

  it('drops the fields that are empty on every captured instance', () => {
    const standard = insurancePayersProcessor.standard(envelope({ body: { Payors: [SPRINGFIELD] } }))
    for (const dropped of ['SortKey', 'NameUTF8', 'SampleCardImages']) {
      expect(standard.Payors[0]!).not.toHaveProperty(dropped)
    }
  })

  it('omits a field MyChart does not show (level 0) from both derived lists, and from Fields', () => {
    const standard = insurancePayersProcessor.standard(
      envelope({ body: { Payors: [{ ...SPRINGFIELD, Fields: { MemberId: 2, GroupNumber: 0 } }] } }),
    )
    expect(standard.Payors[0]!.Fields).toEqual({ MemberId: 2 })
    expect(standard.Payors[0]!.requiredFields).toEqual(['MemberId'])
    expect(standard.Payors[0]!.optionalFields).toEqual([])
  })

  it('emits every listed field even for a payer that collects nothing', () => {
    // Membership is by name, never by value: a payer with no Fields still
    // carries the map and both lists, so "collects nothing" is distinguishable
    // from "not looked at".
    const standard = insurancePayersProcessor.standard(envelope({ body: { Payors: [{ ...SPRINGFIELD, Fields: null }] } }))
    expect(standard.Payors[0]!.Fields).toEqual({})
    expect(standard.Payors[0]!.requiredFields).toEqual([])
    expect(standard.Payors[0]!.optionalFields).toEqual([])
  })

  it('reports a real empty catalogue as empty', () => {
    expect(insurancePayersProcessor.standard(envelope({ body: { Payors: [] } })).Payors).toEqual([])
  })

  it('throws on the 200 EMPTY body MyChart answers an unrecognized encounter context with', () => {
    // No error status and no content type, so a status check alone reads this
    // as success — and an empty catalogue reads as "accepts no insurance".
    expect(() => insurancePayersProcessor.standard(envelope({ body: '', contentType: '' }))).toThrow(/empty body/)
  })

  it('throws on a login page rather than reading it as no payers', () => {
    expect(() =>
      insurancePayersProcessor.standard(envelope({ body: '<html><body>Log in</body></html>', contentType: 'text/html' })),
    ).toThrow(/no Payors array/)
  })

  it('throws on JSON without a Payors array', () => {
    expect(() => insurancePayersProcessor.standard(envelope({ body: { Message: 'An error has occurred.' } }))).toThrow(
      /no Payors array/,
    )
  })

  it('throws on a non-2xx status', () => {
    expect(() =>
      insurancePayersProcessor.standard(envelope({ body: { Message: 'An error has occurred.' }, status: 500 })),
    ).toThrow(/HTTP 500/)
  })

  it('projects name, required fields and the placeholder flag to concise', () => {
    const standard = insurancePayersProcessor.standard(envelope({ body: { Payors: [SPRINGFIELD] } }))
    expect(insurancePayersProcessor.concise(standard)).toEqual({
      Payors: [
        {
          Name: 'Springfield Mutual Health',
          requiredFields: ['MemberId', 'SubscriberFirstName', 'SubscriberLastName'],
          IsNonConfiguredPayer: false,
        },
      ],
    })
  })
})

describe('getInsurancePayers', () => {
  it('returns the standard object end to end', async () => {
    const { req } = mockRequest(payorReplies([SPRINGFIELD, { ...SPRINGFIELD, ID: 'WP-2', Name: 'Shelbyville Blue', Fields: { MemberId: 1 } }]))

    const result = await getInsurancePayers(req)

    expect(result.Payors).toEqual([
      SPRINGFIELD_STANDARD,
      {
        ID: 'WP-2',
        Name: 'Shelbyville Blue',
        Fields: { MemberId: 1 },
        requiredFields: [],
        optionalFields: ['MemberId'],
        CanUpload: true,
        IsNonConfiguredPayer: false,
      },
    ])
  })
})
