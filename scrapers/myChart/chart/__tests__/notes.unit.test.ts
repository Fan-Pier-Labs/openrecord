import { describe, it, expect, mock } from 'bun:test'
import {
  getVisitNotes,
  getNoteContent,
  getVisitAVS,
  fetchVisitNotesRaw,
  fetchNoteContentRaw,
  fetchVisitAvsRaw,
  visitNotesProcessor,
  noteContentProcessor,
} from '../notes'
import { MyChartRequest } from '../../core/myChartRequest'
import { MissingVerificationTokenError } from '../../core/util'
import { renderOutput } from '../../processors/processor'
import type { RawResponse } from '../../core/rawResponse'

function mockRequest(responses: Array<{ body: string; contentType?: string; server?: string }>) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  let i = 0
  req.transport = mock(async () => {
    const r = responses[i++]
    if (!r) throw new Error(`unexpected request #${i}`)
    const headers: Record<string, string> = {}
    if (r.contentType !== undefined) headers['content-type'] = r.contentType
    if (r.server !== undefined) headers['server'] = r.server
    return new Response(r.body, { status: 200, headers })
  })
  return req
}

function mockRecordingRequest(responses: Array<{ body: string; contentType: string }>) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  const calls: Array<{ url: string; init?: RequestInit | undefined }> = []
  let i = 0
  req.transport = mock(async (url: string, init?: RequestInit) => {
    calls.push({ url: url.toString(), init })
    const r = responses[i++]
    if (!r) throw new Error(`unexpected request #${i}`)
    return new Response(r.body, { status: 200, headers: { 'content-type': r.contentType } })
  })
  return { req, calls }
}

const TOKEN = { body: '<input name="__RequestVerificationToken" value="csrf_token" />', contentType: 'text/html' }
const JSON_TYPE = 'application/json; charset=utf-8'

