import { describe, it, expect, mock } from 'bun:test'
import { fetchMessageAttachment } from '../messageAttachment'
import { extensionForMime, safeFileName } from '../../../core/downloadedFile'
import { MyChartRequest } from '../../../core/myChartRequest'

type Answer = { status?: number; body?: BodyInit | null; headers?: Record<string, string> }

function mockRequest(answer: Answer) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  const urls: string[] = []
  req.transport = mock(async (url: string) => {
    urls.push(url.toString())
    return new Response(answer.body ?? null, { status: answer.status ?? 200, headers: answer.headers ?? {} })
  })
  return { req, urls }
}

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])

describe('fetchMessageAttachment', () => {
  it('GETs the portal\'s legacy DCS download URL and returns the bytes with the type MyChart sent', async () => {
    const { req, urls } = mockRequest({
      body: PDF,
      headers: { 'content-type': 'application/pdf', 'content-length': '8', 'content-disposition': 'inline; filename="Document.PDF"' },
    })
    const file = await fetchMessageAttachment(req, 'WP-24a/b=c', 'Nutrition plan.pdf')

    expect(urls).toHaveLength(1)
    expect(urls[0]).toBe('https://mychart.example.com/MyChart/Documents/ViewDocument/Download?dcsId=WP-24a%2Fb%3Dc&method=view')
    expect(file).toEqual({ fileName: 'Nutrition plan.pdf', mimeType: 'application/pdf', size: 8, bytes: PDF })
  })

  // The Content-Disposition MyChart sends names every file "Document.<EXT>";
  // the message's own name is the one worth keeping, with the real extension.
  it('names the file after the message\'s attachment name, and after the id when there is none', async () => {
    const png = { body: new Uint8Array([0x89, 0x50]), headers: { 'content-type': 'image/png', 'content-disposition': 'inline; filename="Document.PNG"' } }
    expect((await fetchMessageAttachment(mockRequest(png).req, 'WP-1', 'scan')).fileName).toBe('scan.png')
    expect((await fetchMessageAttachment(mockRequest(png).req, 'WP-1', 'scan.PNG')).fileName).toBe('scan.PNG')
    expect((await fetchMessageAttachment(mockRequest(png).req, 'WP-1', '../../etc/passwd')).fileName).toBe('_.._etc_passwd.png')
    expect((await fetchMessageAttachment(mockRequest(png).req, 'WP-a=b')).fileName).toBe('attachment-WP-a_b.png')
    // No disposition: the extension follows the type; an unknown type gets .bin.
    const bare = { body: new Uint8Array([1]), headers: { 'content-type': 'application/pdf' } }
    expect((await fetchMessageAttachment(mockRequest(bare).req, 'WP-1')).fileName).toBe('attachment-WP-1.pdf')
    const odd = { body: new Uint8Array([1]), headers: { 'content-type': 'application/x-unknown' } }
    expect((await fetchMessageAttachment(mockRequest(odd).req, 'WP-1', 'thing')).fileName).toBe('thing.bin')
  })

  // Four of four instances answer an unknown dcsId with 200, an empty body and
  // no Content-Type. Saving that would be an empty file that looks like the attachment.
  it('refuses the 200-with-nothing MyChart answers for an id it does not know', async () => {
    const { req } = mockRequest({ body: null })
    await expect(fetchMessageAttachment(req, 'WP-NOPE')).rejects.toThrow(/No attachment WP-NOPE on the active patient record/)
  })

  it('throws on a non-2xx answer rather than returning the error page as the file', async () => {
    const { req } = mockRequest({ status: 500, body: '<html>error</html>', headers: { 'content-type': 'text/html' } })
    await expect(fetchMessageAttachment(req, 'WP-1')).rejects.toThrow(/HTTP 500/)
  })
})

describe('safeFileName / extensionForMime', () => {
  it('strips separators and control characters, caps the length, and keeps a matching extension', () => {
    expect(safeFileName('a/b\\c:d*e?f"g<h>i|j\x00k.pdf', 'pdf', 'x')).toBe('a_b_c_d_e_f_g_h_i_j_k.pdf')
    expect(safeFileName('.hidden', 'txt', 'x')).toBe('hidden.txt')
    expect(safeFileName('   ', 'txt', 'fallback')).toBe('fallback.txt')
    expect(safeFileName('n'.repeat(200), 'txt', 'x')).toBe(`${'n'.repeat(120)}.txt`)
  })

  it('maps the common attachment types and nothing else', () => {
    expect(extensionForMime('application/pdf; charset=binary')).toBe('pdf')
    expect(extensionForMime('IMAGE/JPEG')).toBe('jpg')
    expect(extensionForMime('application/x-whatever')).toBeNull()
  })
})
