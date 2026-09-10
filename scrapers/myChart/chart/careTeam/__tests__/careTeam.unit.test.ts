import { describe, it, expect, mock } from 'bun:test'
import { getCareTeam, fetchCareTeamRaw, careTeamProcessor } from '../careTeam'
import { MyChartRequest } from '../../../core/myChartRequest'
import { SessionExpiredError } from '../../../core/makeAuthenticatedRequest'
import { MissingVerificationTokenError } from '../../../core/util'
import type { RawRequestRecord, RawResponse } from '../../../core/rawResponse'

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

/** What `NationalProviderID` actually holds on every clinician of four live instances: the NPI, Epic-encrypted. */
const ENCRYPTED_NPI = 'WP-24addk7JhW5D2Y7furM-2Fsq6g-3D-3D-24wkEbOpgwj-2BI6yU-2BjOXcb8vmpbfc9gRrDFP8lSGOXeVQ-3D'

/** One `ProvidersList` element as four live instances return it. */
const HIBBERT = {
  ID: 'PROV-1',
  Name: 'Julius Hibbert, MD',
  Photo: '/photos/1.jpg',
  NationalProviderID: ENCRYPTED_NPI,
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

/** The bio `GetProviderBioPrivate` answers for Hibbert's `ID` — the interesting part of a 45-field response. */
const HIBBERT_BIO = { name: 'Julius Hibbert, MD', npi: '1000000004', credentials: 'MD', licenses: [{ state: 'Illinois', licenseNumber: '1' }] }

const HIBBERT_STANDARD = {
  Name: 'Julius Hibbert, MD',
  Relation: 'Primary Care Provider',
  Specialty: 'Internal Medicine',
  IsExternal: false,
  fromExternalList: false,
  npi: '1000000004',
  ID: 'PROV-1',
  DepartmentID: 'DEP-1',
  CanMessage: true,
}

/** An outside provider as `LoadExternal` lists one: no details link, so no bio call. */
const MONROE = { ID: 'PROV-EXT', Name: 'Marvin Monroe, MD', Specialty: 'Psychiatry', Relation: 'Outside Provider', IsExternal: true }

/** The payer entry one instance lists on the care team: the page links it, and its bio has no NPI. */
const PAYER = { ID: 'PAYER-1', Name: 'Springfield Health Plan', Relation: 'Payer', CanViewProviderDetails: true }

function careTeamReplies(internal: unknown[], external: unknown[], bios: Reply[] = [{ body: JSON.stringify(HIBBERT_BIO) }]): Reply[] {
  return [
    { body: TOKEN_PAGE },
    { body: JSON.stringify({ ProvidersList: internal, DescriptiveTitle: 'Your Care Team' }) },
    { body: JSON.stringify({ ProvidersList: external }) },
    ...bios,
  ]
}

type Recorded = { body: unknown; status?: number; failure?: string }

function bioRecord(id: string, bio: Recorded): RawRequestRecord {
  return {
    path: '/api/Providers/GetProviderBioPrivate',
    method: 'POST',
    requestBody: { id },
    status: bio.status ?? 200,
    contentType: 'application/json',
    body: bio.body,
    ...(bio.failure ? { failure: bio.failure } : {}),
  }
}

function envelope(load: Recorded, loadExternal?: Recorded, bios: RawRequestRecord[] = [bioRecord('PROV-1', { body: HIBBERT_BIO })]): RawResponse {
  return {
    requests: [
      { path: '/Clinical/CareTeam', method: 'GET', status: 200, contentType: 'text/html', body: TOKEN_PAGE },
      { path: '/Clinical/CareTeam/Load', method: 'POST', requestBody: {}, status: load.status ?? 200, contentType: 'application/json', body: load.body },
      ...(loadExternal
        ? [{
            path: '/Clinical/CareTeam/LoadExternal',
            method: 'POST' as const,
            requestBody: {},
            status: loadExternal.status ?? 200,
            contentType: 'application/json',
            body: loadExternal.body,
            ...(loadExternal.failure ? { failure: loadExternal.failure } : {}),
          }]
        : []),
      ...bios,
    ],
  }
}

describe('fetchCareTeamRaw', () => {
  it('POSTs both list endpoints with the page token and an empty body, then one bio per linked row', async () => {
    const { req, sent } = mockRequest(careTeamReplies([HIBBERT], [MONROE]))

    const raw = await fetchCareTeamRaw(req)

    expect(sent.map((s) => `${s.method} ${s.path}`)).toEqual([
      'GET /MyChart/Clinical/CareTeam',
      'POST /MyChart/Clinical/CareTeam/Load',
      'POST /MyChart/Clinical/CareTeam/LoadExternal',
      'POST /MyChart/api/Providers/GetProviderBioPrivate',
    ])
    for (const call of sent.slice(1)) expect(call.headers['__RequestVerificationToken']).toBe('tok')
    for (const call of sent.slice(1, 3)) expect(call.body).toBe('{}')
    // The bio takes the row's encrypted ID as sent; the page adds no other parameter.
    expect(sent[3]!.body).toBe(JSON.stringify({ id: 'PROV-1' }))
    expect(raw.requests.map((r) => r.path)).toEqual([
      '/Clinical/CareTeam',
      '/Clinical/CareTeam/Load',
      '/Clinical/CareTeam/LoadExternal',
      '/api/Providers/GetProviderBioPrivate',
    ])
    expect(raw.requests[1]!.body).toEqual({ ProvidersList: [HIBBERT], DescriptiveTitle: 'Your Care Team' })
    expect(raw.requests[3]).toMatchObject({ requestBody: { id: 'PROV-1' }, body: HIBBERT_BIO })
  })

  // The page links a row to its details only when it says so; a row it does
  // not link (an outside provider, a row with no provider record) gets no call.
  it('asks for a bio only where the page would link the row', async () => {
    const { req, sent } = mockRequest(careTeamReplies(
      [HIBBERT, { ...HIBBERT, ID: 'PROV-2', CanViewProviderDetails: false }, { ...HIBBERT, ID: 'PROV-3', HasNoProviderRecord: true }, { ...HIBBERT, ID: '' }],
      [MONROE, { ...MONROE, ID: 'PROV-EXT-2', CanViewProviderDetails: true }],
      [{ body: JSON.stringify(HIBBERT_BIO) }, { body: JSON.stringify({ name: 'Marvin Monroe, MD', npi: '' }) }],
    ))
    await fetchCareTeamRaw(req)
    expect(sent.slice(3).map((s) => s.body)).toEqual([JSON.stringify({ id: 'PROV-1' }), JSON.stringify({ id: 'PROV-EXT-2' })])
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
      { body: JSON.stringify(HIBBERT_BIO) },
    ])
    const raw = await fetchCareTeamRaw(req)
    expect(raw.requests[2]).toMatchObject({ path: '/Clinical/CareTeam/LoadExternal', status: 500, body: 'server error' })
  })

  it('leaves no LoadExternal record when that call throws, and still returns', async () => {
    const { req } = mockRequest([
      { body: TOKEN_PAGE },
      { body: JSON.stringify({ ProvidersList: [HIBBERT] }) },
      { body: '', throws: new Error('socket hang up') },
      { body: JSON.stringify(HIBBERT_BIO) },
    ])
    const raw = await fetchCareTeamRaw(req)
    expect(raw.requests.map((r) => r.path)).toEqual(['/Clinical/CareTeam', '/Clinical/CareTeam/Load', '/api/Providers/GetProviderBioPrivate'])
  })

  // An id the instance cannot resolve is a 500 `{"Message":"An error has
  // occurred."}`; recorded, so the row's npi is null and the team is intact.
  it('records a failed bio as it came, and a thrown one not at all, without failing the read', async () => {
    const { req } = mockRequest(careTeamReplies(
      [HIBBERT, { ...HIBBERT, ID: 'PROV-2' }],
      [],
      [{ body: JSON.stringify({ Message: 'An error has occurred.' }), status: 500 }, { body: '', throws: new Error('socket hang up') }],
    ))
    const raw = await fetchCareTeamRaw(req)
    expect(raw.requests.slice(3)).toHaveLength(1)
    expect(raw.requests[3]).toMatchObject({ requestBody: { id: 'PROV-1' }, status: 500, body: { Message: 'An error has occurred.' } })
    expect(raw.requests[3]!.failure).toBeTruthy()
  })

  it('does not swallow an expired session on the external arm or on a bio', async () => {
    const external = mockRequest([
      { body: TOKEN_PAGE },
      { body: JSON.stringify({ ProvidersList: [HIBBERT] }) },
      { body: '', throws: new SessionExpiredError() },
      { body: JSON.stringify(HIBBERT_BIO) },
    ])
    await expect(fetchCareTeamRaw(external.req)).rejects.toBeInstanceOf(SessionExpiredError)

    const bio = mockRequest(careTeamReplies([HIBBERT], [], [{ body: '', throws: new SessionExpiredError() }]))
    await expect(fetchCareTeamRaw(bio.req)).rejects.toBeInstanceOf(SessionExpiredError)
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
          npi: null,
          ID: 'PROV-EXT',
          DepartmentID: null,
          CanMessage: null,
        },
      ],
    })
    expect(standard.ProvidersList[0]).not.toHaveProperty('Photo')
    expect(standard.ProvidersList[0]).not.toHaveProperty('AboutMeBlurb')
  })

  // MyChart's field is named like an NPI but holds the NPI encrypted; the
  // digits come from the bio, matched to the row by the id the bio was asked for.
  it('derives npi from the bio for the row\'s ID, and keeps NationalProviderID raw-only', () => {
    const standard = careTeamProcessor.standard(envelope(
      { body: { ProvidersList: [{ ...HIBBERT, ID: 'PROV-2' }, HIBBERT] } },
      { body: { ProvidersList: [] } },
      [bioRecord('PROV-1', { body: HIBBERT_BIO }), bioRecord('PROV-2', { body: { name: 'Nick Riviera, MD', npi: '1000000012' } })],
    ))
    expect(standard.ProvidersList.map((p) => [p.ID, p.npi])).toEqual([['PROV-2', '1000000012'], ['PROV-1', '1000000004']])
    expect(standard.ProvidersList[0]).not.toHaveProperty('NationalProviderID')
    expect(standard.ProvidersList[0]).not.toHaveProperty('encryptedNationalProviderID')
  })

  // A null npi is the honest answer for every way the bio can fall short: not
  // asked for, refused, answered without one, or answered with "" — which is
  // what a nurse's or a medical assistant's bio carries on a real instance.
  it('reports npi null when the bio was not fetched, failed, or carried no NPI', () => {
    const load = { body: { ProvidersList: [HIBBERT, { ...HIBBERT, ID: 'PROV-2' }, { ...HIBBERT, ID: 'PROV-3' }, { ...HIBBERT, ID: 'PROV-4' }, PAYER] } }
    const standard = careTeamProcessor.standard(envelope(load, { body: { ProvidersList: [] } }, [
      bioRecord('PROV-2', { body: { Message: 'An error has occurred.' }, status: 500, failure: 'HTTP 500' }),
      bioRecord('PROV-3', { body: '<html>error</html>', status: 200, failure: 'HTTP 200 from its error page' }),
      bioRecord('PROV-4', { body: { name: 'Julius Hibbert, MD' } }),
      bioRecord('PAYER-1', { body: { name: 'Springfield Health Plan', npi: '' } }),
    ]))
    expect(standard.ProvidersList.map((p) => p.npi)).toEqual([null, null, null, null, null])
  })

  it('keeps IsExternal on an internal-list provider distinct from fromExternalList', () => {
    const standard = careTeamProcessor.standard(envelope({ body: { ProvidersList: [{ ...HIBBERT, IsExternal: true }] } }, { body: { ProvidersList: [] } }))
    expect(standard.ProvidersList[0]).toMatchObject({ IsExternal: true, fromExternalList: false })
  })

  it('reports a genuinely empty care team as empty', () => {
    expect(careTeamProcessor.standard(envelope({ body: { ProvidersList: [] } }, { body: { ProvidersList: [] } }, []))).toEqual({
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

  it('reports the external list unavailable when LoadExternal was a 200 error page', () => {
    // A November 2025 instance bounces a failed request to a 200 HTML page; the
    // collector marks the tolerated record, and the status alone would not.
    const standard = careTeamProcessor.standard(
      envelope({ body: { ProvidersList: [] } }, { body: '<html>error</html>', status: 200, failure: 'HTTP 200 from its error page' }, []),
    )
    expect(standard.externalProvidersUnavailable).toBe(true)
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

  it('projects concise to who, role, specialty, the two external flags and the NPI', () => {
    const standard = careTeamProcessor.standard(envelope({ body: { ProvidersList: [HIBBERT] } }, { body: { ProvidersList: [] } }))
    expect(careTeamProcessor.concise(standard)).toEqual({
      externalProvidersUnavailable: false,
      ProvidersList: [{ Name: 'Julius Hibbert, MD', Relation: 'Primary Care Provider', Specialty: 'Internal Medicine', IsExternal: false, fromExternalList: false, npi: '1000000004' }],
    })
  })
})

describe('getCareTeam', () => {
  it('returns the standard object', async () => {
    const { req } = mockRequest(careTeamReplies([HIBBERT], [MONROE]))
    const result = await getCareTeam(req)
    expect(result.ProvidersList.map((p) => [p.Name, p.fromExternalList, p.npi])).toEqual([['Julius Hibbert, MD', false, '1000000004'], ['Marvin Monroe, MD', true, null]])
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