describe('getVisitNotes', () => {
  const apiResponse = {
    lrpID: 'WP-lrp-abc',
    depPhoneNumber: '555-111-2222',
    isAtLeastOneNoteSensitive: false,
    noteList: [
      {
        hnoID: 'WP-hno-1',
        hnoDAT: 'WP-dat-1',
        displayName: 'Anesthesia Procedure Notes',
        iso: '2026-05-11T13:47:52-04:00',
        isAddendum: false,
        provider: { name: 'Dr. First, MD', hasPhotoOnBlob: false, magicID: 'WP-mid-1' },
        isNoteSensitive: false,
        attachments: [],
      },
      {
        hnoID: 'WP-hno-2',
        hnoDAT: 'WP-dat-2',
        displayName: 'Operative Note',
        iso: '2026-05-11T16:05:00-04:00',
        isAddendum: true,
        provider: { name: 'Dr. Second, MD', hasPhotoOnBlob: true, magicID: 'WP-mid-2' },
        isNoteSensitive: true,
        attachments: [{ some: 'attachment' }],
      },
    ],
  }

  it('keeps MyChart spelling, echoes the csn, and drops the photo flag', async () => {
    const req = mockRequest([TOKEN, { body: JSON.stringify(apiResponse), contentType: JSON_TYPE }])
    const result = await getVisitNotes(req, 'WP-csn-xyz')
    expect(result).toEqual({
      csn: 'WP-csn-xyz',
      lrpID: 'WP-lrp-abc',
      depPhoneNumber: '555-111-2222',
      isAtLeastOneNoteSensitive: false,
      noteList: [
        {
          hnoID: 'WP-hno-1',
          hnoDAT: 'WP-dat-1',
          displayName: 'Anesthesia Procedure Notes',
          iso: '2026-05-11T13:47:52-04:00',
          provider: { name: 'Dr. First, MD', magicID: 'WP-mid-1' },
          isAddendum: false,
          isNoteSensitive: false,
          attachments: [],
        },
        {
          hnoID: 'WP-hno-2',
          hnoDAT: 'WP-dat-2',
          displayName: 'Operative Note',
          iso: '2026-05-11T16:05:00-04:00',
          provider: { name: 'Dr. Second, MD', magicID: 'WP-mid-2' },
          isAddendum: true,
          isNoteSensitive: true,
          attachments: [{ some: 'attachment' }],
        },
      ],
    })
  })

  it('keeps an empty notes list as the answer, with null for what MyChart did not send', async () => {
    const req = mockRequest([TOKEN, { body: JSON.stringify({ lrpID: '', noteList: [] }), contentType: JSON_TYPE }])
    expect(await getVisitNotes(req, 'WP-csn-empty')).toEqual({
      csn: 'WP-csn-empty',
      lrpID: '',
      depPhoneNumber: null,
      isAtLeastOneNoteSensitive: null,
      noteList: [],
    })
  })

  it('passes a literal null (unknown CSN) through as null', async () => {
    const req = mockRequest([TOKEN, { body: 'null', contentType: JSON_TYPE }])
    expect(await getVisitNotes(req, 'WP-csn-unknown')).toBeNull()
    expect(visitNotesProcessor.concise(null)).toBeNull()
  })

  it('records the requests and renders every mode', async () => {
    const req = mockRequest([TOKEN, { body: JSON.stringify(apiResponse), contentType: JSON_TYPE }])
    const raw = await fetchVisitNotesRaw(req, 'WP-csn-xyz')
    expect(raw.requests.map((r) => [r.path, r.method])).toEqual([
      ['/Visits/VisitsList', 'GET'],
      ['/api/visit-notes/GetVisitNotes', 'POST'],
    ])
    expect(raw.requests[1]!.requestBody).toEqual({ CSN: 'WP-csn-xyz', FromPvdPage: true })
    expect(renderOutput(visitNotesProcessor, raw, 'raw')).toEqual(apiResponse)

    const concise = renderOutput(visitNotesProcessor, raw, 'concise') as string
    expect(concise).toContain('WP-lrp-abc')
    expect(concise).toContain('WP-hno-1')
    expect(concise).toContain('WP-dat-1')
    expect(concise).toContain('Operative Note')
    expect(concise).not.toContain('WP-mid-1')
    expect(concise).not.toContain('555-111-2222')
    expect(renderOutput(visitNotesProcessor, raw, 'standard')).toContain('555-111-2222')
  })

  it('makes a JSON POST with the CSRF token and CSN', async () => {
    const { req, calls } = mockRecordingRequest([TOKEN, { body: JSON.stringify({ noteList: [] }), contentType: JSON_TYPE }])
    await getVisitNotes(req, 'WP-csn-test')

    expect(calls[1]!.url).toContain('/api/visit-notes/GetVisitNotes')
    expect(calls[1]!.init?.method).toBe('POST')
    const headers = calls[1]!.init!.headers as Record<string, string>
    expect(headers['__requestverificationtoken']).toBe('csrf_token')
    expect(headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(calls[1]!.init!.body as string)).toEqual({ CSN: 'WP-csn-test', FromPvdPage: true })
  })

  it('throws a clear error when the WAF intercepts (text/html "Request Rejected")', async () => {
    const req = mockRequest([
      TOKEN,
      {
        body: '<html><head><title>Request Rejected</title></head><body>Request Rejected</body></html>',
        contentType: 'text/html; charset=UTF-8',
        server: 'volt-adc',
      },
    ])
    await expect(getVisitNotes(req, 'WP-csn-blocked')).rejects.toThrow(/WAF.*rejected/)
  })

  it('throws a clear error when the response is text/html (session expired)', async () => {
    const req = mockRequest([TOKEN, { body: '<html>login page</html>', contentType: 'text/html' }])
    await expect(getVisitNotes(req, 'WP-csn-nosession')).rejects.toThrow(/Expected JSON/)
  })

  it('throws when CSRF token cannot be found', async () => {
    const req = mockRequest([{ body: '<html>no token here</html>', contentType: 'text/html' }])
    await expect(getVisitNotes(req, 'WP-csn-notoken')).rejects.toBeInstanceOf(MissingVerificationTokenError)
    await expect(getVisitNotes(mockRequest([{ body: '<html></html>', contentType: 'text/html' }]), 'x')).rejects.toThrow(/verification token/)
  })
})

describe('noteContentProcessor', () => {
  function rawWith(body: unknown): RawResponse {
    return { requests: [{ path: '/api/report-content/LoadReportContent', method: 'POST', status: 200, contentType: JSON_TYPE, body }] }
  }

  it('strips the HTML into reportContentText and keeps nothing else', () => {
    const standard = noteContentProcessor.standard(rawWith({
      reportContent: '<h2>Assessment</h2><p>Doing <b>well</b>.</p><ul><li>Item one</li><li>Item two</li></ul><script>alert(1)</script>',
      reportCss: '.x { color: red; }',
      baseFontSize: 12,
      stylesheets: ['a.css'],
    }))
    expect(standard).toEqual({ reportContentText: 'Assessment\n\nDoing well.\n- Item one\n- Item two' })
    expect(noteContentProcessor.concise(standard)).toBe(standard)
  })

  it('emits an empty text for an empty or missing reportContent', () => {
    expect(noteContentProcessor.standard(rawWith({}))).toEqual({ reportContentText: '' })
    expect(noteContentProcessor.standard(rawWith({ reportContent: '' }))).toEqual({ reportContentText: '' })
  })

  it('passes a literal null through as null', () => {
    expect(noteContentProcessor.standard(rawWith(null))).toBeNull()
    expect(renderOutput(noteContentProcessor, rawWith(null), 'json')).toBeNull()
    expect(renderOutput(noteContentProcessor, rawWith(null), 'concise')).toBe('(none)\n')
  })
})

