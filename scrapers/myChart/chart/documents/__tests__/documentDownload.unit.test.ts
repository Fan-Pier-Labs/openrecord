import { describe, it, expect, mock } from 'bun:test'
import { downloadDocument } from '../documentDownload'
import { MyChartRequest } from '../../../core/myChartRequest'

const TOKEN = '<input name="__RequestVerificationToken" value="t" />'

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

const DETAILS = (over: Record<string, unknown> = {}) => ({
  body: JSON.stringify({
    dcsId: 'DCS-1',
    token: 'tok',
    orgId: '',
    displayName: 'After Visit Summary',
    userFriendlyDisplayName: '',
    legacyEncryption: false,
    isMobile: false,
    fileDescription: 'After Visit Summary',
    allowPreview: false,
    downloadUrl: '/Documents/ViewDocument/DownloadOrStream?dcsid=DCS-1&displayName=After%20Visit%20Summary&dcsExt=PDF',
    previewUrl: '',
    mimeType: 'application/pdf',
    ...over,
  }),
  headers: { 'content-type': 'application/json' },
})

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])
const FILE: Reply = {
  body: PDF,
  headers: {
    'content-type': 'application/pdf',
    'content-disposition': 'attachment; filename="After Visit Summary.pdf"',
  },
}

describe('downloadDocument', () => {
  it('asks the viewer for the document, then fetches the link it names', async () => {
    const { req, seen } = mockRequest([{ body: TOKEN }, DETAILS(), FILE])
    const file = await downloadDocument(req, 'DCS-1')

    expect(seen[0]).toContain('/app/document-center')
    expect(seen[1]).toContain('/api/documents/viewer/GetDocumentDetails')
    expect(seen[1]).not.toContain('GetDocumentDetailsLegacy')
    expect(seen[2]).toContain('/Documents/ViewDocument/DownloadOrStream')
    expect(file).toEqual({
      dcsID: 'DCS-1',
      displayName: 'After Visit Summary',
      fileName: 'After Visit Summary.pdf',
      mimeType: 'application/pdf',
      bytes: PDF,
    })
  })

  /**
   * Measured five ways on a live instance — correct, empty, omitted, wrong,
   * and `dcsId` alone all returned the same file. Sending `''` is what lets a
   * download skip walking the document list for an extension MyChart ignores.
   */
  it('sends only the id, because MyChart resolves the file from it alone', async () => {
    const { req, posted } = mockRequest([{ body: TOKEN }, DETAILS(), FILE])
    await downloadDocument(req, 'DCS-1')
    expect(posted).toEqual([{ dcsId: 'DCS-1', fileExtension: '', organizationId: '', useOldMobileLink: true }])
  })

  it('refuses an id the record does not hold, which answers 200 with a literal null', async () => {
    const { req } = mockRequest([{ body: TOKEN }, { body: 'null', headers: { 'content-type': 'application/json' } }])
    await expect(downloadDocument(req, 'DCS-NOPE')).rejects.toThrow(/no document DCS-NOPE on the active patient record/)
  })

  it('refuses a preview-only document, whose downloadUrl and token are both empty', async () => {
    const { req } = mockRequest([{ body: TOKEN }, DETAILS({ downloadUrl: '', token: '', previewUrl: '/Documents/ViewDocument/DownloadOrStream?dcsid=DCS-1&method=preview' })])
    await expect(downloadDocument(req, 'DCS-1')).rejects.toThrow(/serves no file for it/)
  })

  it('refuses the empty body a bogus download link answers with', async () => {
    const { req } = mockRequest([{ body: TOKEN }, DETAILS(), { body: new Uint8Array(), headers: {} }])
    await expect(downloadDocument(req, 'DCS-1')).rejects.toThrow(/an empty body; nothing was downloaded/)
  })

  it('refuses a web page where a PDF should be', async () => {
    const { req } = mockRequest([{ body: TOKEN }, DETAILS(), { body: '<html>sign in</html>', headers: { 'content-type': 'text/html' } }])
    await expect(downloadDocument(req, 'DCS-1')).rejects.toThrow(/a web page instead of the file/)
  })

  /** An e-signed document is genuinely HTML — 8 of 42 on the captured account. */
  it('accepts HTML when MyChart itself said the document is HTML', async () => {
    const html = '<main><h1>Consent</h1></main>'
    const { req } = mockRequest([
      { body: TOKEN },
      DETAILS({ mimeType: 'text/html', displayName: 'Consent', downloadUrl: '/Documents/ViewDocument/DownloadOrStream?dcsid=DCS-1&dcsExt=HTML' }),
      { body: html, headers: { 'content-type': 'text/html', 'content-disposition': 'attachment; filename="Consent.html"' } },
    ])
    const file = await downloadDocument(req, 'DCS-1')
    expect(file.fileName).toBe('Consent.html')
    expect(file.mimeType).toBe('text/html')
    expect(new TextDecoder().decode(file.bytes)).toBe(html)
  })

  it('names the file from the download link when MyChart sends no Content-Disposition', async () => {
    const { req } = mockRequest([{ body: TOKEN }, DETAILS(), { body: PDF, headers: { 'content-type': 'application/pdf' } }])
    expect((await downloadDocument(req, 'DCS-1')).fileName).toBe('After Visit Summary.pdf')
  })

  it('falls back to the extension alone when MyChart names the file nothing usable', async () => {
    const { req } = mockRequest([
      { body: TOKEN },
      DETAILS({ displayName: '', fileDescription: '' }),
      { body: PDF, headers: { 'content-type': 'application/pdf' } },
    ])
    expect((await downloadDocument(req, 'DCS-1')).fileName).toBe('document.pdf')
  })

  it('makes a name with path separators safe', async () => {
    const { req } = mockRequest([
      { body: TOKEN },
      DETAILS(),
      { body: PDF, headers: { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="../../etc/passwd.pdf"' } },
    ])
    // safeFileName maps the separators, then strips the leading dots.
    expect((await downloadDocument(req, 'DCS-1')).fileName).toBe('_.._etc_passwd.pdf')
  })

  it('reports a server error as a failure rather than an empty file', async () => {
    const { req } = mockRequest([{ body: TOKEN }, DETAILS(), { body: 'boom', status: 500 }])
    await expect(downloadDocument(req, 'DCS-1')).rejects.toThrow(/nothing was downloaded/)
  })
})
