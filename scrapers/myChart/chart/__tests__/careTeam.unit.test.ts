import { describe, it, expect, mock } from 'bun:test'
import { getCareTeam } from '../careTeam'
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

const TOKEN_PAGE = '<input name="__RequestVerificationToken" value="tok" />'

const HIBBERT = {
  ID: 'PROV-1',
  Name: 'Julius Hibbert, MD',
  Relation: 'Primary Care Provider',
  Specialty: 'Internal Medicine',
  NationalProviderID: '1000000001',
  DepartmentID: 'DEP-1',
  Photo: '/photos/1.jpg',
  WebPageUrl: '/Clinical/Provider/PROV-1',
  // An array on both live instances (always empty), so it must not be read as text.
  AboutMeBlurb: [],
  Organizations: null,
  SchedulableVisitTypes: null,
  CareTeamStatus: 0,
  CanMessage: true,
}

function careTeamReplies(internal: unknown[], external: unknown[]): Reply[] {
  return [
    { body: TOKEN_PAGE },
    { body: JSON.stringify({ ProvidersList: internal }) },
    { body: JSON.stringify({ ProvidersList: external }) },
  ]
}

describe('getCareTeam', () => {
  it('reads both provider lists and flags the outside providers', async () => {
    const { req } = mockRequest(careTeamReplies(
      [HIBBERT],
      [{ ID: 'PROV-EXT', Name: 'Marvin Monroe, MD', Specialty: 'Psychiatry', Relation: 'Outside Provider' }],
    ))

    const result = await getCareTeam(req)

    expect(result.externalProvidersUnavailable).toBe(false)
    expect(result.members).toEqual([
      {
        id: 'PROV-1',
        name: 'Julius Hibbert, MD',
        relation: 'Primary Care Provider',
        specialty: 'Internal Medicine',
        nationalProviderId: '1000000001',
        departmentId: 'DEP-1',
        photoUrl: '/photos/1.jpg',
        webPageUrl: '/Clinical/Provider/PROV-1',
        canMessage: true,
        isExternal: false,
      },
      {
        id: 'PROV-EXT',
        name: 'Marvin Monroe, MD',
        relation: 'Outside Provider',
        specialty: 'Psychiatry',
        nationalProviderId: '',
        departmentId: '',
        photoUrl: '',
        webPageUrl: '',
        canMessage: false,
        isExternal: true,
      },
    ])
  })

  it('POSTs both endpoints with the page token and an empty JSON body', async () => {
    const { req, sent } = mockRequest(careTeamReplies([], []))

    await getCareTeam(req)

    expect(sent.map((s) => `${s.method} ${s.path}`)).toEqual([
      'GET /MyChart/Clinical/CareTeam',
      'POST /MyChart/Clinical/CareTeam/Load',
      'POST /MyChart/Clinical/CareTeam/LoadExternal',
    ])
    for (const call of sent.slice(1)) {
      expect(call.headers['__RequestVerificationToken']).toBe('tok')
      expect(call.body).toBe('{}')
    }
  })

  it('posts without the token header when the page carries none', async () => {
    const { req, sent } = mockRequest([
      { body: '<html></html>' },
      { body: JSON.stringify({ ProvidersList: [HIBBERT] }) },
      { body: JSON.stringify({ ProvidersList: [] }) },
    ])

    const result = await getCareTeam(req)

    expect(result.members).toHaveLength(1)
    expect(sent[1]!.headers['__RequestVerificationToken']).toBeUndefined()
  })

  it('honours IsExternal on a provider returned by the internal list', async () => {
    const { req } = mockRequest(careTeamReplies([{ ...HIBBERT, IsExternal: true }], []))
    const result = await getCareTeam(req)
    expect(result.members[0]!.isExternal).toBe(true)
  })

  it('reports a genuinely empty care team as empty', async () => {
    const { req } = mockRequest(careTeamReplies([], []))
    expect(await getCareTeam(req)).toEqual({ members: [], externalProvidersUnavailable: false })
  })

  // The reason this scraper was withdrawn once already: an unrecognized
  // response must never render to the patient as "you have no care team".
  it('throws rather than reporting an empty team when the envelope is unrecognized', async () => {
    const { req } = mockRequest([
      { body: TOKEN_PAGE },
      { body: JSON.stringify({ providers: [HIBBERT] }) },
    ])
    await expect(getCareTeam(req)).rejects.toThrow(/no ProvidersList/)
  })

  it('throws when the response is not JSON', async () => {
    const { req } = mockRequest([
      { body: TOKEN_PAGE },
      { body: '<html>Sign in</html>', headers: { 'content-type': 'text/html' } },
    ])
    await expect(getCareTeam(req)).rejects.toThrow(/rather than JSON/)
  })

  it('throws when the endpoint returns an error status', async () => {
    const { req } = mockRequest([
      { body: TOKEN_PAGE },
      { body: 'server error', status: 500 },
    ])
    await expect(getCareTeam(req)).rejects.toThrow(/HTTP 500/)
  })

  it('keeps the internal list and flags the gap when the external list fails', async () => {
    const { req } = mockRequest([
      { body: TOKEN_PAGE },
      { body: JSON.stringify({ ProvidersList: [HIBBERT] }) },
      { body: 'server error', status: 500 },
    ])

    const result = await getCareTeam(req)

    expect(result.members.map((m) => m.name)).toEqual(['Julius Hibbert, MD'])
    expect(result.externalProvidersUnavailable).toBe(true)
  })

  it('coerces a numeric id and a missing name rather than dropping the entry', async () => {
    const { req } = mockRequest(careTeamReplies([{ ID: 42, Specialty: 'Cardiology' }], []))
    const result = await getCareTeam(req)
    expect(result.members[0]).toMatchObject({ id: '42', name: '', specialty: 'Cardiology' })
  })
})
