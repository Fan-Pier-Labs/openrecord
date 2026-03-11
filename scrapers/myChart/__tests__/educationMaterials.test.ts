import { describe, it, expect, mock } from 'bun:test'
import { getEducationMaterials } from '../educationMaterials'
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

describe('getEducationMaterials', () => {
  it('returns empty array when no token found', async () => {
    const req = mockRequest([{ body: '<html></html>' }])
    expect(await getEducationMaterials(req)).toEqual([])
  })

  it('parses materials from API response', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      {
        body: JSON.stringify({
          educationTitles: [
            { id: 'E1', title: 'Managing Diabetes', category: 'Chronic Conditions', assignedDate: '2024-02-15', providerName: 'Dr. Smith' },
          ],
        }),
      },
    ])

    const result = await getEducationMaterials(req)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      id: 'E1',
      title: 'Managing Diabetes',
      category: 'Chronic Conditions',
      assignedDate: '2024-02-15',
      providerName: 'Dr. Smith',
    })
  })

  it('handles missing fields with defaults', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      { body: JSON.stringify({ educationTitles: [{}] }) },
    ])
    const result = await getEducationMaterials(req)
    expect(result[0]).toEqual({ id: '', title: '', category: '', assignedDate: '', providerName: '' })
  })

  it('handles empty list', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      { body: JSON.stringify({ educationTitles: [] }) },
    ])
    expect(await getEducationMaterials(req)).toEqual([])
  })
})
