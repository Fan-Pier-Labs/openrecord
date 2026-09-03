import { describe, it, expect, mock } from 'bun:test'
import { getLinkedMyChartAccounts, fetchLinkedAccountsRaw, linkedAccountsProcessor } from '../otherMyCharts'
import { MyChartRequest } from '../../core/myChartRequest'
import { MissingVerificationTokenError } from '../../core/util'
import type { RawResponse } from '../../core/rawResponse'

const TOKEN = 'abc123-verification-token'

/** Manage page carrying the __RequestVerificationToken the POST needs. */
function managePage(token: string | null = TOKEN) {
  return token === null
    ? '<html><body><p>Nothing here</p></body></html>'
    : `<html><body><input name="__RequestVerificationToken" type="hidden" value="${token}" /></body></html>`
}

/**
 * Serves the /Community/Manage HTML and the LoadCommunityLinks JSON, and records
 * the POST so the test can assert on the token header and body.
 */
function mockRequest(manageHtml: string, orgList: unknown) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'

  const posts: { url: string; init: RequestInit }[] = []

  req.transport = mock(async (url: string, init: RequestInit = {}) => {
    if (url.includes('/Community/Shared/LoadCommunityLinks')) {
      posts.push({ url, init })
      return new Response(JSON.stringify(orgList), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    return new Response(manageHtml, { status: 200, headers: { 'content-type': 'text/html' } })
  })

  return { req, posts }
}

/** One captured `OrgList` record, the fields the processor reads plus a sample of the ~35 it drops. */
const SPRINGFIELD = {
  OrganizationName: 'Springfield General Hospital',
  OrganizationId: 'ORG-1',
  CELocationId: 'CE-1',
  HasChildOrgs: false,
  LinkType: 1,
  LogoUrl: 'https://example.org/springfield.png',
  TermsAndConditionsUrl: '/terms',
  UserActionStatus: 2,
  IsDisabled: false,
  ShowSignup: false,
  UserMyChartStatus: 3,
  IsSSO: false,
  LastEncounterDetail: { Patient: 'Homer', Physician: 'Julius Hibbert, MD', Department: 'Internal Medicine', Date: '01/15/2026', Time: '9:00 AM' },
  LastAccessTokenDateTime: '2026-02-01T00:00:00',
  DisplayAddress: ['1 Main St', 'Springfield'],
  CurrentlyLoadingDxrData: false,
  LinkErrorCode: '',
  HasValidRefreshToken: true,
  IsInvalidCeLink: false,
  InvalidLinkReason: 0,
  InvalidLinkRetryDate: '',
  ErrorMessage: null,
  NeedCeAuth: false,
  PayerOrgDetails: { IsPayer: false },
  NewSubjectList: null,
}

const SPRINGFIELD_STANDARD = {
  OrganizationName: 'Springfield General Hospital',
  LastEncounterDetail: { Patient: 'Homer', Physician: 'Julius Hibbert, MD', Department: 'Internal Medicine', Date: '01/15/2026', Time: '9:00 AM' },
  OrganizationId: 'ORG-1',
  LinkType: 1,
  UserActionStatus: 2,
  UserMyChartStatus: 3,
  DisplayAddress: ['1 Main St', 'Springfield'],
  LastAccessTokenDateTime: '2026-02-01T00:00:00',
  IsDisabled: false,
  IsInvalidCeLink: false,
  InvalidLinkReason: 0,
  InvalidLinkRetryDate: '',
  ErrorMessage: null,
  NeedCeAuth: false,
  LinkErrorCode: '',
}

const BODY = {
  IsConsentNeeded: false,
  OrgList: { 'ORG-1': SPRINGFIELD, 'ORG-2': { OrganizationName: 'Shelbyville Medical Center', OrganizationId: 'ORG-2', LastEncounterDetail: null } },
  Spotlight: [],
  CEOptOut: false,
  ForwardedLinks: [],
  HomeOrgName: 'Springfield General Hospital',
}

function envelope(body: unknown): RawResponse {
  return { requests: [{ path: '/Community/Shared/LoadCommunityLinks', method: 'POST', requestBody: 'controllerType=2&showDXROrgInMO=false', status: 200, contentType: 'application/json', body }] }
}

describe('fetchLinkedAccountsRaw', () => {
  it('throws rather than returning no links when the manage page has no token, without POSTing', async () => {
    const { req, posts } = mockRequest(managePage(null), BODY)
    await expect(fetchLinkedAccountsRaw(req)).rejects.toBeInstanceOf(MissingVerificationTokenError)
    expect(posts).toHaveLength(0)
  })

  it('sends the token and form body MyChart requires on the links POST, and records it minus the cache-buster', async () => {
    const { req, posts } = mockRequest(managePage(), BODY)
    const raw = await fetchLinkedAccountsRaw(req)

    expect(posts).toHaveLength(1)
    const { url, init } = posts[0]!
    expect(init.method).toBe('POST')
    expect(init.body).toBe('controllerType=2&showDXROrgInMO=false')

    const headers = init.headers as Record<string, string>
    expect(headers.__requestverificationtoken).toBe(TOKEN)
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded; charset=UTF-8')

    // Cache-buster, so a repeat call is not served a stale org list.
    expect(url).toContain('noCache=')

    expect(raw.requests.map((r) => `${r.method} ${r.path}`)).toEqual(['GET /Community/Manage', 'POST /Community/Shared/LoadCommunityLinks'])
    expect(raw.requests[1]).toMatchObject({ requestBody: 'controllerType=2&showDXROrgInMO=false', body: BODY })
  })
})

describe('linkedAccountsProcessor', () => {
  it('emits every organization in OrgList with the link state and the last encounter', () => {
    const standard = linkedAccountsProcessor.standard(envelope(BODY))
    expect(standard.HomeOrgName).toBe('Springfield General Hospital')
    expect(standard.CEOptOut).toBe(false)
    expect(standard.ForwardedLinks).toEqual([])
    expect(standard.OrgList).toHaveLength(2)
    expect(standard.OrgList[0]).toEqual(SPRINGFIELD_STANDARD)
    expect(standard.OrgList[0]).not.toHaveProperty('LogoUrl')
    expect(standard).not.toHaveProperty('Spotlight')
  })

  it('preserves a null LastEncounterDetail rather than inventing an empty visit', () => {
    const standard = linkedAccountsProcessor.standard(envelope(BODY))
    expect(standard.OrgList[1]).toMatchObject({ OrganizationName: 'Shelbyville Medical Center', LastEncounterDetail: null, LinkType: null, DisplayAddress: [] })
  })

  it('returns an empty list when the account has no linked organizations', () => {
    expect(linkedAccountsProcessor.standard(envelope({ OrgList: {} })).OrgList).toEqual([])
    expect(linkedAccountsProcessor.standard({ requests: [] })).toEqual({ HomeOrgName: null, CEOptOut: null, ForwardedLinks: [], OrgList: [] })
  })

  it('projects concise to the organization and its last visit', () => {
    expect(linkedAccountsProcessor.concise(linkedAccountsProcessor.standard(envelope(BODY)))).toEqual({
      OrgList: [
        { OrganizationName: 'Springfield General Hospital', LastEncounterDetail: SPRINGFIELD_STANDARD.LastEncounterDetail },
        { OrganizationName: 'Shelbyville Medical Center', LastEncounterDetail: null },
      ],
    })
  })
})

describe('getLinkedMyChartAccounts', () => {
  it('returns the standard object', async () => {
    const { req } = mockRequest(managePage(), BODY)
    const result = await getLinkedMyChartAccounts(req)
    expect(result.OrgList.map((o) => o.OrganizationName)).toEqual(['Springfield General Hospital', 'Shelbyville Medical Center'])
  })
})
