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

// Shaped like the captured response (fake-mychart realShapes.getQuestionnaireList),
// with the fields a consumer reads actually set — a fixture that only conformed
// to the shape would pass a `toBeDefined()` while every display field was blank.
const ASSIGNED = {
  dueDateISO: '2026-04-15',
  apptDateISO: '2026-04-22',
  isHistory: false,
  seriesData: { seriesName: 'Pre-visit series', pastResponses: [] },
  hxData: { hxContext: '', hxContextID: '' },
  displayNameOverride: 'Before your visit',
  isTravelScreening: false,
  isProxyAccessing: false,
  context: { contextType: 3, contextIdentifier: 'APPT-9', extraContextInfo: { larID: 'L1' } },
  questionnaire: {
    type: 1,
    filterType: 'Appointment',
    isContextSpecific: true,
    preText: 'Please finish this before your visit.',
    postText: '',
    isPreTextSmartText: false,
    isPostTextSmartText: false,
    status: 2,
    rootName: 'Annual Health Risk Assessment',
    id: 'QNR-1041',
    name: 'Annual Health Risk Assessment',
  },
}

const OPTIONAL = {
  description: 'How you have been feeling lately.',
  disablePastResponse: true,
  context: { contextType: 0, contextIdentifier: '', extraContextInfo: {} },
  questionnaire: {
    type: 0,
    isContextSpecific: false,
    preText: '',
    postText: '',
    isPreTextSmartText: false,
    isPostTextSmartText: false,
    status: 0,
    rootName: 'Mood Check-In',
    id: 'QNR-2088',
    name: 'Mood Check-In',
  },
}

const RESPONSE = {
  assignedQuestionnaires: [ASSIGNED],
  optionalQuestionnaires: [OPTIONAL],
  questionnaireContextLists: [
    { listContext: { contextType: 3, contextIdentifier: 'APPT-9' }, assignedQuestionnaires: [ASSIGNED], index: 0 },
  ],
  completedQuestionnaires: [{ whateverEpicSends: 1 }],
  showSeriesText: true,
  showBackButton: true,
  callingApp: 1,
  showPretext: true,
  messageQnrExpired: true,
  sourceActivity: 4,
}

function standardOf(body: unknown) {
  return questionnairesProcessor.standard({
    requests: [
      { path: '/api/questionnaire/GetQuestionnaireList', method: 'POST', status: 200, contentType: 'application/json', body },
    ],
  })
}

describe('fetchQuestionnairesRaw', () => {
  it('throws rather than returning no questionnaires when the page has no token', async () => {
    await expect(fetchQuestionnairesRaw(mockRequest([{ body: '<html></html>' }]))).rejects.toBeInstanceOf(MissingVerificationTokenError)
  })

  it('records the React activity page and the GetQuestionnaireList POST', async () => {
    const raw = await fetchQuestionnairesRaw(mockRequest([{ body: TOKEN_PAGE }, { body: JSON.stringify(RESPONSE) }]))
    expect(raw.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      'GET /app/questionnaires',
      'POST /api/questionnaire/GetQuestionnaireList',
    ])
    // Epic's own client posts no request data; the body is the empty object.
    expect(raw.requests[1]!.requestBody).toEqual({})
  })
})

