import { describe, it, expect, mock } from 'bun:test'
import { getLetters, getLetterDetails } from '../letters'
import { MyChartRequest } from '../myChartRequest'

function mockRequest(responses: Array<{ body: string }>) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  let i = 0
  req.transport = mock(async () => {
    const r = responses[i++]
    return new Response(r.body, { status: 200 })
  }) as typeof req.transport
  return req
}

describe('getLetters', () => {
  it('returns empty array when no token found', async () => {
    const req = mockRequest([{ body: '<html></html>' }])
    expect(await getLetters(req)).toEqual([])
  })

  it('parses letters with provider info, sorted newest-first', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      {
        body: JSON.stringify({
          users: {
            'E100': { name: 'Dr. Alice Smith', photoUrl: '/photos/alice.jpg' },
            'E200': { name: 'Dr. Bob Jones', photoUrl: '/photos/bob.jpg' },
          },
          letters: [
            // Intentionally not sorted in the source response
            { dateISO: '2024-01-15', reason: 'Annual Physical', viewed: true, empId: 'E100', hnoId: 'H1', csn: 'C1' },
            { dateISO: '2024-03-20', reason: 'Follow-up', viewed: false, empId: 'E200', hnoId: 'H2', csn: 'C2' },
          ],
        }),
      },
    ])

    const result = await getLetters(req)
    expect(result).toHaveLength(2)
    // Newest first
    expect(result[0]).toEqual({
      dateISO: '2024-03-20',
      reason: 'Follow-up',
      viewed: false,
      providerName: 'Dr. Bob Jones',
      providerPhotoUrl: '/photos/bob.jpg',
      hnoId: 'H2',
      csn: 'C2',
    })
    expect(result[1].providerName).toBe('Dr. Alice Smith')
  })

  it('places letters with missing dateISO last', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      {
        body: JSON.stringify({
          users: {},
          letters: [
            { dateISO: '', reason: 'Undated', viewed: false, empId: '', hnoId: 'H1', csn: 'C1' },
            { dateISO: '2024-03-20', reason: 'Dated', viewed: false, empId: '', hnoId: 'H2', csn: 'C2' },
          ],
        }),
      },
    ])

    const result = await getLetters(req)
    expect(result.map(l => l.reason)).toEqual(['Dated', 'Undated'])
  })

  it('handles letter with unknown empId', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      {
        body: JSON.stringify({
          users: {},
          letters: [{ dateISO: '2024-01-01', reason: 'Test', viewed: false, empId: 'UNKNOWN', hnoId: 'H1', csn: 'C1' }],
        }),
      },
    ])

    const result = await getLetters(req)
    expect(result[0].providerName).toBe('')
    expect(result[0].providerPhotoUrl).toBe('')
  })

  it('handles empty letters array', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      { body: JSON.stringify({ users: {}, letters: [] }) },
    ])
    expect(await getLetters(req)).toEqual([])
  })
})

/** Captures each request so the details POST body can be asserted. */
function mockRequestRecording(responses: Array<{ body: string }>) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  const calls: Array<{ url: string; init: RequestInit }> = []
  let i = 0
  req.transport = mock(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init })
    return new Response(responses[i++].body, { status: 200 })
  })
  return { req, calls }
}

describe('getLetterDetails', () => {
  it('returns the letter body HTML', async () => {
    const { req } = mockRequestRecording([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      { body: JSON.stringify({ bodyHTML: '<p>Your results are normal.</p>' }) },
    ])

    expect(await getLetterDetails(req, 'H1', 'C1')).toEqual({
      bodyHTML: '<p>Your results are normal.</p>',
    })
  })

  it('identifies the letter by both hnoId and csn', async () => {
    // MyChart needs the encounter (csn) alongside the note id; sending only one
    // returns someone else's letter or nothing at all.
    const { req, calls } = mockRequestRecording([
      { body: '<input name="__RequestVerificationToken" value="tok" />' },
      { body: JSON.stringify({ bodyHTML: '' }) },
    ])

    await getLetterDetails(req, 'H9', 'C9')

    const post = calls[1]
    expect(post.url).toContain('/api/letters/GetLetterDetails')
    expect(post.init.method).toBe('POST')
    expect(JSON.parse(post.init.body as string)).toEqual({ hnoId: 'H9', csn: 'C9' })
    expect((post.init.headers as Record<string, string>).__RequestVerificationToken).toBe('tok')
  })

  it('throws rather than returning an empty body when the token is missing', async () => {
    // getLetters degrades to [] here, but a details call has a specific letter
    // the caller is waiting on — failing silently would look like an empty note.
    const { req } = mockRequestRecording([{ body: '<html></html>' }])

    await expect(getLetterDetails(req, 'H1', 'C1')).rejects.toThrow(
      'Could not find request verification token',
    )
  })
})
