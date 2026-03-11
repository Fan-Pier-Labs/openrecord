import { describe, it, expect, mock } from 'bun:test'
import { getHealthIssues } from '../healthIssues'
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

describe('getHealthIssues', () => {
  it('returns empty array when no token found', async () => {
    const req = mockRequest([{ body: '<html></html>' }])
    expect(await getHealthIssues(req)).toEqual([])
  })

  it('parses health issues from API response', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      {
        body: JSON.stringify({
          dataList: [
            { healthIssueItem: { name: 'Hypertension', id: 'H1', formattedDateNoted: '06/2019', isReadOnly: true } },
            { healthIssueItem: { name: 'Type 2 Diabetes', id: 'H2', formattedDateNoted: '01/2021', isReadOnly: false } },
          ],
        }),
      },
    ])

    const result = await getHealthIssues(req)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ name: 'Hypertension', id: 'H1', formattedDateNoted: '06/2019', isReadOnly: true })
    expect(result[1]).toEqual({ name: 'Type 2 Diabetes', id: 'H2', formattedDateNoted: '01/2021', isReadOnly: false })
  })

  it('handles missing fields with defaults', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      { body: JSON.stringify({ dataList: [{ healthIssueItem: {} }] }) },
    ])
    const result = await getHealthIssues(req)
    expect(result[0]).toEqual({ name: '', id: '', formattedDateNoted: '', isReadOnly: false })
  })

  it('handles empty dataList', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      { body: JSON.stringify({ dataList: [] }) },
    ])
    expect(await getHealthIssues(req)).toEqual([])
  })
})
