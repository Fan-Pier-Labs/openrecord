import { describe, it, expect, mock } from 'bun:test'
import { getLinkedMyChartAccounts } from '../otherMyCharts'
import { MyChartRequest } from '../../core/myChartRequest'

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
      return new Response(JSON.stringify(orgList), { status: 200 })
    }
    return new Response(manageHtml, { status: 200 })
  })

  return { req, posts }
}

describe('getLinkedMyChartAccounts', () => {
  it('maps every organization in OrgList to a linked account', async () => {
    const { req } = mockRequest(managePage(), {
      OrgList: {
        '1': {
          OrganizationName: 'Springfield General Hospital',
          LogoUrl: 'https://example.org/springfield.png',
          LastEncounterDetail: 'Last visit 3 months ago',
        },
        '2': {
          OrganizationName: 'Shelbyville Medical Center',
          LogoUrl: 'https://example.org/shelbyville.png',
          LastEncounterDetail: null,
        },
      },
    })

    expect(await getLinkedMyChartAccounts(req)).toEqual([
      {
        name: 'Springfield General Hospital',
        logoUrl: 'https://example.org/springfield.png',
        lastEncounter: 'Last visit 3 months ago',
      },
      {
        name: 'Shelbyville Medical Center',
        logoUrl: 'https://example.org/shelbyville.png',
        lastEncounter: null,
      },
    ])
  })

  it('preserves a null LastEncounterDetail rather than coercing it to a string', async () => {
    const { req } = mockRequest(managePage(), {
      OrgList: { '1': { OrganizationName: 'Org', LogoUrl: '/logo.png', LastEncounterDetail: null } },
    })

    const [account] = await getLinkedMyChartAccounts(req)
    expect(account!.lastEncounter).toBeNull()
  })

  it('returns an empty list when the account has no linked organizations', async () => {
    const { req } = mockRequest(managePage(), { OrgList: {} })
    expect(await getLinkedMyChartAccounts(req)).toEqual([])
  })

  it('bails out without POSTing when the verification token is missing', async () => {
    // Without the token MyChart rejects the POST, so the scraper should not
    // issue it at all.
    const { req, posts } = mockRequest(managePage(null), { OrgList: {} })

    expect(await getLinkedMyChartAccounts(req)).toEqual([])
    expect(posts).toHaveLength(0)
  })

  it('sends the token and form body MyChart requires on the links POST', async () => {
    const { req, posts } = mockRequest(managePage(), { OrgList: {} })
    await getLinkedMyChartAccounts(req)

    expect(posts).toHaveLength(1)
    const { url, init } = posts[0]!
    expect(init.method).toBe('POST')
    expect(init.body).toBe('controllerType=2&showDXROrgInMO=false')

    const headers = init.headers as Record<string, string>
    expect(headers.__requestverificationtoken).toBe(TOKEN)
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded; charset=UTF-8')

    // Cache-buster, so a repeat call is not served a stale org list.
    expect(url).toContain('noCache=')
  })
})
