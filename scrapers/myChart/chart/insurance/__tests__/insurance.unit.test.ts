import { describe, it, expect, mock } from 'bun:test'
import { COVERAGE_BUCKETS, GET_COVERAGES_PATH, fetchInsuranceRaw, getInsurance, insuranceProcessor } from '../insurance'
import { MyChartRequest } from '../../../core/myChartRequest'
import { MissingVerificationTokenError } from '../../../core/util'
import { renderOutput } from '../../../processors/processor'

const TOKEN_PAGE = '<input name="__RequestVerificationToken" value="t" />'

/** The token page, then whatever GetCoverages answers with. */
function mockRequest(coverages: { body: string; status?: number; contentType?: string }) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  let i = 0
  req.transport = mock(async () => {
    if (i++ === 0) return new Response(TOKEN_PAGE, { status: 200 })
    return new Response(coverages.body, {
      status: coverages.status ?? 200,
      headers: { 'content-type': coverages.contentType ?? 'application/json' },
    })
  })
  return req
}

/** The captured field set, trimmed to the fields the processor names. */
const ACTIVE = {
  CoverageId: 'WP-1',
  CoverageName: 'Springfield Mutual (PPO)',
  Status: 0,
  CoverageType: 1,
  PayorId: '',
  PayorName: 'Springfield Mutual Health',
  PlanName: '',
  SubscriberId: 'SUB-1',
  SubscriberName: 'Alice Smith',
  SubscriberIsSelf: true,
  MemberId: 'XYZ123456',
  MemberName: 'Alice Smith',
  GroupNumber: 'GRP001',
  Comments: '',
  CvgCoveredStatus: 0,
  CvgReason: 0,
  FormattedEffectiveDate: '01/01/2026',
  FormattedEndDate: '',
  Future: false,
  Termed: false,
  SuspendedText: '',
  // Fields the processor does not name; they must not reach the standard object.
  PbiId: '',
  CoverageFHIRId: '',
  OrganizationId: '',
}

const PENDING = { ...ACTIVE, CoverageId: 'WP-2', CoverageName: 'Dental', SubscriberIsSelf: false }

function envelope(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    ActiveCoverages: [ACTIVE],
    CoveragesPendingSubmission: [PENDING],
    CoveragesPendingDeletion: [],
    CoveragesInReview: [],
    CoveragesInVerification: [],
    IsProxyContext: false,
    Settings: { IsStandAlone: true, CanUpdate: true },
    HasExistingCoveragesInRTE: false,
    ...overrides,
  })
}

describe('fetchInsuranceRaw', () => {
  it('takes the token off /Insurance and form-posts GetCoverages', async () => {
    const req = mockRequest({ body: envelope() })
    const raw = await fetchInsuranceRaw(req)
    expect(raw.requests.map((r) => r.path)).toEqual(['/Insurance', GET_COVERAGES_PATH])
    // The page is the token carrier, not a payload: `raw` mode must unwrap to
    // the coverage JSON rather than to a page of markup.
    expect(raw.requests[0]!.purpose).toBe('token')
    expect(raw.requests[1]!.requestBody).toBe(
      'isStandAlone=true&encounterCsn=&encounterDepartmentId=&encounterDTE=',
    )
    expect(renderOutput(insuranceProcessor, raw, 'raw')).toEqual(JSON.parse(envelope()))
  })

  it('throws when the page carries no antiforgery token', async () => {
    const req = new MyChartRequest('mychart.example.com')
    req.firstPathPart = 'MyChart'
    req.transport = mock(async () => new Response('<html></html>', { status: 200 }))
    await expect(fetchInsuranceRaw(req)).rejects.toBeInstanceOf(MissingVerificationTokenError)
  })
})

