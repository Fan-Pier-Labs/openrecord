import { describe, it, expect, mock } from 'bun:test'
import {
  getLetters,
  getLetterDetails,
  fetchLettersRaw,
  fetchLetterDetailsRaw,
  lettersProcessor,
  letterDetailsProcessor,
} from '../letters'
import { MyChartRequest } from '../../../core/myChartRequest'
import { MissingVerificationTokenError } from '../../../core/util'
import { renderOutput } from '../../../processors/processor'
import type { RawResponse } from '../../../core/rawResponse'

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

/** Captures each request so the POST body can be asserted. */
function mockRecordingRequest(responses: Array<{ body: string }>) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  const calls: Array<{ url: string; init: RequestInit }> = []
  let i = 0
  req.transport = mock(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init })
    const r = responses[i++]
    if (!r) throw new Error(`unexpected request #${i}`)
    return new Response(r.body, { status: 200 })
  })
  return { req, calls }
}

const TOKEN = { body: '<input name="__RequestVerificationToken" value="t" />' }

describe('getLetters', () => {
  it('throws when no token found', async () => {
    const req = mockRequest([{ body: '<html></html>' }])
    await expect(getLetters(req)).rejects.toBeInstanceOf(MissingVerificationTokenError)
  })

  it('resolves providerName from users, keeps empId, sorts newest first', async () => {
    const req = mockRequest([
      TOKEN,
      {
        body: JSON.stringify({
          users: {
            E100: { empId: 'E100', name: 'Dr. Alice Example', photoUrl: '/photos/alice.jpg' },
            E200: { empId: 'E200', name: 'Dr. Bob Example', photoUrl: '/photos/bob.jpg' },
          },
          letters: [
            // Intentionally not sorted in the source response
            { dateISO: '2024-01-15', reason: 'Annual Physical', viewed: true, empId: 'E100', hnoId: 'H1', csn: 'C1' },
            { dateISO: '2024-03-20', reason: 'Follow-up', viewed: false, empId: 'E200', hnoId: 'H2', csn: 'C2' },
          ],
          departments: {},
        }),
      },
    ])

    const result = await getLetters(req)
    expect(result).toEqual({
      letters: [
        { hnoId: 'H2', csn: 'C2', dateISO: '2024-03-20', reason: 'Follow-up', viewed: false, empId: 'E200', providerName: 'Dr. Bob Example' },
        { hnoId: 'H1', csn: 'C1', dateISO: '2024-01-15', reason: 'Annual Physical', viewed: true, empId: 'E100', providerName: 'Dr. Alice Example' },
      ],
      departments: {},
    })
    expect(result).not.toHaveProperty('users')
  })

  it('places letters with missing dateISO last', async () => {
    const req = mockRequest([
      TOKEN,
      {
        body: JSON.stringify({
          users: {},
          letters: [
            { dateISO: '', reason: 'Undated', viewed: false, empId: '', hnoId: 'H1', csn: 'C1' },
            { dateISO: '2024-03-20', reason: 'Dated', viewed: false, empId: '', hnoId: 'H2', csn: 'C2' },
            { reason: 'No date field', viewed: false, hnoId: 'H3', csn: 'C3' },
          ],
        }),
      },
    ])

    const result = await getLetters(req)
    expect(result.letters.map((l) => l.reason)).toEqual(['Dated', 'Undated', 'No date field'])
    expect(result.letters[2]).toEqual({ hnoId: 'H3', csn: 'C3', dateISO: null, reason: 'No date field', viewed: false, empId: null, providerName: null })
  })

  it('leaves providerName null for an unknown empId', async () => {
    const req = mockRequest([
      TOKEN,
      { body: JSON.stringify({ users: {}, letters: [{ dateISO: '2024-01-01', reason: 'Test', viewed: false, empId: 'UNKNOWN', hnoId: 'H1', csn: 'C1' }] }) },
    ])
    const result = await getLetters(req)
    expect(result.letters[0]!.empId).toBe('UNKNOWN')
    expect(result.letters[0]!.providerName).toBeNull()
  })

  it('keeps an empty letters array as the answer', async () => {
    const req = mockRequest([TOKEN, { body: JSON.stringify({ users: {}, letters: [] }) }])
    expect(await getLetters(req)).toEqual({ letters: [], departments: {} })
  })

  it('records the requests and renders every mode', async () => {
    const body = {
      users: { E1: { empId: 'E1', name: 'Dr. Example', photoUrl: '/p.jpg' } },
      letters: [{ dateISO: '2024-01-01', reason: 'Results', viewed: false, empId: 'E1', hnoId: 'H1', csn: 'C1' }],
      departments: { D1: { name: 'Cardiology' } },
    }
    const req = mockRequest([TOKEN, { body: JSON.stringify(body) }])
    const raw = await fetchLettersRaw(req)

    expect(raw.requests.map((r) => [r.path, r.method])).toEqual([['/app/letters', 'GET'], ['/api/letters/GetLettersList', 'POST']])
    expect(raw.requests[1]!.requestBody).toEqual({})
    expect(renderOutput(lettersProcessor, raw, 'raw')).toEqual(body)
    expect(renderOutput(lettersProcessor, raw, 'json')).toEqual({
      letters: [{ hnoId: 'H1', csn: 'C1', dateISO: '2024-01-01', reason: 'Results', viewed: false, empId: 'E1', providerName: 'Dr. Example' }],
      departments: { D1: { name: 'Cardiology' } },
    })

    const concise = lettersProcessor.concise(lettersProcessor.standard(raw)) as { letters: Record<string, unknown>[] }
    expect(concise).toEqual({ letters: [{ hnoId: 'H1', csn: 'C1', dateISO: '2024-01-01', reason: 'Results', viewed: false, providerName: 'Dr. Example' }] })
    expect(concise).not.toHaveProperty('departments')
    expect(renderOutput(lettersProcessor, raw, 'standard')).toContain('Dr. Example')
    expect(renderOutput(lettersProcessor, raw, 'concise')).not.toContain('/p.jpg')
  })
})

