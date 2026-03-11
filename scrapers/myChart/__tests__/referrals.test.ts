import { describe, it, expect, mock } from 'bun:test'
import { getReferrals } from '../referrals'
import { MyChartRequest } from '../myChartRequest'

function mockRequest(responses: Array<{ body: string }>) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  let i = 0
  req.fetchWithCookieJar = mock(async () => {
    const r = responses[i++]
    return new Response(r.body, { status: 200 })
  }) as typeof req.fetchWithCookieJar
  return req
}

describe('getReferrals', () => {
  it('returns empty array when no token found', async () => {
    const req = mockRequest([{ body: '<html></html>' }])
    expect(await getReferrals(req)).toEqual([])
  })

  it('parses referrals from API response', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      {
        body: JSON.stringify({
          referralList: [
            {
              internalId: 'R1',
              externalId: 'EXT1',
              status: 'active',
              statusString: 'Active',
              creationDate: '2024-01-01',
              start: '2024-01-15',
              end: '2024-07-15',
              referredByProviderName: 'Dr. Smith',
              referredToProviderName: 'Dr. Jones',
              referredToFacility: 'Example Medical Center',
            },
          ],
        }),
      },
    ])

    const result = await getReferrals(req)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      internalId: 'R1',
      externalId: 'EXT1',
      status: 'active',
      statusString: 'Active',
      creationDate: '2024-01-01',
      startDate: '2024-01-15',
      endDate: '2024-07-15',
      referredByProviderName: 'Dr. Smith',
      referredToProviderName: 'Dr. Jones',
      referredToFacility: 'Example Medical Center',
    })
  })

  it('handles missing fields with defaults', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      { body: JSON.stringify({ referralList: [{}] }) },
    ])

    const result = await getReferrals(req)
    expect(result[0]).toEqual({
      internalId: '',
      externalId: '',
      status: '',
      statusString: '',
      creationDate: '',
      startDate: '',
      endDate: '',
      referredByProviderName: '',
      referredToProviderName: '',
      referredToFacility: '',
    })
  })

  it('handles empty referral list', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      { body: JSON.stringify({ referralList: [] }) },
    ])
    expect(await getReferrals(req)).toEqual([])
  })
})
