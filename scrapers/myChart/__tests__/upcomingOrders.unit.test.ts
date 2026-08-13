import { describe, it, expect, mock } from 'bun:test'
import { getUpcomingOrders } from '../upcomingOrders'
import { MyChartRequest } from '../myChartRequest'

function mockRequest(responses: Array<{ body: string }>) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  let i = 0
  req.transport = mock(async () => {
    const r = responses[i++]
    return new Response(r!.body, { status: 200 })
  })
  return req
}

describe('getUpcomingOrders', () => {
  it('returns empty array when no token found', async () => {
    const req = mockRequest([{ body: '<html></html>' }])
    expect(await getUpcomingOrders(req)).toEqual([])
  })

  it('parses orders from API response', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      {
        body: JSON.stringify({
          orderList: {
            'ORD-1': {
              orderName: 'CBC',
              orderType: 'Lab',
              status: 'Pending',
              orderedDate: '2024-03-01',
              orderedByProvider: 'Dr. Smith',
              facilityName: 'Quest Diagnostics',
            },
          },
        }),
      },
    ])

    const result = await getUpcomingOrders(req)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      orderName: 'CBC',
      orderType: 'Lab',
      status: 'Pending',
      orderedDate: '2024-03-01',
      orderedByProvider: 'Dr. Smith',
      facilityName: 'Quest Diagnostics',
    })
  })

  it('handles missing fields with defaults', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      { body: JSON.stringify({ orderList: { 'ORD-1': {} } }) },
    ])

    const result = await getUpcomingOrders(req)
    expect(result[0]).toEqual({
      orderName: '',
      orderType: '',
      status: '',
      orderedDate: '',
      orderedByProvider: '',
      facilityName: '',
    })
  })

  it('handles empty orders list', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      { body: JSON.stringify({ orderList: {} }) },
    ])
    expect(await getUpcomingOrders(req)).toEqual([])
  })
})
