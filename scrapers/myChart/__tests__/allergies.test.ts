import { describe, it, expect, mock } from 'bun:test'
import { getAllergies } from '../allergies'
import { MyChartRequest } from '../myChartRequest'

function mockRequest(responses: Array<{ body: string }>) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  let i = 0
  req.fetchWithCookieJar = mock(async () => {
    const r = responses[i++]
    return new Response(r.body, { status: 200 })
  }) as typeof req.fetchWithCookieJar
  return req
}

describe('getAllergies', () => {
  it('returns empty when no verification token found', async () => {
    const req = mockRequest([{ body: '<html><body>No token here</body></html>' }])
    const result = await getAllergies(req)
    expect(result).toEqual({ allergies: [], allergiesStatus: -1 })
  })

  it('parses allergies from API response', async () => {
    const req = mockRequest([
      { body: '<html><input name="__RequestVerificationToken" value="tok123" /></html>' },
      {
        body: JSON.stringify({
          dataList: [
            {
              allergyItem: {
                name: 'Penicillin',
                id: 'A1',
                formattedDateNoted: '01/15/2020',
                type: 'Medication',
                reaction: 'Hives',
                severity: 'Moderate',
              },
            },
            {
              allergyItem: {
                name: 'Peanuts',
                id: 'A2',
                formattedDateNoted: '03/10/2018',
                type: 'Food',
                reaction: 'Anaphylaxis',
                severity: 'Severe',
              },
            },
          ],
          allergiesStatus: 1,
        }),
      },
    ])

    const result = await getAllergies(req)
    expect(result.allergiesStatus).toBe(1)
    expect(result.allergies).toHaveLength(2)
    expect(result.allergies[0]).toEqual({
      name: 'Penicillin',
      id: 'A1',
      formattedDateNoted: '01/15/2020',
      type: 'Medication',
      reaction: 'Hives',
      severity: 'Moderate',
    })
    expect(result.allergies[1].name).toBe('Peanuts')
  })

  it('handles empty dataList', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      { body: JSON.stringify({ dataList: [], allergiesStatus: 0 }) },
    ])
    const result = await getAllergies(req)
    expect(result.allergies).toEqual([])
    expect(result.allergiesStatus).toBe(0)
  })

  it('handles missing dataList', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      { body: JSON.stringify({}) },
    ])
    const result = await getAllergies(req)
    expect(result.allergies).toEqual([])
    expect(result.allergiesStatus).toBe(-1)
  })

  it('handles flat allergy items without nested allergyItem', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      {
        body: JSON.stringify({
          dataList: [{ name: 'Latex', id: 'L1', formattedDateNoted: '', type: '', reaction: '', severity: '' }],
          allergiesStatus: 1,
        }),
      },
    ])
    const result = await getAllergies(req)
    expect(result.allergies[0].name).toBe('Latex')
  })
})
