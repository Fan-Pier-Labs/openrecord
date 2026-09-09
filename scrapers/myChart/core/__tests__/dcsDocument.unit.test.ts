import { describe, it, expect, mock } from 'bun:test'
import { fetchDcsFile, DcsDocumentError } from '../dcsDocument'
import { MyChartRequest } from '../myChartRequest'
import { RawCollector } from '../rawResponse'

type Reply = { body: string | Uint8Array; status?: number; headers?: Record<string, string> }

function mockRequest(replies: Reply[]) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  const seen: string[] = []
  const posted: unknown[] = []
  let i = 0
  req.transport = mock(async (url: string, init?: RequestInit) => {
    seen.push(url)
    if (typeof init?.body === 'string') posted.push(JSON.parse(init.body))
    const r = replies[i++]
    if (!r) throw new Error(`unexpected request #${i}: ${url}`)
    return new Response(r.body as BodyInit, { status: r.status ?? 200, headers: r.headers ?? {} })
  })
  return { req, seen, posted }
}

const DETAILS = (over: Record<string, unknown> = {}): Reply => ({
  body: JSON.stringify({
    dcsId: 'DCS-1',
    token: 'tok',
    displayName: 'Visit Summary',
    fileDescription: 'Visit Summary',
    mimeType: 'application/pdf',
    downloadUrl: '/Documents/ViewDocument/DownloadOrStream?dcsid=DCS-1&displayName=Visit%20Summary&dcsExt=PDF',
    previewUrl: '',
    ...over,
  }),
  headers: { 'content-type': 'application/json' },
})

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46])
const FILE: Reply = {
  body: PDF,
  headers: { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="Visit Summary.pdf"' },
}

const REQUEST = { dcsId: 'DCS-1', fileExtension: 'PDF', organizationId: 'ORG', useOldMobileLink: true, legacy: false }

/** The DcsDocumentError a failing fetch threw, typed. */
async function failureOf(replies: Reply[], over: Partial<typeof REQUEST> = {}): Promise<DcsDocumentError> {
  const error = await fetchWith(replies, over).then(
    () => null,
    (e: unknown) => e as DcsDocumentError,
  )
  expect(error).toBeInstanceOf(DcsDocumentError)
  return error!
}

async function fetchWith(replies: Reply[], over: Partial<typeof REQUEST> = {}) {
  const mocked = mockRequest(replies)
  const collector = new RawCollector(mocked.req)
  const file = await fetchDcsFile(mocked.req, collector, 'tok', { ...REQUEST, ...over })
  return { ...mocked, collector, file }
}

describe('fetchDcsFile', () => {
  it('posts the caller’s own variant of the details call, then fetches the link', async () => {
    const { seen, posted, file } = await fetchWith([DETAILS(), FILE])
    expect(seen[0]).toContain('/api/documents/viewer/GetDocumentDetails')
    expect(seen[0]).not.toContain('Legacy')
    expect(posted).toEqual([{ dcsId: 'DCS-1', fileExtension: 'PDF', organizationId: 'ORG', useOldMobileLink: true }])
    expect(seen[1]).toContain('/Documents/ViewDocument/DownloadOrStream')
    expect(file).toEqual({ fileName: 'Visit Summary.pdf', mimeType: 'application/pdf', bytes: PDF, displayName: 'Visit Summary' })
  })

  it('asks the legacy endpoint when the caller’s portal hook does', async () => {
    const { seen } = await fetchWith([DETAILS(), FILE], { legacy: true, useOldMobileLink: false })
    expect(seen[0]).toContain('/api/documents/viewer/GetDocumentDetailsLegacy')
  })

  it('records the details call, so raw mode shows the exchange', async () => {
    const { collector } = await fetchWith([DETAILS(), FILE])
    expect(collector.toRaw().requests.map((r) => r.path)).toEqual(['/api/documents/viewer/GetDocumentDetails'])
  })

  it('reports a literal null as no_such_document', async () => {
    const failure = await failureOf([{ body: 'null', headers: { 'content-type': 'application/json' } }])
    expect(failure.failure).toEqual({ reason: 'no_such_document' })
  })

  it('reports an empty downloadUrl as not_released, with the name', async () => {
    const failure = await failureOf([DETAILS({ downloadUrl: '', token: '' })])
    expect(failure.failure).toEqual({ reason: 'not_released', displayName: 'Visit Summary' })
  })

  it('reports the empty body a bogus link answers with', async () => {
    const failure = await failureOf([DETAILS(), { body: new Uint8Array(), headers: {} }])
    expect(failure.failure).toEqual({ reason: 'download_failed', displayName: 'Visit Summary', detail: 'an empty body' })
  })

  it('reports a server error rather than saving nothing', async () => {
    const failure = await failureOf([DETAILS(), { body: 'boom', status: 500 }])
    expect(failure.failure.reason).toBe('download_failed')
    expect(failure.message).toContain('HTTP 500')
  })

  it('reports a web page where a file should be', async () => {
    const failure = await failureOf([DETAILS(), { body: '<html>sign in</html>', headers: { 'content-type': 'text/html' } }])
    expect(failure.failure).toEqual({ reason: 'download_failed', displayName: 'Visit Summary', detail: 'a web page instead of the file' })
  })

  /**
   * The one rule the two callers used to disagree on: attachments refused
   * every `text/html` body, which would have refused an e-signed document.
   */
  it('accepts HTML when MyChart itself declared the file HTML', async () => {
    const { file } = await fetchWith([
      DETAILS({ mimeType: 'text/html', downloadUrl: '/Documents/ViewDocument/Download?dcsid=DCS-1&dcsExt=HTML' }),
      { body: '<main>signed</main>', headers: { 'content-type': 'text/html' } },
    ])
    expect(file.mimeType).toBe('text/html')
    expect(new TextDecoder().decode(file.bytes)).toBe('<main>signed</main>')
  })

  it('names the file from the link when there is no Content-Disposition', async () => {
    const { file } = await fetchWith([DETAILS(), { body: PDF, headers: { 'content-type': 'application/pdf' } }])
    expect(file.fileName).toBe('Visit Summary.pdf')
  })

  it('falls back to the extension when MyChart names the file nothing usable', async () => {
    const { file } = await fetchWith([
      DETAILS({ displayName: '', fileDescription: '' }),
      { body: PDF, headers: { 'content-type': 'application/pdf' } },
    ])
    expect(file.fileName).toBe('document.pdf')
  })

  it('makes a name with path separators safe', async () => {
    const { file } = await fetchWith([
      DETAILS(),
      { body: PDF, headers: { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="../../etc/passwd.pdf"' } },
    ])
    expect(file.fileName).toBe('_.._etc_passwd.pdf')
  })

  it('falls back to the download’s Content-Type when the details call named no mime', async () => {
    const { file } = await fetchWith([DETAILS({ mimeType: '' }), FILE])
    expect(file.mimeType).toBe('application/pdf')
  })
})
