import { describe, it, expect, mock } from 'bun:test'
import { getEhiExportTemplates, fetchEhiExportRaw, ehiExportProcessor } from '../ehiExport'
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

/** The captured `GetEHIETemplates` envelope. */
const BODY = {
  isNoBuildEhie: false,
  existingEHIE: true,
  ehieTemplates: [{ description: 'Complete EHI export', hideAdditionalComments: false, name: 'Full Health Record', id: 'T1' }],
  __Status: 'ok',
  __UpdateableSettings: { maxThrottleConnections: 1 },
}

function envelope(body: unknown): RawResponse {
  return { requests: [{ path: '/api/release-of-information/GetEHIETemplates', method: 'POST', requestBody: {}, status: 200, contentType: 'application/json', body }] }
}

describe('fetchEhiExportRaw', () => {
  it('throws rather than returning no templates when the page has no token', async () => {
    await expect(fetchEhiExportRaw(mockRequest([{ body: '<html></html>' }]))).rejects.toBeInstanceOf(MissingVerificationTokenError)
  })

  it('records the page and the GetEHIETemplates POST', async () => {
    const raw = await fetchEhiExportRaw(mockRequest([{ body: TOKEN_PAGE }, { body: JSON.stringify(BODY) }]))
    expect(raw.requests.map((r) => `${r.method} ${r.path}`)).toEqual(['GET /app/release-of-information', 'POST /api/release-of-information/GetEHIETemplates'])
    expect(raw.requests[1]!.body).toEqual(BODY)
  })
})

describe('ehiExportProcessor', () => {
  it('keeps the templates and the two flags and drops the server settings', () => {
    expect(ehiExportProcessor.standard(envelope(BODY))).toEqual({
      existingEHIE: true,
      isNoBuildEhie: false,
      ehieTemplates: [{ name: 'Full Health Record', description: 'Complete EHI export', id: 'T1' }],
    })
  })

  it('emits every field as null on a template with nothing in it', () => {
    expect(ehiExportProcessor.standard(envelope({ ehieTemplates: [{}] }))).toEqual({
      existingEHIE: null,
      isNoBuildEhie: null,
      ehieTemplates: [{ name: null, description: null, id: null }],
    })
  })

  it('reports an empty or missing list as empty', () => {
    expect(ehiExportProcessor.standard({ requests: [] }).ehieTemplates).toEqual([])
  })

  it('projects concise to what can be exported', () => {
    expect(ehiExportProcessor.concise(ehiExportProcessor.standard(envelope(BODY)))).toEqual({
      ehieTemplates: [{ name: 'Full Health Record', description: 'Complete EHI export' }],
    })
  })
})

describe('getEhiExportTemplates', () => {
  it('returns the standard object', async () => {
    const result = await getEhiExportTemplates(mockRequest([{ body: TOKEN_PAGE }, { body: JSON.stringify(BODY) }]))
    expect(result.ehieTemplates[0]!.id).toBe('T1')
  })
})