describe('questionnairesProcessor', () => {
  it('keeps the four lists apart under MyChart\'s own names', () => {
    const standard = standardOf(RESPONSE)
    expect(Object.keys(standard)).toEqual([
      'assignedQuestionnaires',
      'optionalQuestionnaires',
      'questionnaireContextLists',
      'completedQuestionnaires',
    ])
  })

  it('carries every field a consumer reads off an assigned entry', () => {
    const assigned = standardOf(RESPONSE).assignedQuestionnaires[0]!
    expect(assigned.dueDateISO).toBe('2026-04-15')
    expect(assigned.apptDateISO).toBe('2026-04-22')
    expect(assigned.displayNameOverride).toBe('Before your visit')
    expect(assigned.questionnaire.name).toBe('Annual Health Risk Assessment')
    expect(assigned.questionnaire.id).toBe('QNR-1041')
    expect(assigned.questionnaire.status).toBe(2)
    expect(assigned.questionnaire.filterType).toBe('Appointment')
    expect(assigned.seriesData).toEqual(ASSIGNED.seriesData)
    expect(assigned.context).toEqual(ASSIGNED.context)
  })

  it('drops the caller-describing and UI-only fields', () => {
    const standard = standardOf(RESPONSE)
    expect(standard.assignedQuestionnaires[0]!).not.toHaveProperty('isProxyAccessing')
    expect(standard.optionalQuestionnaires[0]!).not.toHaveProperty('disablePastResponse')
    expect(standard.questionnaireContextLists[0]!).not.toHaveProperty('index')
    expect(standard).not.toHaveProperty('showSeriesText')
    expect(standard).not.toHaveProperty('callingApp')
  })

  it('projects a context list the same way as a top-level assigned entry', () => {
    const standard = standardOf(RESPONSE)
    expect(standard.questionnaireContextLists[0]!.assignedQuestionnaires).toEqual(standard.assignedQuestionnaires)
    expect(standard.questionnaireContextLists[0]!.listContext).toEqual({ contextType: 3, contextIdentifier: 'APPT-9' })
  })

  it('passes a completed questionnaire through whole — the element shape is uncaptured', () => {
    expect(standardOf(RESPONSE).completedQuestionnaires).toEqual([{ whateverEpicSends: 1 }])
  })

  it('emits a listed field even when the response omits it', () => {
    const standard = standardOf({ assignedQuestionnaires: [{}] })
    expect(standard.assignedQuestionnaires[0]).toEqual({
      dueDateISO: null,
      apptDateISO: null,
      isHistory: null,
      seriesData: {},
      hxData: {},
      displayNameOverride: null,
      isTravelScreening: null,
      context: {},
      questionnaire: {
        type: null,
        isContextSpecific: null,
        preText: null,
        postText: null,
        isPreTextSmartText: null,
        isPostTextSmartText: null,
        status: null,
        rootName: null,
        id: null,
        name: null,
        filterType: null,
      },
    })
  })

  it('reports a missing response as four empty lists', () => {
    expect(questionnairesProcessor.standard({ requests: [] })).toEqual({
      assignedQuestionnaires: [],
      optionalQuestionnaires: [],
      questionnaireContextLists: [],
      completedQuestionnaires: [],
    })
  })

  it('narrows concise to name, status, due date and which list it is in', () => {
    expect(questionnairesProcessor.concise(standardOf(RESPONSE))).toEqual({
      assignedQuestionnaires: [
        {
          dueDateISO: '2026-04-15',
          displayNameOverride: 'Before your visit',
          questionnaire: { id: 'QNR-1041', name: 'Annual Health Risk Assessment', status: 2 },
        },
      ],
      optionalQuestionnaires: [
        {
          description: 'How you have been feeling lately.',
          questionnaire: { id: 'QNR-2088', name: 'Mood Check-In', status: 0 },
        },
      ],
      questionnaireContextLists: [
        {
          assignedQuestionnaires: [
            {
              dueDateISO: '2026-04-15',
              displayNameOverride: 'Before your visit',
              questionnaire: { id: 'QNR-1041', name: 'Annual Health Risk Assessment', status: 2 },
            },
          ],
        },
      ],
      completedQuestionnaires: [{ whateverEpicSends: 1 }],
    })
  })
})

describe('getQuestionnaires', () => {
  it('returns the standard object', async () => {
    const result = await getQuestionnaires(mockRequest([{ body: TOKEN_PAGE }, { body: JSON.stringify(RESPONSE) }]))
    expect(result.assignedQuestionnaires[0]!.questionnaire.name).toBe('Annual Health Risk Assessment')
    expect(result.optionalQuestionnaires[0]!.questionnaire.name).toBe('Mood Check-In')
  })
})
