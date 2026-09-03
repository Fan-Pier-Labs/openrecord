import { describe, it, expect, mock } from 'bun:test'
import { getAllergies, fetchAllergiesRaw, allergiesProcessor } from '../allergies'
import { MyChartRequest } from '../../../core/myChartRequest'
import { MissingVerificationTokenError } from '../../../core/util'
import { renderOutput } from '../../../processors/processor'

function mockRequest(responses: Array<{ body: string }>) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  let i = 0
  req.transport = mock(async () => {
    const r = responses[i++]
    return new Response(r!.body, { status: 200 })
  })
  return req
}

const TOKEN = { body: '<input name="__RequestVerificationToken" value="t" />' }

describe('getAllergies', () => {
  it('throws when no verification token found', async () => {
    const req = mockRequest([{ body: '<html></html>' }])
    await expect(getAllergies(req)).rejects.toBeInstanceOf(MissingVerificationTokenError)
  })

  it('passes the allergy elements through whole and keeps the page-level status', async () => {
    const dataList = [
      { allergyItem: { name: 'Penicillin', id: 'A1', formattedDateNoted: '01/15/2020', type: 'Drug', reaction: 'Hives', severity: 'High' } },
      { name: 'Peanuts', id: 'A2', reaction: 'Anaphylaxis' },
    ]
    const req = mockRequest([
      TOKEN,
      { body: JSON.stringify({ dataList, allergiesStatus: 1, dateOfBirth: '01/01/1980', hasUpdateSecurity: true, showDxrRefreshBanner: false }) },
    ])
    const result = await getAllergies(req)
    expect(result).toEqual({ dataList, allergiesStatus: 1, dateOfBirth: '01/01/1980' })
  })

  it('keeps an empty list as the answer, with null for what MyChart did not send', async () => {
    const req = mockRequest([TOKEN, { body: JSON.stringify({ dataList: [] }) }])
    expect(await getAllergies(req)).toEqual({ dataList: [], allergiesStatus: null, dateOfBirth: null })
  })

  it('handles a missing dataList', async () => {
    const req = mockRequest([TOKEN, { body: JSON.stringify({ allergiesStatus: 2 }) }])
    expect((await getAllergies(req)).dataList).toEqual([])
  })

  it('records the requests and renders every mode', async () => {
    const req = mockRequest([TOKEN, { body: JSON.stringify({ dataList: [{ name: 'Peanuts' }], allergiesStatus: 1, hasUpdateSecurity: true }) }])
    const raw = await fetchAllergiesRaw(req)
    expect(raw.requests.map((r) => r.path)).toEqual(['/Clinical/Allergies', '/api/allergies/LoadAllergies'])
    expect(renderOutput(allergiesProcessor, raw, 'raw')).toEqual({ dataList: [{ name: 'Peanuts' }], allergiesStatus: 1, hasUpdateSecurity: true })
    expect(renderOutput(allergiesProcessor, raw, 'json')).toEqual({ dataList: [{ name: 'Peanuts' }], allergiesStatus: 1, dateOfBirth: null })
    expect(renderOutput(allergiesProcessor, raw, 'standard')).toContain('| Peanuts |')
    const concise = renderOutput(allergiesProcessor, raw, 'concise') as string
    expect(concise).toContain('allergiesStatus')
    expect(concise).not.toContain('dateOfBirth')
  })
})