describe('letterDetailsProcessor', () => {
  function rawWith(body: unknown): RawResponse {
    return { requests: [{ path: '/api/letters/GetLetterDetails', method: 'POST', status: 200, contentType: 'application/json', body }] }
  }

  it('strips bodyHTML to bodyHTMLText and carries nothing else', () => {
    const standard = letterDetailsProcessor.standard(rawWith({ bodyHTML: '<p>Dear patient,</p><p>Your results are <b>normal</b>.</p>' }))
    expect(standard).toEqual({ bodyHTMLText: 'Dear patient,\n\nYour results are normal.' })
    expect(letterDetailsProcessor.concise(standard)).toBe(standard)
  })

  it('emits an empty text when bodyHTML is empty or missing', () => {
    expect(letterDetailsProcessor.standard(rawWith({ bodyHTML: '' }))).toEqual({ bodyHTMLText: '' })
    expect(letterDetailsProcessor.standard(rawWith({}))).toEqual({ bodyHTMLText: '' })
  })

  it('passes a literal null (unknown hnoId) through as null', () => {
    expect(letterDetailsProcessor.standard(rawWith(null))).toBeNull()
    expect(renderOutput(letterDetailsProcessor, rawWith(null), 'json')).toBeNull()
    expect(renderOutput(letterDetailsProcessor, rawWith(null), 'concise')).toBe('(none)\n')
  })
})

describe('getLetterDetails', () => {
  it('returns the letter body as text', async () => {
    const { req } = mockRecordingRequest([TOKEN, { body: JSON.stringify({ bodyHTML: '<p>Your results are normal.</p>' }) }])
    expect(await getLetterDetails(req, 'H1', 'C1')).toEqual({ bodyHTMLText: 'Your results are normal.' })
  })

  it('identifies the letter by both hnoId and csn, and records the exchange', async () => {
    const { req, calls } = mockRecordingRequest([TOKEN, { body: JSON.stringify({ bodyHTML: '' }) }])
    const raw = await fetchLetterDetailsRaw(req, 'H9', 'C9')

    const post = calls[1]!
    expect(post.url).toContain('/api/letters/GetLetterDetails')
    expect(post.init.method).toBe('POST')
    expect(JSON.parse(post.init.body as string)).toEqual({ hnoId: 'H9', csn: 'C9' })
    expect((post.init.headers as Record<string, string>).__RequestVerificationToken).toBe('t')

    expect(raw.requests.map((r) => r.path)).toEqual(['/app/letters', '/api/letters/GetLetterDetails'])
    expect(raw.requests[1]!.requestBody).toEqual({ hnoId: 'H9', csn: 'C9' })
    expect(renderOutput(letterDetailsProcessor, raw, 'raw')).toEqual({ bodyHTML: '' })
  })

  it('returns null for an unknown letter', async () => {
    const { req } = mockRecordingRequest([TOKEN, { body: 'null' }])
    expect(await getLetterDetails(req, 'H1', 'C1')).toBeNull()
  })

  it('throws rather than returning an empty body when the token is missing', async () => {
    const { req } = mockRecordingRequest([{ body: '<html></html>' }])
    await expect(getLetterDetails(req, 'H1', 'C1')).rejects.toBeInstanceOf(MissingVerificationTokenError)
  })
})
