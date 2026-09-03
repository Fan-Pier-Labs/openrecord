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

describe('getDocuments', () => {
  it('throws when no token found', async () => {
    const req = mockRequest([{ body: '<html></html>' }])
    await expect(getDocuments(req)).rejects.toBeInstanceOf(MissingVerificationTokenError)
  })

  it('passes each document through whole (shape uncaptured)', async () => {
    const documents = [
      { id: 'D1', title: 'After Visit Summary', documentType: 'AVS', date: '2024-01-15', providerName: 'Dr. Example', organizationName: 'Example Medical' },
      { id: 'D2', unexpectedField: 'kept' },
      {},
    ]
    const req = mockRequest([TOKEN, { body: JSON.stringify({ documents, somethingElse: true }) }])
    expect(await getDocuments(req)).toEqual({ documents })
  })

  it('keeps an empty documents list as the answer, and a missing one as empty', async () => {
    expect(await getDocuments(mockRequest([TOKEN, { body: JSON.stringify({ documents: [] }) }]))).toEqual({ documents: [] })
    expect(await getDocuments(mockRequest([TOKEN, { body: JSON.stringify({}) }]))).toEqual({ documents: [] })
  })

  it('records the requests and renders every mode; concise is identical to standard', async () => {
    const body = { documents: [{ id: 'D1', title: 'Referral letter' }], somethingElse: true }
    const req = mockRequest([TOKEN, { body: JSON.stringify(body) }])
    const raw = await fetchDocumentsRaw(req)

    expect(raw.requests.map((r) => [r.path, r.method])).toEqual([['/app/documents', 'GET'], ['/api/documents/viewer/LoadOtherDocuments', 'POST']])
    expect(raw.requests[1]!.requestBody).toEqual({})
    expect(renderOutput(documentsProcessor, raw, 'raw')).toEqual(body)
    expect(renderOutput(documentsProcessor, raw, 'json')).toEqual({ documents: [{ id: 'D1', title: 'Referral letter' }] })
    const standard = documentsProcessor.standard(raw)
    expect(documentsProcessor.concise(standard)).toEqual(standard)
    expect(renderOutput(documentsProcessor, raw, 'concise')).toBe(renderOutput(documentsProcessor, raw, 'standard'))
    expect(renderOutput(documentsProcessor, raw, 'standard')).toContain('Referral letter')
  })
})
