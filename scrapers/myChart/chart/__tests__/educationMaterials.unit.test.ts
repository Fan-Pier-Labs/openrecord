import { describe, it, expect, mock } from 'bun:test'
import { getEducationMaterials, fetchEducationMaterialsRaw, educationMaterialsProcessor } from '../educationMaterials'
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

/** The captured `GetPatEducationTitles` element, every field. */
const TITLE = {
  elementId: 'E1',
  displayName: 'Managing Diabetes',
  assignedDate: '2024-02-15',
  eduKey: 'EDU-K1',
  numTopics: 4,
  numPoints: 10,
  isAdmitted: false,
  encounterContext: 0,
  wasAssignedThisVisit: true,
  canUserTrackUnderstanding: true,
  numPagesReviewed: 2,
  numPagesUnderstood: 1,
  numPagesQuestions: 0,
  thumbnailImage: '/t.png',
  thumbnailImageBlobToken: 'blob',
  thumbnailIcon: 1,
  tvSupported: false,
  removeThumbnails: false,
}

const TITLE_STANDARD = {
  displayName: 'Managing Diabetes',
  assignedDate: '2024-02-15',
  elementId: 'E1',
  eduKey: 'EDU-K1',
  numTopics: 4,
  wasAssignedThisVisit: true,
  numPagesReviewed: 2,
  numPagesUnderstood: 1,
  numPagesQuestions: 0,
}

function envelope(body: unknown): RawResponse {
  return { requests: [{ path: '/api/education/GetPatEducationTitles', method: 'POST', requestBody: {}, status: 200, contentType: 'application/json', body }] }
}

describe('fetchEducationMaterialsRaw', () => {
  it('throws rather than returning no materials when the page has no token', async () => {
    await expect(fetchEducationMaterialsRaw(mockRequest([{ body: '<html></html>' }]))).rejects.toBeInstanceOf(MissingVerificationTokenError)
  })

  it('records the page and the GetPatEducationTitles POST, whose body is a bare array', async () => {
    const raw = await fetchEducationMaterialsRaw(mockRequest([{ body: TOKEN_PAGE }, { body: JSON.stringify([TITLE]) }]))
    expect(raw.requests.map((r) => `${r.method} ${r.path}`)).toEqual(['GET /app/education', 'POST /api/education/GetPatEducationTitles'])
    expect(raw.requests[1]!.body).toEqual([TITLE])
  })
})

describe('educationMaterialsProcessor', () => {
  it('keeps the title, dates, ids and progress and drops thumbnails and gamification', () => {
    expect(educationMaterialsProcessor.standard(envelope([TITLE]))).toEqual([TITLE_STANDARD])
  })

  it('emits every field as null on a title with nothing in it', () => {
    const [m] = educationMaterialsProcessor.standard(envelope([{}]))
    expect(Object.keys(m!)).toEqual(Object.keys(TITLE_STANDARD))
    expect(Object.values(m!).every((v) => v === null)).toBe(true)
  })

  it('reports an empty or non-array body as no materials', () => {
    expect(educationMaterialsProcessor.standard(envelope([]))).toEqual([])
    expect(educationMaterialsProcessor.standard(envelope({ educationTitles: [TITLE] }))).toEqual([])
  })

  it('projects concise to what was assigned and when', () => {
    expect(educationMaterialsProcessor.concise([TITLE_STANDARD])).toEqual([{ displayName: 'Managing Diabetes', assignedDate: '2024-02-15' }])
  })
})

describe('getEducationMaterials', () => {
  it('returns the standard object', async () => {
    expect(await getEducationMaterials(mockRequest([{ body: TOKEN_PAGE }, { body: JSON.stringify([TITLE]) }]))).toEqual([TITLE_STANDARD])
  })
})
