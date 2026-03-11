import { describe, it, expect, mock } from 'bun:test'
import { getInsurance } from '../insurance'
import { MyChartRequest } from '../myChartRequest'

function mockRequest(body: string) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  req.fetchWithCookieJar = mock(async () => {
    return new Response(body, { status: 200 })
  }) as typeof req.fetchWithCookieJar
  return req
}

describe('getInsurance', () => {
  it('parses insurance coverages from structured HTML', async () => {
    const html = `
      <html><body>
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
    const result = await getInsurance(mockRequest(html))
    expect(result.hasCoverages).toBe(true)
    expect(result.coverages).toHaveLength(1)
    expect(result.coverages[0]).toEqual({
      planName: 'Blue Cross Blue Shield',
      subscriberName: 'Alice Smith',
      memberId: 'XYZ123456',
      groupNumber: 'GRP001',
      details: ['Effective: 01/01/2024', 'Co-pay: $20'],
    })
  })

  it('parses multiple coverages', async () => {
    const html = `
      <div class="insurance-card"><h4>Medical Plan</h4></div>
      <div class="insurance-card"><h4>Dental Plan</h4></div>
    `
    const result = await getInsurance(mockRequest(html))
    expect(result.coverages).toHaveLength(2)
    expect(result.coverages[0].planName).toBe('Medical Plan')
    expect(result.coverages[1].planName).toBe('Dental Plan')
  })

  it('reports hasCoverages=false when page says no coverages', async () => {
    const html = '<html><body>You do not have any available coverages on file.</body></html>'
    const result = await getInsurance(mockRequest(html))
    expect(result.coverages).toEqual([])
    expect(result.hasCoverages).toBe(false)
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
    const result = await getInsurance(mockRequest(html))
    expect(result.coverages).toEqual([])
  })
})