describe('getNoteContent', () => {
  it('returns the note as plain text', async () => {
    const apiResponse = { reportContent: '<div>Note body</div>', reportCss: '.x { color: red; }' }
    const req = mockRequest([TOKEN, { body: JSON.stringify(apiResponse), contentType: JSON_TYPE }])

    const result = await getNoteContent(req, { csn: 'WP-csn-1', lrpId: 'WP-lrp-1', hnoId: 'WP-hno-1', hnoDat: 'WP-dat-1' })
    expect(result).toEqual({ reportContentText: 'Note body' })
  })

  it('records the request and keeps the markup in raw only', async () => {
    const apiResponse = { reportContent: '<div>Note body</div>', reportCss: '.x { color: red; }', baseFontSize: 12, stylesheets: [] }
    const req = mockRequest([TOKEN, { body: JSON.stringify(apiResponse), contentType: JSON_TYPE }])
    const raw = await fetchNoteContentRaw(req, { csn: 'WP-csn-1', lrpId: 'WP-lrp-1', hnoId: 'WP-hno-1', hnoDat: 'WP-dat-1' })

    expect(raw.requests.map((r) => r.path)).toEqual(['/Visits/VisitsList', '/api/report-content/LoadReportContent'])
    expect(raw.requests[1]!.requestBody).toMatchObject({ reportMnemonic: 'OPEN_NOTES', reportID: 'WP-lrp-1', contextID: 'WP-hno-1', contextDAT: 'WP-dat-1', csn: 'WP-csn-1' })
    expect(renderOutput(noteContentProcessor, raw, 'raw')).toEqual(apiResponse)
    expect(renderOutput(noteContentProcessor, raw, 'json')).toEqual({ reportContentText: 'Note body' })
    expect(renderOutput(noteContentProcessor, raw, 'standard')).not.toContain('<div>')
  })

  it('sends the report-content body with all 4 identifiers', async () => {
    const { req, calls } = mockRecordingRequest([TOKEN, { body: JSON.stringify({}), contentType: JSON_TYPE }])
    await getNoteContent(req, { csn: 'WP-csn-X', lrpId: 'WP-lrp-X', hnoId: 'WP-hno-X', hnoDat: 'WP-dat-X' })

    expect(calls[1]!.url).toContain('/api/report-content/LoadReportContent')
    const body = JSON.parse(calls[1]!.init!.body as string)
    expect(body.reportMnemonic).toBe('OPEN_NOTES')
    expect(body.reportID).toBe('WP-lrp-X')
    expect(body.contextID).toBe('WP-hno-X')
    expect(body.contextDAT).toBe('WP-dat-X')
    expect(body.contextINI).toBe('HNO')
    expect(body.csn).toBe('WP-csn-X')
  })

  it('throws on WAF rejection', async () => {
    const req = mockRequest([TOKEN, { body: '<html>Request Rejected</html>', contentType: 'text/html; charset=UTF-8', server: 'volt-adc' }])
    await expect(getNoteContent(req, { csn: 'a', lrpId: 'b', hnoId: 'c', hnoDat: 'd' })).rejects.toThrow(/WAF/)
  })

  it('throws when the token is missing', async () => {
    const req = mockRequest([{ body: '<html></html>', contentType: 'text/html' }])
    await expect(getNoteContent(req, { csn: 'a', lrpId: 'b', hnoId: 'c', hnoDat: 'd' })).rejects.toBeInstanceOf(MissingVerificationTokenError)
  })
})

describe('getVisitAVS', () => {
  it('returns the AVS as plain text', async () => {
    const apiResponse = { reportContent: '<div class="avs">After Visit Summary</div>', reportCss: '' }
    const req = mockRequest([TOKEN, { body: JSON.stringify(apiResponse), contentType: JSON_TYPE }])
    expect(await getVisitAVS(req, 'WP-csn-avs')).toEqual({ reportContentText: 'After Visit Summary' })
  })

  it('sends AMB_AVS mnemonic with empty reportID and records it', async () => {
    const { req, calls } = mockRecordingRequest([TOKEN, { body: JSON.stringify({}), contentType: JSON_TYPE }])
    const raw = await fetchVisitAvsRaw(req, 'WP-csn-avs')

    const body = JSON.parse(calls[1]!.init!.body as string)
    expect(body.reportMnemonic).toBe('AMB_AVS')
    expect(body.reportID).toBe('')
    expect(body.csn).toBe('WP-csn-avs')
    expect(raw.requests[1]!.requestBody).toEqual(body)
  })

  it('passes a literal null through', async () => {
    const req = mockRequest([TOKEN, { body: 'null', contentType: JSON_TYPE }])
    expect(await getVisitAVS(req, 'WP-csn-unknown')).toBeNull()
  })
})
