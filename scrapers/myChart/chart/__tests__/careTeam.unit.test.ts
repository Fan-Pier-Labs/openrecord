import { describe, it, expect, mock } from 'bun:test'
import { getCareTeam, fetchCareTeamRaw, careTeamProcessor } from '../careTeam'
import { MyChartRequest } from '../../core/myChartRequest'
import { SessionExpiredError } from '../../core/makeAuthenticatedRequest'
import { MissingVerificationTokenError } from '../../core/util'
import type { RawResponse } from '../../core/rawResponse'

type Reply = { body: string; status?: number; headers?: Record<string, string>; throws?: Error }

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
    if (reply.throws) throw reply.throws
    return new Response(reply.body, { status: reply.status ?? 200, headers: reply.headers ?? { 'content-type': 'application/json' } })
  })
  return { req, sent }
}

const TOKEN_PAGE = '<input name="__RequestVerificationToken" value="tok" />'

/** One `ProvidersList` element as four live instances return it. */
const HIBBERT = {
  ID: 'PROV-1',
  Name: 'Julius Hibbert, MD',
  Photo: '/photos/1.jpg',
  NationalProviderID: '1000000001',
  WebPageUrl: '/Clinical/Provider/PROV-1',
  InfoBlurbUrl: '',
  // An array on every live instance (always empty), so it must not be read as text.
  AboutMeBlurb: [],
  CanViewProviderDetails: true,
  CanDirectSchedule: false,
  CanRequestAppointment: false,
  CanMessage: true,
  CommCenterMessageUrl: '/x',
  CanRequestCustomAppt: false,
  HasNoProviderRecord: false,
  IsNewSchedulingEnabled: false,
  Specialty: 'Internal Medicine',
  Relation: 'Primary Care Provider',
  SchedulableVisitTypes: null,
  DepartmentID: 'DEP-1',
  Organizations: null,
  IsExternal: false,
  CareTeamStatus: 0,
  CanHideProvider: false,
}

const HIBBERT_STANDARD = {
  Name: 'Julius Hibbert, MD',
  Relation: 'Primary Care Provider',
  Specialty: 'Internal Medicine',
  IsExternal: false,
  fromExternalList: false,
  ID: 'PROV-1',
  NationalProviderID: '1000000001',
  DepartmentID: 'DEP-1',
  CanMessage: true,
}

const MONROE = { ID: 'PROV-EXT', Name: 'Marvin Monroe, MD', Specialty: 'Psychiatry', Relation: 'Outside Provider', IsExternal: true }

function careTeamReplies(internal: unknown[], external: unknown[]): Reply[] {
  return [
    { body: TOKEN_PAGE },
    { body: JSON.stringify({ ProvidersList: internal, DescriptiveTitle: 'Your Care Team' }) },
    { body: JSON.stringify({ ProvidersList: external }) },
  ]
}

function envelope(load: { body: unknown; status?: number }, loadExternal?: { body: unknown; status?: number }): RawResponse {
  return {
    requests: [
      { path: '/Clinical/CareTeam', method: 'GET', status: 200, contentType: 'text/html', body: TOKEN_PAGE },
      { path: '/Clinical/CareTeam/Load', method: 'POST', requestBody: {}, status: load.status ?? 200, contentType: 'application/json', body: load.body },
      ...(loadExternal
        ? [{ path: '/Clinical/CareTeam/LoadExternal', method: 'POST' as const, requestBody: {}, status: loadExternal.status ?? 200, contentType: 'application/json', body: loadExternal.body }]
        : []),
    ],
  }
}

