import { describe, it, expect, mock } from 'bun:test'
import { getEhiExportTemplates } from '../ehiExport'
import { MyChartRequest } from '../../core/myChartRequest'

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

describe('getEhiExportTemplates', () => {
  it('returns empty array when no token found', async () => {
    const req = mockRequest([{ body: '<html></html>' }])
    expect(await getEhiExportTemplates(req)).toEqual([])
  })

  it('parses templates from API response', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      {
        body: JSON.stringify({
          ehieTemplates: [
            { id: 'T1', name: 'Full Health Record', description: 'Complete EHI export', hideAdditionalComments: false },
          ],
        }),
      },
    ])

    const result = await getEhiExportTemplates(req)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      id: 'T1',
      name: 'Full Health Record',
      description: 'Complete EHI export',
    })
  })

  it('handles missing fields with defaults', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      { body: JSON.stringify({ ehieTemplates: [{}] }) },
    ])
    const result = await getEhiExportTemplates(req)
    expect(result[0]).toEqual({ id: '', name: '', description: '' })
  })

  it('handles empty list', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      { body: JSON.stringify({ ehieTemplates: [] }) },
    ])
    expect(await getEhiExportTemplates(req)).toEqual([])
  })
})
