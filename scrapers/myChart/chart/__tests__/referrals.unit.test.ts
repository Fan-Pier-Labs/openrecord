import { describe, it, expect, mock } from 'bun:test'
import { getReferrals, fetchReferralsRaw, referralsProcessor } from '../referrals'
import { MyChartRequest } from '../../core/myChartRequest'
import { MissingVerificationTokenError } from '../../core/util'
import type { RawResponse } from '../../core/rawResponse'

function mockRequest(responses: Array<{ body: string }>) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  let i = 0
  req.transport = mock(async () => {
    const r = responses[i++]
    return new Response(r!.body, { status: 200, headers: { 'content-type': 'application/json' } })
  })
  return req
}

const TOKEN_PAGE = '<input name="__RequestVerificationToken" value="t" />'

/** The captured `listReferrals` element, every field. */
const REFERRAL = {
  internalId: 'R1',
  externalId: 'EXT1',
  status: '1',
  statusString: 'Active',
  creationDate: '2024-01-01',
  dte: 67000,
  referredToProviderName: 'Dr. Jones',
  referredByProviderName: 'Dr. Smith',
  referredToFacility: 'Example Medical Center',
  start: '2024-01-15',
  end: '2024-07-15',
}

const BODY = { referralList: [REFERRAL], canSendMessage: true, canSeeAuthorizations: false, shouldRedirect: false }

function envelope(body: unknown): RawResponse {
  return { requests: [{ path: '/api/referrals/listReferrals', method: 'POST', requestBody: {}, status: 200, contentType: 'application/json', body }] }
}

describe('fetchReferralsRaw', () => {
  it('throws rather than returning no referrals when the page has no token', async () => {
    await expect(fetchReferralsRaw(mockRequest([{ body: '<html></html>' }]))).rejects.toBeInstanceOf(MissingVerificationTokenError)
  })

  it('records the page and the listReferrals POST', async () => {
    const raw = await fetchReferralsRaw(mockRequest([{ body: TOKEN_PAGE }, { body: JSON.stringify(BODY) }]))
    expect(raw.requests.map((r) => `${r.method} ${r.path}`)).toEqual(['GET /app/referrals', 'POST /api/referrals/listReferrals'])
    expect(raw.requests[1]!.body).toEqual(BODY)
  })
})

describe('referralsProcessor', () => {
  it('keeps every captured referral field under its own name and drops dte and the page config', () => {
    const standard = referralsProcessor.standard(envelope(BODY))
    expect(standard).toEqual({
      canSeeAuthorizations: false,
      referralList: [{
        statusString: 'Active',
        status: '1',
        referredToProviderName: 'Dr. Jones',
        referredToFacility: 'Example Medical Center',
        referredByProviderName: 'Dr. Smith',
        start: '2024-01-15',
        end: '2024-07-15',
        creationDate: '2024-01-01',
        internalId: 'R1',
        externalId: 'EXT1',
      }],
    })
  })

  it('emits every field as null on a referral with nothing in it', () => {
    const standard = referralsProcessor.standard(envelope({ referralList: [{}] }))
    expect(standard.canSeeAuthorizations).toBeNull()
    expect(Object.values(standard.referralList[0]!).every((v) => v === null)).toBe(true)
  })

  it('reports an empty list as empty', () => {
    expect(referralsProcessor.standard(envelope({ referralList: [] })).referralList).toEqual([])
    expect(referralsProcessor.standard({ requests: [] }).referralList).toEqual([])
  })

  it('projects concise to status, where to, who referred and the validity window', () => {
    expect(referralsProcessor.concise(referralsProcessor.standard(envelope(BODY)))).toEqual({
      referralList: [{
        statusString: 'Active',
        referredToProviderName: 'Dr. Jones',
        referredToFacility: 'Example Medical Center',
        referredByProviderName: 'Dr. Smith',
        start: '2024-01-15',
        end: '2024-07-15',
      }],
    })
  })
})

describe('getReferrals', () => {
  it('returns the standard object', async () => {
    const result = await getReferrals(mockRequest([{ body: TOKEN_PAGE }, { body: JSON.stringify(BODY) }]))
    expect(result.referralList[0]!.statusString).toBe('Active')
  })
})
