import { describe, it, expect, mock } from 'bun:test'
import { getQuestionnaires, fetchQuestionnairesRaw, questionnairesProcessor } from '../questionnaires'
import { MyChartRequest } from '../../../core/myChartRequest'
import { MissingVerificationTokenError } from '../../../core/util'

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
const PHQ = { id: 'Q1', name: 'PHQ-9', status: 'Completed', dueDate: '2024-01-15', completedDate: '2024-01-10' }

describe('fetchQuestionnairesRaw', () => {
  it('throws rather than returning no questionnaires when the page has no token', async () => {
    await expect(fetchQuestionnairesRaw(mockRequest([{ body: '<html></html>' }]))).rejects.toBeInstanceOf(MissingVerificationTokenError)
  })

  it('records the page and the GetQuestionnaireList POST', async () => {
    const raw = await fetchQuestionnairesRaw(mockRequest([{ body: TOKEN_PAGE }, { body: JSON.stringify({ questionnaires: [PHQ] }) }]))
    expect(raw.requests.map((r) => `${r.method} ${r.path}`)).toEqual(['GET /Questionnaire', 'POST /Questionnaire/GetQuestionnaireList'])
    expect(raw.requests[1]!.body).toEqual({ questionnaires: [PHQ] })
  })
})

describe('questionnairesProcessor', () => {
  // No capture exists, so the element passes through whole (rule 10).
  it('passes each questionnaire through whole', () => {
    const standard = questionnairesProcessor.standard({
      requests: [{ path: '/Questionnaire/GetQuestionnaireList', method: 'POST', status: 200, contentType: 'application/json', body: { questionnaires: [PHQ, {}] } }],
    })
    expect(standard).toEqual({ questionnaires: [PHQ, {}] })
    expect(questionnairesProcessor.concise(standard)).toEqual(standard)
  })

  it('reports a genuinely empty list as empty', () => {
    expect(
      questionnairesProcessor.standard({
        requests: [{ path: '/Questionnaire/GetQuestionnaireList', method: 'POST', status: 200, contentType: 'application/json', body: { questionnaires: [] } }],
      }),
    ).toEqual({ questionnaires: [] })
  })

  // One captured instance no longer serves the legacy activity: /Questionnaire
  // answers HTTP 500 and GetQuestionnaireList answers the 404 page, whose
  // markup carries an antiforgery token — so the exchange "succeeds" and the
  // body is HTML. Reading it as "you have no questionnaires" is the failure.
  it('refuses an HTML body from an instance that no longer serves the activity', () => {
    expect(() =>
      questionnairesProcessor.standard({
        requests: [{ path: '/Questionnaire/GetQuestionnaireList', method: 'POST', status: 200, contentType: 'text/html', body: '<html>Oops!</html>' }],
      }),
    ).toThrow(/non-JSON body/)
  })

  it('refuses an envelope the request never reached', () => {
    expect(() => questionnairesProcessor.standard({ requests: [] })).toThrow(/answered with nothing/)
  })
})

describe('getQuestionnaires', () => {
  it('returns the standard object', async () => {
    expect(await getQuestionnaires(mockRequest([{ body: TOKEN_PAGE }, { body: JSON.stringify({ questionnaires: [PHQ] }) }]))).toEqual({ questionnaires: [PHQ] })
  })
})