describe('fetchCareTeamRaw', () => {
  it('POSTs both endpoints with the page token and an empty JSON body, recording all three', async () => {
    const { req, sent } = mockRequest(careTeamReplies([HIBBERT], [MONROE]))

    const raw = await fetchCareTeamRaw(req)

    expect(sent.map((s) => `${s.method} ${s.path}`)).toEqual([
      'GET /MyChart/Clinical/CareTeam',
      'POST /MyChart/Clinical/CareTeam/Load',
      'POST /MyChart/Clinical/CareTeam/LoadExternal',
    ])
    for (const call of sent.slice(1)) {
      expect(call.headers['__RequestVerificationToken']).toBe('tok')
      expect(call.body).toBe('{}')
    }
    expect(raw.requests.map((r) => r.path)).toEqual(['/Clinical/CareTeam', '/Clinical/CareTeam/Load', '/Clinical/CareTeam/LoadExternal'])
    expect(raw.requests[1]!.body).toEqual({ ProvidersList: [HIBBERT], DescriptiveTitle: 'Your Care Team' })
  })

  // Both endpoints refuse a token-less POST, so a page with no token is an
  // unrecognized state — never an empty care team, and never a confusing 500
  // one request later.
  it('throws when the activity page carries no token, without posting', async () => {
    const { req, sent } = mockRequest([{ body: '<html></html>' }])
    await expect(fetchCareTeamRaw(req)).rejects.toBeInstanceOf(MissingVerificationTokenError)
    expect(sent).toHaveLength(1)
  })

  it('records a failed LoadExternal response as it came', async () => {
    const { req } = mockRequest([
      { body: TOKEN_PAGE },
      { body: JSON.stringify({ ProvidersList: [HIBBERT] }) },
      { body: 'server error', status: 500 },
    ])
    const raw = await fetchCareTeamRaw(req)
    expect(raw.requests[2]).toMatchObject({ path: '/Clinical/CareTeam/LoadExternal', status: 500, body: 'server error' })
  })

  it('leaves no LoadExternal record when that call throws, and still returns', async () => {
    const { req } = mockRequest([
      { body: TOKEN_PAGE },
      { body: JSON.stringify({ ProvidersList: [HIBBERT] }) },
      { body: '', throws: new Error('socket hang up') },
    ])
    const raw = await fetchCareTeamRaw(req)
    expect(raw.requests.map((r) => r.path)).toEqual(['/Clinical/CareTeam', '/Clinical/CareTeam/Load'])
  })

  it('does not swallow an expired session on the external arm', async () => {
    const { req } = mockRequest([
      { body: TOKEN_PAGE },
      { body: JSON.stringify({ ProvidersList: [HIBBERT] }) },
      { body: '', throws: new SessionExpiredError() },
    ])
    await expect(fetchCareTeamRaw(req)).rejects.toBeInstanceOf(SessionExpiredError)
  })
})

