import { describe, it, expect, mock } from 'bun:test'
import { getUpcomingOrders, fetchUpcomingOrdersRaw, upcomingOrdersProcessor } from '../upcomingOrders'
import { resolveProviderName } from '../upcomingOrders.processor'
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

/** The captured envelope: three maps, all empty on every real account. */
const EMPTY = { orderGroupList: {}, orderList: {}, providerList: {}, upcomingOrdersSettings: { canHideOrUnhideReminders: false } }

function envelope(body: unknown): RawResponse {
  return { requests: [{ path: '/api/upcoming-orders/GetUpcomingOrders', method: 'POST', requestBody: {}, status: 200, contentType: 'application/json', body }] }
}

describe('fetchUpcomingOrdersRaw', () => {
  it('throws rather than returning no orders when the page has no token', async () => {
    await expect(fetchUpcomingOrdersRaw(mockRequest([{ body: '<html></html>' }]))).rejects.toBeInstanceOf(MissingVerificationTokenError)
  })

  it('records the page and the GetUpcomingOrders POST', async () => {
    const raw = await fetchUpcomingOrdersRaw(mockRequest([{ body: TOKEN_PAGE }, { body: JSON.stringify(EMPTY) }]))
    expect(raw.requests.map((r) => `${r.method} ${r.path}`)).toEqual(['GET /app/upcoming-orders', 'POST /api/upcoming-orders/GetUpcomingOrders'])
    expect(raw.requests[1]!.body).toEqual(EMPTY)
  })
})

describe('upcomingOrdersProcessor', () => {
  it('reports the captured empty maps as no orders', () => {
    expect(upcomingOrdersProcessor.standard(envelope(EMPTY))).toEqual({ orderList: [], orderGroupList: {} })
    expect(upcomingOrdersProcessor.standard({ requests: [] })).toEqual({ orderList: [], orderGroupList: {} })
  })

  // The element is uncaptured, so whatever the map holds passes through whole.
  it('passes each orderList value through whole with providerName joined from providerList', () => {
    const standard = upcomingOrdersProcessor.standard(envelope({
      orderList: { 'ORD-1': { orderName: 'CBC', someProviderKey: 'PROV-1', status: 'Pending' } },
      orderGroupList: { 'G-1': { name: 'Labs' } },
      providerList: { 'PROV-1': { name: 'Dr. Smith' } },
    }))
    expect(standard).toEqual({
      orderList: [{ orderName: 'CBC', someProviderKey: 'PROV-1', status: 'Pending', providerName: 'Dr. Smith' }],
      orderGroupList: { 'G-1': { name: 'Labs' } },
    })
  })

  it('emits providerName as null when the order joins to nothing', () => {
    const standard = upcomingOrdersProcessor.standard(envelope({ orderList: { 'ORD-1': { orderName: 'CBC' } }, providerList: {} }))
    expect(standard.orderList[0]).toEqual({ orderName: 'CBC', providerName: null })
  })

  it('resolves a provider entry given as a string, by name, or by displayName', () => {
    expect(resolveProviderName({ p: 'A' }, { A: 'Dr. A' })).toBe('Dr. A')
    expect(resolveProviderName({ p: 'B' }, { B: { displayName: 'Dr. B' } })).toBe('Dr. B')
    expect(resolveProviderName({ p: 'C' }, { C: { other: 'x' } })).toBeNull()
    expect(resolveProviderName({ p: 1 }, { 1: 'Dr. One' })).toBeNull()
  })

  it('projects concise to the order list', () => {
    const standard = upcomingOrdersProcessor.standard(envelope({ orderList: { 'ORD-1': { orderName: 'CBC' } }, orderGroupList: { g: 1 } }))
    expect(upcomingOrdersProcessor.concise(standard)).toEqual({ orderList: [{ orderName: 'CBC', providerName: null }] })
  })
})

describe('getUpcomingOrders', () => {
  it('returns the standard object', async () => {
    expect(await getUpcomingOrders(mockRequest([{ body: TOKEN_PAGE }, { body: JSON.stringify(EMPTY) }]))).toEqual({ orderList: [], orderGroupList: {} })
  })
})
