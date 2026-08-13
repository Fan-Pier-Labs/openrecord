import { describe, it, expect, mock } from 'bun:test'
import { getEducationMaterials } from '../educationMaterials'
import { MyChartRequest } from '../myChartRequest'

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

describe('getEducationMaterials', () => {
  it('returns empty array when no token found', async () => {
    const req = mockRequest([{ body: '<html></html>' }])
    expect(await getEducationMaterials(req)).toEqual([])
  })

  it('parses materials from API response', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      {
        body: JSON.stringify([
          { elementId: 'E1', displayName: 'Managing Diabetes', assignedDate: '2024-02-15', eduKey: 'EDU-K1', numTopics: 4 },
        ]),
      },
    ])

    const result = await getEducationMaterials(req)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      id: 'E1',
      title: 'Managing Diabetes',
      assignedDate: '2024-02-15',
      numTopics: 4,
    })
  })

  it('handles missing fields with defaults', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      { body: JSON.stringify([{}]) },
    ])
    const result = await getEducationMaterials(req)
    expect(result[0]).toEqual({ id: '', title: '', assignedDate: '', numTopics: 0 })
  })

  it('handles empty list', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      { body: JSON.stringify([]) },
    ])
    expect(await getEducationMaterials(req)).toEqual([])
  })
})
