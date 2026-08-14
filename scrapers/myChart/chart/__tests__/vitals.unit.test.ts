import { describe, it, expect, mock } from 'bun:test'
import { getVitals } from '../vitals'
import { MyChartRequest } from '../../core/myChartRequest'

function mockRequest(responses: Array<{ body: string }>) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  let i = 0
  req.transport = mock(async () => {
    const r = responses[i++] ?? { body: '{}' }
    return new Response(r.body, { status: 200 })
  })
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
      // GetFlowsheets — definitions only, readings always empty here
      { body: JSON.stringify({ flowsheets: [{ episodeId: 'EP-1', name: 'Vitals Trending', rows: ROWS, readings: [] }] }) },
      // GetFlowsheetReadings — the actual data, keyed by rowId
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

  it('pages backwards through history', async () => {
    const req = mockRequest([
      TOKEN,
      { body: JSON.stringify({ flowsheets: [{ episodeId: 'EP-1', rows: [ROWS[0]], readings: [] }] }) },
      // page 1 — hasMoreData true
      { body: JSON.stringify({ flowsheet: { episodeId: 'EP-1', rows: [ROWS[0]], hasMoreData: true, nextReadingDateIso: '2025-08-01T00:00:00', readings: [
        { rowId: 'row-bp', instantTakenIso: '2025-08-11T06:29:00', stringValue: '123/81' },
      ] } }) },
      // page 2 — hasMoreData false, stop
      { body: JSON.stringify({ flowsheet: { episodeId: 'EP-1', rows: [ROWS[0]], hasMoreData: false, readings: [
        { rowId: 'row-bp', instantTakenIso: '2025-07-15T09:00:00', stringValue: '118/79' },
      ] } }) },
    ])

    const result = await getVitals(req)
    const bp = result.find(f => f.name === 'Blood Pressure')!
    expect(bp.readings.map(r => r.value)).toEqual(['123/81', '118/79'])
  })

  it('keeps paging when hasMoreData is false but older readings remain', async () => {
    // The real regression: MyChart returned hasMoreData:false on the first page
    // while older instants still existed, capping history at numReadings instants.
    // Pagination must be driven by the oldest instant seen, not by hasMoreData.
    const req = mockRequest([
      TOKEN,
      { body: JSON.stringify({ flowsheets: [{ episodeId: 'EP-1', rows: [ROWS[0]], readings: [] }] }) },
      { body: JSON.stringify({ flowsheet: { episodeId: 'EP-1', rows: [ROWS[0]], hasMoreData: false, readings: [
        { rowId: 'row-bp', instantTakenIso: '2026-04-13T14:00:00', stringValue: '127/62' },
      ] } }) },
      { body: JSON.stringify({ flowsheet: { episodeId: 'EP-1', rows: [ROWS[0]], hasMoreData: false, readings: [
        { rowId: 'row-bp', instantTakenIso: '2026-04-13T08:00:00', stringValue: '144/66' },
      ] } }) },
      { body: JSON.stringify({ flowsheet: { episodeId: 'EP-1', rows: [ROWS[0]], hasMoreData: false, readings: [
        { rowId: 'row-bp', instantTakenIso: '2026-04-13T08:00:00', stringValue: '144/66' },
      ] } }) },
    ])

    const result = await getVitals(req)
    const bp = result.find(f => f.name === 'Blood Pressure')!
    expect(bp.readings.map(r => r.date)).toEqual(['2026-04-13T14:00:00', '2026-04-13T08:00:00'])
  })

  it('dedupes the boundary instant repeated across pages', async () => {
    const req = mockRequest([
      TOKEN,
      { body: JSON.stringify({ flowsheets: [{ episodeId: 'EP-1', rows: [ROWS[0]], readings: [] }] }) },
      { body: JSON.stringify({ flowsheet: { episodeId: 'EP-1', rows: [ROWS[0]], hasMoreData: true, readings: [
        { rowId: 'row-bp', instantTakenIso: '2026-05-02T10:00:00', stringValue: '130/80' },
        { rowId: 'row-bp', instantTakenIso: '2026-05-01T10:00:00', stringValue: '120/70' },
      ] } }) },
      // Page 2 ends AT the previous page's oldest instant, so it repeats it.
      { body: JSON.stringify({ flowsheet: { episodeId: 'EP-1', rows: [ROWS[0]], hasMoreData: true, readings: [
        { rowId: 'row-bp', instantTakenIso: '2026-05-01T10:00:00', stringValue: '120/70' },
        { rowId: 'row-bp', instantTakenIso: '2026-04-30T10:00:00', stringValue: '110/60' },
      ] } }) },
      { body: JSON.stringify({ flowsheet: { episodeId: 'EP-1', rows: [ROWS[0]], hasMoreData: false, readings: [
        { rowId: 'row-bp', instantTakenIso: '2026-04-30T10:00:00', stringValue: '110/60' },
      ] } }) },
    ])

    const result = await getVitals(req)
    const bp = result.find(f => f.name === 'Blood Pressure')!
    expect(bp.readings.map(r => r.date)).toEqual([
      '2026-05-02T10:00:00', '2026-05-01T10:00:00', '2026-04-30T10:00:00',
    ])
  })

  it('stops when a page reaches no further back', async () => {
    // Every page returns the same instant; must terminate, not spin to MAX_PAGES.
    const page = { body: JSON.stringify({ flowsheet: { episodeId: 'EP-1', rows: [ROWS[0]], hasMoreData: true, nextReadingDateIso: '2026-05-01T10:00:00', readings: [
      { rowId: 'row-bp', instantTakenIso: '2026-05-01T10:00:00', stringValue: '120/70' },
    ] } }) }
    const req = mockRequest([
      TOKEN,
      { body: JSON.stringify({ flowsheets: [{ episodeId: 'EP-1', rows: [ROWS[0]], readings: [] }] }) },
      page, page, page, page,
    ])

    const result = await getVitals(req)
    const bp = result.find(f => f.name === 'Blood Pressure')!
    expect(bp.readings).toHaveLength(1)
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
