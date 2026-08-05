import { describe, it, expect, mock } from 'bun:test'
import { getVitals } from '../vitals'
import { MyChartRequest } from '../myChartRequest'

function mockRequest(responses: Array<{ body: string }>) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  let i = 0
  req.fetchWithCookieJar = mock(async () => {
    const r = responses[i++] ?? { body: '{}' }
    return new Response(r.body, { status: 200 })
  }) as typeof req.fetchWithCookieJar
  return req
}

const TOKEN = { body: '<input name="__RequestVerificationToken" value="t" />' }
const ROWS = [
  { id: 'row-bp', name: 'Blood Pressure', unitsDisplayName: 'mmHg' },
  { id: 'row-wt', name: 'Weight', unitsDisplayName: 'lbs' },
]

describe('getVitals', () => {
  it('returns empty array when no token found', async () => {
    const req = mockRequest([{ body: '<html></html>' }])
    expect(await getVitals(req)).toEqual([])
  })

  it('fetches readings (2nd call) and groups them by vital type', async () => {
    const req = mockRequest([
      TOKEN,
      { body: JSON.stringify({ flowsheets: [{ episodeId: 'EP-1', name: 'Vitals Trending', rows: ROWS, readings: [] }] }) },
      { body: JSON.stringify({ flowsheet: { episodeId: 'EP-1', rows: ROWS, hasMoreData: false, readings: [
        { rowId: 'row-bp', instantTakenIso: '2025-08-11T06:29:00', stringValue: '123/81', isAbnormal: false, entryType: 'clinical' },
        { rowId: 'row-wt', instantTakenIso: '2025-08-11T06:29:00', numericValue: 175, isAbnormal: true, entryType: 'clinical' },
      ] } }) },
    ])

    const result = await getVitals(req)

    const bp = result.find(f => f.name === 'Blood Pressure')
    expect(bp).toBeDefined()
    expect(bp!.flowsheetId).toBe('row-bp')
    expect(bp!.readings).toEqual([
      { date: '2025-08-11T06:29:00', value: '123/81', units: 'mmHg', isAbnormal: false, entryType: 'clinical' },
    ])

    const wt = result.find(f => f.name === 'Weight')
    expect(wt!.readings[0]).toEqual({ date: '2025-08-11T06:29:00', value: '175', units: 'lbs', isAbnormal: true, entryType: 'clinical' })
  })

  it('pages backwards through history via nextReadingDateIso', async () => {
    const req = mockRequest([
      TOKEN,
      { body: JSON.stringify({ flowsheets: [{ episodeId: 'EP-1', rows: [ROWS[0]], readings: [] }] }) },
      { body: JSON.stringify({ flowsheet: { episodeId: 'EP-1', rows: [ROWS[0]], hasMoreData: true, nextReadingDateIso: '2025-08-01T00:00:00', readings: [
        { rowId: 'row-bp', instantTakenIso: '2025-08-11T06:29:00', stringValue: '123/81' },
      ] } }) },
      { body: JSON.stringify({ flowsheet: { episodeId: 'EP-1', rows: [ROWS[0]], hasMoreData: false, readings: [
        { rowId: 'row-bp', instantTakenIso: '2025-07-15T09:00:00', stringValue: '118/79' },
      ] } }) },
    ])

    const result = await getVitals(req)
    const bp = result.find(f => f.name === 'Blood Pressure')!
    expect(bp.readings.map(r => r.value)).toEqual(['123/81', '118/79'])
  })

  it('skips flowsheets without an episodeId', async () => {
    const req = mockRequest([
      TOKEN,
      { body: JSON.stringify({ flowsheets: [{ name: 'Vitals Trending', rows: ROWS }] }) },
    ])
    expect(await getVitals(req)).toEqual([])
  })

  it('handles empty flowsheets list', async () => {
    const req = mockRequest([TOKEN, { body: JSON.stringify({ flowsheets: [] }) }])
    expect(await getVitals(req)).toEqual([])
  })
})
