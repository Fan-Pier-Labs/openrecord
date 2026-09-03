import { describe, it, expect, mock } from 'bun:test'
import { getInsurance, fetchInsuranceRaw, insuranceProcessor, parseInsuranceHtml } from '../insurance'
import { MyChartRequest } from '../../../core/myChartRequest'
import { renderOutput } from '../../../processors/processor'

function mockRequest(body: string) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  req.transport = mock(async () => {
    return new Response(body, { status: 200 })
  })
  return req
}

const ONE_COVERAGE = `
  <html><body>
    <h1>Insurance</h1>
    <div class="coverage-card">
      <h3>Blue Cross Blue Shield</h3>
      <span class="subscriber-name">Alice Smith</span>
      <span class="member-id">XYZ123456</span>
      <span class="group-number">GRP001</span>
      <div class="detail">Effective: 01/01/2024</div>
      <div class="detail">Co-pay: $20</div>
    </div>
  </body></html>
`

describe('getInsurance', () => {
  it('parses insurance coverages from structured HTML', async () => {
    const result = await getInsurance(mockRequest(ONE_COVERAGE))
    expect(result.hasCoverages).toBe(true)
    expect(result.coverages).toHaveLength(1)
    expect(result.coverages[0]).toEqual({
      planName: 'Blue Cross Blue Shield',
      subscriberName: 'Alice Smith',
      memberId: 'XYZ123456',
      groupNumber: 'GRP001',
      details: ['Effective: 01/01/2024', 'Co-pay: $20'],
    })
    // The audit trail: the page as text, markup gone, blocks on their own lines.
    expect(result.pageText.startsWith('Insurance')).toBe(true)
    expect(result.pageText).toContain('Blue Cross Blue Shield')
    expect(result.pageText).toContain('Alice Smith XYZ123456 GRP001')
    expect(result.pageText).toContain('Effective: 01/01/2024\nCo-pay: $20')
    expect(result.pageText).not.toContain('<')
  })

  it('records the page as the one raw request', async () => {
    const raw = await fetchInsuranceRaw(mockRequest(ONE_COVERAGE))
    expect(raw.requests).toHaveLength(1)
    expect(raw.requests[0]).toMatchObject({ path: '/Insurance', method: 'GET', status: 200, body: ONE_COVERAGE })
    expect(renderOutput(insuranceProcessor, raw, 'raw')).toBe(ONE_COVERAGE)
  })

  it('parses multiple coverages', async () => {
    const html = `
      <div class="insurance-card"><h4>Medical Plan</h4></div>
      <div class="insurance-card"><h4>Dental Plan</h4></div>
    `
    const result = await getInsurance(mockRequest(html))
    expect(result.coverages).toHaveLength(2)
    expect(result.coverages[0]!.planName).toBe('Medical Plan')
    expect(result.coverages[1]!.planName).toBe('Dental Plan')
    expect(result.coverages[0]).toMatchObject({ subscriberName: '', memberId: '', groupNumber: '', details: [] })
  })

  it('reports hasCoverages=false when page says no coverages, keeping the page text', async () => {
    const html = '<html><body>You do not have any available coverages on file.</body></html>'
    const result = await getInsurance(mockRequest(html))
    expect(result).toEqual({
      coverages: [],
      hasCoverages: false,
      pageText: 'You do not have any available coverages on file.',
    })
  })

  it('reports hasCoverages=true when page has no warning text', async () => {
    const html = '<html><body><p>Insurance information</p></body></html>'
    const result = await getInsurance(mockRequest(html))
    expect(result.coverages).toEqual([])
    expect(result.hasCoverages).toBe(true)
  })

  it('skips cards without a plan name', async () => {
    const html = `
      <div class="coverage-card">
        <h3></h3>
        <span class="member-id">ABC</span>
      </div>
    `
    expect(parseInsuranceHtml(html).coverages).toEqual([])
  })
})

describe('insuranceProcessor', () => {
  it('reads an empty envelope as no coverages on a blank page', () => {
    expect(insuranceProcessor.standard({ requests: [] })).toEqual({ coverages: [], hasCoverages: true, pageText: '' })
  })

  it('concise keeps the plan, member and group and drops the audit trail', async () => {
    const raw = await fetchInsuranceRaw(mockRequest(ONE_COVERAGE))
    expect(insuranceProcessor.concise(insuranceProcessor.standard(raw))).toEqual({
      coverages: [{ planName: 'Blue Cross Blue Shield', memberId: 'XYZ123456', groupNumber: 'GRP001' }],
      hasCoverages: true,
    })
    const concise = renderOutput(insuranceProcessor, raw, 'concise') as string
    expect(concise).toContain('XYZ123456')
    expect(concise).not.toContain('pageText')
    expect(concise).not.toContain('Alice Smith')
    expect(renderOutput(insuranceProcessor, raw, 'standard')).toContain('| Blue Cross Blue Shield | Alice Smith | XYZ123456 | GRP001 |')
  })
})
