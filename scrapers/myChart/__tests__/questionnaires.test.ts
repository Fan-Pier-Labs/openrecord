import { describe, it, expect, mock } from 'bun:test'
import { getQuestionnaires } from '../questionnaires'
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

describe('getQuestionnaires', () => {
  it('returns empty array when no token found', async () => {
    const req = mockRequest([{ body: '<html></html>' }])
    expect(await getQuestionnaires(req)).toEqual([])
  })

  it('parses questionnaires from API response', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      {
        body: JSON.stringify({
          questionnaires: [
            { id: 'Q1', name: 'PHQ-9', status: 'Completed', dueDate: '2024-01-15', completedDate: '2024-01-10' },
          ],
        }),
      },
    ])

    const result = await getQuestionnaires(req)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      id: 'Q1',
      name: 'PHQ-9',
      status: 'Completed',
      dueDate: '2024-01-15',
      completedDate: '2024-01-10',
    })
  })

  it('handles missing fields with defaults', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      { body: JSON.stringify({ questionnaires: [{}] }) },
    ])
    const result = await getQuestionnaires(req)
    expect(result[0]).toEqual({ id: '', name: '', status: '', dueDate: '', completedDate: '' })
  })

  it('handles empty list', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      { body: JSON.stringify({ questionnaires: [] }) },
    ])
    expect(await getQuestionnaires(req)).toEqual([])
  })
})
