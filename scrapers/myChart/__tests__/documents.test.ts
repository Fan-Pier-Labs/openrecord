import { describe, it, expect, mock } from 'bun:test'
import { getDocuments } from '../documents'
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

describe('getDocuments', () => {
  it('returns empty array when no token found', async () => {
    const req = mockRequest([{ body: '<html></html>' }])
    expect(await getDocuments(req)).toEqual([])
  })

  it('parses documents from API response', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      {
        body: JSON.stringify({
          documents: [
            {
              id: 'D1',
              title: 'After Visit Summary',
              documentType: 'AVS',
              date: '2024-01-15',
              providerName: 'Dr. Smith',
              organizationName: 'Example Medical',
            },
          ],
        }),
      },
    ])

    const result = await getDocuments(req)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      id: 'D1',
      title: 'After Visit Summary',
      documentType: 'AVS',
      date: '2024-01-15',
      providerName: 'Dr. Smith',
      organizationName: 'Example Medical',
    })
  })

  it('handles missing fields with defaults', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      { body: JSON.stringify({ documents: [{}] }) },
    ])

    const result = await getDocuments(req)
    expect(result[0]).toEqual({
      id: '',
      title: '',
      documentType: '',
      date: '',
      providerName: '',
      organizationName: '',
    })
  })

  it('handles empty documents list', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      { body: JSON.stringify({ documents: [] }) },
    ])
    expect(await getDocuments(req)).toEqual([])
  })
})
