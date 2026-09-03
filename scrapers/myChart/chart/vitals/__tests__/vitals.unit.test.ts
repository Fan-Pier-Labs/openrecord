import { describe, it, expect, mock } from 'bun:test'
import { getVitals, fetchVitalsRaw, vitalsProcessor, readingValue } from '../vitals'
import { MyChartRequest } from '../../../core/myChartRequest'
import { MissingVerificationTokenError } from '../../../core/util'
import { renderOutput } from '../../../processors/processor'

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
  { id: 'row-bp', name: 'Blood Pressure', unitsDisplayName: 'mmHg', rowType: 'BP', valueType: 'String', decimalPlaces: 0 },
  { id: 'row-wt', name: 'Weight', unitsDisplayName: 'lbs' },
]

describe('getVitals', () => {
  it('throws when no token found', async () => {
    const req = mockRequest([{ body: '<html></html>' }])
    await expect(getVitals(req)).rejects.toBeInstanceOf(MissingVerificationTokenError)
  })

  it('fetches readings (2nd call), joins them onto the episode and keeps the row metadata', async () => {
    const req = mockRequest([
      TOKEN,
      // GetFlowsheets — definitions only, readings always empty here
      { body: JSON.stringify({ flowsheets: [{ episodeId: 'EP-1', name: 'Vitals Trending', status: 'Active', rows: ROWS, rowGroups: [{ id: 'g', name: 'BP', rowIds: ['row-bp'] }], readings: [] }] }) },
      // GetFlowsheetReadings — the actual data, keyed by rowId
      { body: JSON.stringify({ flowsheet: { episodeId: 'EP-1', rows: ROWS, hasMoreData: false, readings: [
        { rowId: 'row-bp', instantTakenIso: '2025-08-11T06:29:00', timeZone: 'America/New_York', stringValue: '123/81', isAbnormal: false, entryType: 'clinical', documentationSource: 'Clinic' },
        { rowId: 'row-wt', instantTakenIso: '2025-08-11T06:29:00', numericValue: 175, isAbnormal: true, entryType: 'clinical' },
      ] } }) },
    ])

    const result = await getVitals(req)
    expect(result.flowsheets).toHaveLength(1)
    const fs = result.flowsheets[0]!
    expect(fs.name).toBe('Vitals Trending')
    expect(fs.status).toBe('Active')
    expect(fs.rows[0]).toEqual({ id: 'row-bp', name: 'Blood Pressure', unitsDisplayName: 'mmHg', rowType: 'BP', valueType: 'String', decimalPlaces: 0 })
    expect(fs.rows[1]).toEqual({ id: 'row-wt', name: 'Weight', unitsDisplayName: 'lbs', rowType: null, valueType: null, decimalPlaces: null })
    expect(fs.rowGroups).toEqual([{ id: 'g', name: 'BP', rowIds: ['row-bp'] }])
    expect(fs.readings).toEqual([
      { rowId: 'row-bp', instantTakenIso: '2025-08-11T06:29:00', timeZone: 'America/New_York', stringValue: '123/81', numericValue: null, value: '123/81', isAbnormal: false, entryType: 'clinical', documentationSource: 'Clinic' },
      { rowId: 'row-wt', instantTakenIso: '2025-08-11T06:29:00', timeZone: null, stringValue: null, numericValue: 175, value: '175', isAbnormal: true, entryType: 'clinical', documentationSource: null },
    ])
  })

  it('records every request in the raw envelope with the episode it was for', async () => {
    const req = mockRequest([
      TOKEN,
      { body: JSON.stringify({ flowsheets: [{ episodeId: 'EP-1', rows: ROWS }] }) },
      { body: JSON.stringify({ flowsheet: { episodeId: 'EP-1', readings: [] } }) },
    ])
    const raw = await fetchVitalsRaw(req)
    expect(raw.requests.map((r) => r.path)).toEqual([
      '/app/track-my-health',
      '/api/track-my-health/GetFlowsheets',
      '/api/track-my-health/GetFlowsheetReadings',
    ])
    expect(raw.requests[2]!.requestBody).toMatchObject({ episodeId: 'EP-1', numReadings: 1000 })
  })

  it('reads numeric vitals whose stringValue is present but empty', async () => {
    // The real regression: MyChart sends BOTH fields, so numeric rows arrive as
    // numericValue alongside an EMPTY stringValue. Preferring a non-nullish
    // stringValue blanked every Pulse and Weight reading.
    const rows = [...ROWS, { id: 'row-hr', name: 'Pulse', unitsDisplayName: '' }]
    const req = mockRequest([
      TOKEN,
      { body: JSON.stringify({ flowsheets: [{ episodeId: 'EP-1', rows, readings: [] }] }) },
      { body: JSON.stringify({ flowsheet: { episodeId: 'EP-1', rows, hasMoreData: false, readings: [
        { rowId: 'row-bp', instantTakenIso: '2025-08-11T06:29:00', stringValue: '123/81' },
        { rowId: 'row-hr', instantTakenIso: '2025-08-11T06:29:00', stringValue: '', numericValue: 88 },
        { rowId: 'row-wt', instantTakenIso: '2025-08-11T06:29:00', stringValue: '  ', numericValue: 175.5 },
      ] } }) },
    ])

    const readings = (await getVitals(req)).flowsheets[0]!.readings
    expect(readings.find((r) => r.rowId === 'row-hr')!.value).toBe('88')
    expect(readings.find((r) => r.rowId === 'row-wt')!.value).toBe('175.5')
    expect(readings.find((r) => r.rowId === 'row-bp')!.value).toBe('123/81')
    expect(readingValue({})).toBe('')
  })

  it('backfills row metadata from the readings page when GetFlowsheets omitted it', async () => {
    const req = mockRequest([
      TOKEN,
      { body: JSON.stringify({ flowsheets: [{ episodeId: 'EP-1' }] }) },
      { body: JSON.stringify({ flowsheet: { episodeId: 'EP-1', rows: [ROWS[1]], readings: [
        { rowId: 'row-wt', instantTakenIso: '2025-08-11T06:29:00', numericValue: 1 },
      ] } }) },
    ])
    const fs = (await getVitals(req)).flowsheets[0]!
    expect(fs.rows.map((r) => r.name)).toEqual(['Weight'])
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

    const bp = (await getVitals(req)).flowsheets[0]!
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

    const readings = (await getVitals(req)).flowsheets[0]!.readings
    expect(readings.map(r => r.instantTakenIso)).toEqual(['2026-04-13T14:00:00', '2026-04-13T08:00:00'])
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

    const readings = (await getVitals(req)).flowsheets[0]!.readings
    expect(readings.map(r => r.instantTakenIso)).toEqual([
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
    expect(result.flowsheets[0]!.readings).toHaveLength(1)
  })

  it('skips flowsheets without an episodeId', async () => {
    const req = mockRequest([
      TOKEN,
      { body: JSON.stringify({ flowsheets: [{ name: 'Vitals Trending', rows: ROWS }] }) },
    ])
    const result = await getVitals(req)
    // The definition is still reported — it is a real episode — with no readings.
    expect(result.flowsheets).toHaveLength(1)
    expect(result.flowsheets[0]!.readings).toEqual([])
  })

  it('handles empty flowsheets list', async () => {
    const req = mockRequest([TOKEN, { body: JSON.stringify({ flowsheets: [] }) }])
    expect(await getVitals(req)).toEqual({ flowsheets: [] })
  })
})

describe('vitalsProcessor.concise', () => {
  it('reports per row the latest reading, the count and the abnormal ones', () => {
    const concise = vitalsProcessor.concise({
      flowsheets: [{
        name: 'Vitals', status: null, startDateIso: null, endDateIso: null, instructions: null, rowGroups: [],
        rows: [{ id: 'row-bp', name: 'Blood Pressure', unitsDisplayName: 'mmHg', rowType: null, valueType: null, decimalPlaces: null }],
        readings: [
          { rowId: 'row-bp', instantTakenIso: '2026-01-02T10:00:00', timeZone: null, stringValue: '150/95', numericValue: null, value: '150/95', isAbnormal: true, entryType: null, documentationSource: null },
          { rowId: 'row-bp', instantTakenIso: '2026-01-03T10:00:00', timeZone: null, stringValue: '120/80', numericValue: null, value: '120/80', isAbnormal: false, entryType: null, documentationSource: null },
        ],
      }],
    }) as { flowsheets: Array<{ rows: Array<Record<string, unknown>> }> }
    expect(concise.flowsheets[0]!.rows[0]).toEqual({
      name: 'Blood Pressure',
      unitsDisplayName: 'mmHg',
      readingCount: 2,
      latestReading: { instantTakenIso: '2026-01-03T10:00:00', value: '120/80', isAbnormal: false },
      abnormalReadings: [{ instantTakenIso: '2026-01-02T10:00:00', value: '150/95' }],
    })
  })

  it('reports a row with no readings as such rather than dropping it', () => {
    const concise = vitalsProcessor.concise({
      flowsheets: [{ name: 'V', status: null, startDateIso: null, endDateIso: null, instructions: null, rowGroups: [], rows: [{ id: 'r', name: 'Pulse', unitsDisplayName: 'bpm', rowType: null, valueType: null, decimalPlaces: null }], readings: [] }],
    }) as { flowsheets: Array<{ rows: Array<Record<string, unknown>> }> }
    expect(concise.flowsheets[0]!.rows[0]).toMatchObject({ readingCount: 0, latestReading: null, abnormalReadings: [] })
  })

  it('renders through every mode', async () => {
    const req = mockRequest([
      TOKEN,
      { body: JSON.stringify({ flowsheets: [{ episodeId: 'EP-1', name: 'Vitals', rows: [ROWS[0]] }] }) },
      { body: JSON.stringify({ flowsheet: { episodeId: 'EP-1', readings: [{ rowId: 'row-bp', instantTakenIso: '2026-01-03T10:00:00', stringValue: '120/80' }] } }) },
    ])
    const raw = await fetchVitalsRaw(req)
    expect(renderOutput(vitalsProcessor, raw, 'raw')).toBe(raw)
    expect(renderOutput(vitalsProcessor, raw, 'standard')).toContain('| 120/80 |')
    expect(renderOutput(vitalsProcessor, raw, 'concise')).toContain('- **readingCount**: 1')
  })
})