describe('careTeamProcessor', () => {
  it('merges both lists under ProvidersList and marks which came from LoadExternal', () => {
    const standard = careTeamProcessor.standard(envelope(
      { body: { ProvidersList: [HIBBERT], DescriptiveTitle: 'Your Care Team', TabColorClass: 'x' } },
      { body: { ProvidersList: [MONROE] } },
    ))
    expect(standard).toEqual({
      DescriptiveTitle: 'Your Care Team',
      externalProvidersUnavailable: false,
      ProvidersList: [
        HIBBERT_STANDARD,
        {
          Name: 'Marvin Monroe, MD',
          Relation: 'Outside Provider',
          Specialty: 'Psychiatry',
          IsExternal: true,
          fromExternalList: true,
          ID: 'PROV-EXT',
          NationalProviderID: null,
          DepartmentID: null,
          CanMessage: null,
        },
      ],
    })
    expect(standard.ProvidersList[0]).not.toHaveProperty('Photo')
    expect(standard.ProvidersList[0]).not.toHaveProperty('AboutMeBlurb')
  })

  it('keeps IsExternal on an internal-list provider distinct from fromExternalList', () => {
    const standard = careTeamProcessor.standard(envelope({ body: { ProvidersList: [{ ...HIBBERT, IsExternal: true }] } }, { body: { ProvidersList: [] } }))
    expect(standard.ProvidersList[0]).toMatchObject({ IsExternal: true, fromExternalList: false })
  })

  it('reports a genuinely empty care team as empty', () => {
    expect(careTeamProcessor.standard(envelope({ body: { ProvidersList: [] } }, { body: { ProvidersList: [] } }))).toEqual({
      DescriptiveTitle: null,
      externalProvidersUnavailable: false,
      ProvidersList: [],
    })
  })

  // The reason this scraper was withdrawn once already: an unrecognized
  // response must never render to the patient as "you have no care team".
  it('throws rather than reporting an empty team when the Load envelope is unrecognized', () => {
    expect(() => careTeamProcessor.standard(envelope({ body: { providers: [HIBBERT] } }))).toThrow(/no ProvidersList/)
  })

  it('throws when Load answered with a login page instead of JSON', () => {
    expect(() => careTeamProcessor.standard(envelope({ body: '<html>Sign in</html>' }))).toThrow(/no ProvidersList/)
  })

  it('throws when Load answered with an error status', () => {
    expect(() => careTeamProcessor.standard(envelope({ body: 'server error', status: 500 }))).toThrow(/HTTP 500/)
    expect(() => careTeamProcessor.standard({ requests: [] })).toThrow(/HTTP nothing/)
  })

  it('keeps the internal list and flags the gap when LoadExternal failed or is missing', () => {
    const failed = careTeamProcessor.standard(envelope({ body: { ProvidersList: [HIBBERT] } }, { body: 'server error', status: 500 }))
    expect(failed.ProvidersList.map((p) => p.Name)).toEqual(['Julius Hibbert, MD'])
    expect(failed.externalProvidersUnavailable).toBe(true)

    const unrecognized = careTeamProcessor.standard(envelope({ body: { ProvidersList: [HIBBERT] } }, { body: { providers: [] } }))
    expect(unrecognized.externalProvidersUnavailable).toBe(true)

    const absent = careTeamProcessor.standard(envelope({ body: { ProvidersList: [HIBBERT] } }))
    expect(absent.externalProvidersUnavailable).toBe(true)
  })

  it('reads a null Relation as no stated role, which is how instances send it', () => {
    const standard = careTeamProcessor.standard(envelope({ body: { ProvidersList: [{ ...HIBBERT, Relation: null }] } }, { body: { ProvidersList: [] } }))
    expect(standard.ProvidersList[0]).toMatchObject({ Relation: null, Name: 'Julius Hibbert, MD' })
  })

  it('projects concise to who, role, specialty and the two external flags', () => {
    const standard = careTeamProcessor.standard(envelope({ body: { ProvidersList: [HIBBERT] } }, { body: { ProvidersList: [] } }))
    expect(careTeamProcessor.concise(standard)).toEqual({
      externalProvidersUnavailable: false,
      ProvidersList: [{ Name: 'Julius Hibbert, MD', Relation: 'Primary Care Provider', Specialty: 'Internal Medicine', IsExternal: false, fromExternalList: false }],
    })
  })
})

describe('getCareTeam', () => {
  it('returns the standard object', async () => {
    const { req } = mockRequest(careTeamReplies([HIBBERT], [MONROE]))
    const result = await getCareTeam(req)
    expect(result.ProvidersList.map((p) => [p.Name, p.fromExternalList])).toEqual([['Julius Hibbert, MD', false], ['Marvin Monroe, MD', true]])
    expect(result.externalProvidersUnavailable).toBe(false)
  })

  it('throws rather than reporting an empty team when Load fails', async () => {
    const { req } = mockRequest([{ body: TOKEN_PAGE }, { body: 'server error', status: 500 }, { body: JSON.stringify({ ProvidersList: [] }) }])
    await expect(getCareTeam(req)).rejects.toThrow(/HTTP 500/)
  })
})

describe('careTeamProcessor request matching', () => {
  it('reads the internal list from Load even when LoadExternal was recorded first', () => {
    // The two calls run in parallel, so the envelope order is whichever
    // answered first — and "Load" is a prefix of "LoadExternal".
    const raw: RawResponse = {
      requests: [
        { path: '/Clinical/CareTeam', method: 'GET', status: 200, contentType: 'text/html', body: '', purpose: 'token' },
        { path: '/Clinical/CareTeam/LoadExternal', method: 'POST', status: 200, contentType: 'json', body: { ProvidersList: [{ Name: 'Outside Doc', IsExternal: true }] } },
        { path: '/Clinical/CareTeam/Load', method: 'POST', status: 200, contentType: 'json', body: { ProvidersList: [{ Name: 'Inside Doc', Relation: 'Primary Care Provider' }] } },
      ],
    }
    const standard = careTeamProcessor.standard(raw)
    expect(standard.ProvidersList.map((p) => [p.Name, p.fromExternalList])).toEqual([
      ['Inside Doc', false],
      ['Outside Doc', true],
    ])
    expect(standard.externalProvidersUnavailable).toBe(false)
  })
})