describe('getInsurance', () => {
  it('keeps the five workflow buckets apart and tags each coverage with its own', async () => {
    const result = await getInsurance(mockRequest({ body: envelope() }))
    expect(result.ActiveCoverages).toHaveLength(1)
    expect(result.CoveragesPendingSubmission).toHaveLength(1)
    expect(result.CoveragesPendingDeletion).toEqual([])
    expect(result.hasNoCoverages).toBe(false)
    expect(result.ActiveCoverages[0]).toEqual({
      CoverageId: 'WP-1',
      CoverageName: 'Springfield Mutual (PPO)',
      PayorId: '',
      PayorName: 'Springfield Mutual Health',
      PlanName: '',
      SubscriberId: 'SUB-1',
      SubscriberName: 'Alice Smith',
      SubscriberIsSelf: true,
      MemberId: 'XYZ123456',
      MemberName: 'Alice Smith',
      GroupNumber: 'GRP001',
      FormattedEffectiveDate: '01/01/2026',
      FormattedEndDate: '',
      Future: false,
      Termed: false,
      Comments: '',
      SuspendedText: '',
      Status: 0,
      CoverageType: 1,
      CvgCoveredStatus: 0,
      CvgReason: 0,
      bucket: 'ActiveCoverages',
    })
    expect(result.CoveragesPendingSubmission[0]!.bucket).toBe('CoveragesPendingSubmission')
    expect(result.Settings).toEqual({ IsStandAlone: true, CanUpdate: true })
    expect(result.IsProxyContext).toBe(false)
  })

  it('reports hasNoCoverages when every bucket is empty', async () => {
    const empty = JSON.stringify(
      Object.fromEntries([...COVERAGE_BUCKETS.map((b) => [b, []]), ['Settings', {}]]),
    )
    const result = await getInsurance(mockRequest({ body: empty }))
    expect(result.hasNoCoverages).toBe(true)
    expect(result.ActiveCoverages).toEqual([])
  })
})

describe('insuranceProcessor', () => {
  // Every one of these would otherwise render as "you have no insurance on
  // file", which is the sentence this capability exists not to get wrong.
  it('refuses an empty body — how MyChart answers an unknown encounter context', async () => {
    const raw = await fetchInsuranceRaw(mockRequest({ body: '' }))
    expect(() => insuranceProcessor.standard(raw)).toThrow(/empty body/)
  })

  it('refuses a non-2xx', async () => {
    const raw = await fetchInsuranceRaw(mockRequest({ body: '{}', status: 500 }))
    expect(() => insuranceProcessor.standard(raw)).toThrow(/HTTP 500/)
  })

  it('refuses a body with none of the coverage lists (a login page, say)', async () => {
    const raw = await fetchInsuranceRaw(mockRequest({ body: '<html>Sign in</html>', contentType: 'text/html' }))
    expect(() => insuranceProcessor.standard(raw)).toThrow(/none of the coverage lists/)
  })

  it('refuses an envelope the request never reached', () => {
    expect(() => insuranceProcessor.standard({ requests: [] })).toThrow(/returned HTTP nothing/)
  })

  it('concise flattens to one list, keeping the bucket on each coverage', async () => {
    const raw = await fetchInsuranceRaw(mockRequest({ body: envelope() }))
    expect(insuranceProcessor.concise(insuranceProcessor.standard(raw))).toEqual({
      coverages: [
        {
          CoverageName: 'Springfield Mutual (PPO)',
          PayorName: 'Springfield Mutual Health',
          MemberId: 'XYZ123456',
          GroupNumber: 'GRP001',
          FormattedEffectiveDate: '01/01/2026',
          bucket: 'ActiveCoverages',
        },
        {
          CoverageName: 'Dental',
          PayorName: 'Springfield Mutual Health',
          MemberId: 'XYZ123456',
          GroupNumber: 'GRP001',
          FormattedEffectiveDate: '01/01/2026',
          bucket: 'CoveragesPendingSubmission',
        },
      ],
      hasNoCoverages: false,
    })
    const concise = renderOutput(insuranceProcessor, raw, 'concise') as string
    expect(concise).toContain('XYZ123456')
    expect(concise).not.toContain('SUB-1')
    expect(renderOutput(insuranceProcessor, raw, 'standard')).toContain('Springfield Mutual Health')
  })
})
