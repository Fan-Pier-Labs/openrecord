import { describe, it, expect, mock } from 'bun:test'
import { getDocuments, fetchDocumentsRaw, documentsProcessor } from '../documents'
import { MyChartRequest } from '../../../core/myChartRequest'
import { MissingVerificationTokenError } from '../../../core/util'
import { renderOutput } from '../../../processors/processor'

function mockRequest(responses: Array<{ body: string }>) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  let i = 0
  req.transport = mock(async () => {
    const r = responses[i++]
    if (!r) throw new Error(`unexpected request #${i}`)
    return new Response(r.body, { status: 200 })
  })
  return req
}

const TOKEN = { body: '<input name="__RequestVerificationToken" value="t" />' }

/** `dateRaw` 67821 is 2026-09-08 — the day number verified in shared/epicDate.ts. */
function doc(n: number, over: Record<string, unknown> = {}) {
  return {
    blobCat: '20',
    dcsID: `DCS-${n}`,
    docID: `DOC-${n}`,
    date: '9/8/2026',
    dateRaw: String(67821 - n),
    dat: `WP-${n}`,
    docExt: 'PDF',
    docDesc: '',
    docType: 'Visit Summary',
    pendingApprovalStatus: 0,
    rejectionReasonFreetext: '',
    wasESigned: false,
    downloadOnly: false,
    new: false,
    isExpired: false,
    pendingRequiredSignatures: false,
    onlyAllowedPreview: false,
    ...over,
  }
}

const page = (docs: unknown[]) => ({ body: JSON.stringify({ documents: docs }) })

describe('getDocuments', () => {
  it('throws when no token found', async () => {
    const req = mockRequest([{ body: '<html></html>' }])
    await expect(getDocuments(req)).rejects.toBeInstanceOf(MissingVerificationTokenError)
  })

  it('asks for the initial load first, then pages until a page comes back short', async () => {
    const first = Array.from({ length: 25 }, (_, i) => doc(i))
    const second = Array.from({ length: 25 }, (_, i) => doc(25 + i))
    const third = [doc(50), doc(51)]
    const req = mockRequest([TOKEN, page(first), page(second), page(third)])
    const raw = await fetchDocumentsRaw(req)

    expect(raw.requests.map((r) => [r.path, r.method])).toEqual([
      ['/app/document-center', 'GET'],
      ['/api/documents/viewer/LoadOtherDocuments', 'POST'],
      ['/api/documents/viewer/LoadOtherDocuments', 'POST'],
      ['/api/documents/viewer/LoadOtherDocuments', 'POST'],
    ])
    expect(raw.requests.slice(1).map((r) => r.requestBody)).toEqual([
      { isInitialLoad: true },
      { isInitialLoad: false },
      { isInitialLoad: false },
    ])
    expect(documentsProcessor.standard(raw).documents).toHaveLength(52)
  })

  it('stops after one request when the first page is already short', async () => {
    const req = mockRequest([TOKEN, page([doc(1)])])
    expect((await getDocuments(req)).documents).toHaveLength(1)
  })

  it('keeps an empty list as the answer, and a missing one as empty', async () => {
    expect(await getDocuments(mockRequest([TOKEN, page([])]))).toEqual({ documents: [] })
    expect(await getDocuments(mockRequest([TOKEN, { body: '{}' }]))).toEqual({ documents: [] })
  })

  it('keeps every MyChart field, derives dateISO from the Epic day number, and sorts newest first', async () => {
    const req = mockRequest([TOKEN, page([doc(2, { docType: 'Older' }), doc(0, { docType: 'Newer' })])])
    const { documents } = await getDocuments(req)

    expect(documents.map((d) => d.docType)).toEqual(['Newer', 'Older'])
    expect(documents[0]).toEqual({
      blobCat: '20',
      dcsID: 'DCS-0',
      docID: 'DOC-0',
      date: '9/8/2026',
      dateRaw: '67821',
      dateISO: '2026-09-08',
      dat: 'WP-0',
      docExt: 'PDF',
      docDesc: '',
      docType: 'Newer',
      pendingApprovalStatus: 0,
      rejectionReasonFreetext: '',
      wasESigned: false,
      downloadOnly: false,
      new: false,
      isExpired: false,
      pendingRequiredSignatures: false,
      onlyAllowedPreview: false,
    })
  })

  it('leaves dateISO null when MyChart sent no day number', async () => {
    const req = mockRequest([TOKEN, page([doc(1, { dateRaw: '' }), doc(2, { dateRaw: 'n/a' })])])
    expect((await getDocuments(req)).documents.map((d) => d.dateISO)).toEqual([null, null])
  })

  it('renders every mode; concise keeps the handle, name, format and unread flag', async () => {
    const req = mockRequest([TOKEN, page([doc(1, { docType: 'Consent', docDesc: 'Signed copy', new: true })])])
    const raw = await fetchDocumentsRaw(req)

    expect(renderOutput(documentsProcessor, raw, 'raw')).toEqual({ documents: [doc(1, { docType: 'Consent', docDesc: 'Signed copy', new: true })] })
    expect(documentsProcessor.concise(documentsProcessor.standard(raw))).toEqual({
      documents: [{ dcsID: 'DCS-1', docType: 'Consent', docDesc: 'Signed copy', docExt: 'PDF', dateISO: '2026-09-07', new: true }],
    })
    const standard = renderOutput(documentsProcessor, raw, 'standard') as string
    expect(standard).toContain('Consent')
    expect(standard).toContain('blobCat')
    expect(renderOutput(documentsProcessor, raw, 'concise')).not.toContain('blobCat')
  })
})
