import { describe, it, expect, mock } from 'bun:test'
import { getHealthIssues, fetchHealthIssuesRaw, healthIssuesProcessor } from '../healthIssues'
import { MyChartRequest } from '../../core/myChartRequest'
import { MissingVerificationTokenError } from '../../core/util'
import { renderOutput } from '../../processors/processor'

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

describe('getHealthIssues', () => {
  it('throws when no token found', async () => {
    const req = mockRequest([{ body: '<html></html>' }])
    await expect(getHealthIssues(req)).rejects.toBeInstanceOf(MissingVerificationTokenError)
  })

  it('keeps the health issue item, the cross-organization copies, and drops the duplicate localItem', async () => {
    const req = mockRequest([
      TOKEN,
      {
        body: JSON.stringify({
          dataList: [
            {
              healthIssueItem: { name: 'Hypertension', id: 'HI-1', formattedDateNoted: '01/01/2020', isReadOnly: true, action: 2 },
              localItem: { name: 'Hypertension', id: 'HI-1' },
              externalItems: [{ name: 'HTN' }],
              externalOrgs: [{ organizationName: 'Elsewhere' }],
              hasLocalInstance: true,
              contentLinkURL: '/edu/htn',
            },
          ],
          healthIssuesUrl: '/x',
        }),
      },
    ])
    const result = await getHealthIssues(req)
    expect(result).toEqual({
      dataList: [
        {
          healthIssueItem: { name: 'Hypertension', formattedDateNoted: '01/01/2020', id: 'HI-1', isReadOnly: true },
          externalItems: [{ name: 'HTN' }],
          externalOrgs: [{ organizationName: 'Elsewhere' }],
          hasLocalInstance: true,
        },
      ],
    })
  })

  it('emits null for missing fields rather than dropping them', async () => {
    const req = mockRequest([TOKEN, { body: JSON.stringify({ dataList: [{ healthIssueItem: { name: 'X' } }] }) }])
    const item = (await getHealthIssues(req)).dataList[0]!
    expect(item.healthIssueItem).toEqual({ name: 'X', formattedDateNoted: null, id: null, isReadOnly: null })
    expect(item.hasLocalInstance).toBeNull()
  })

  it('handles empty dataList and renders every mode', async () => {
    const req = mockRequest([TOKEN, { body: JSON.stringify({ dataList: [] }) }])
    const raw = await fetchHealthIssuesRaw(req)
    expect(healthIssuesProcessor.standard(raw)).toEqual({ dataList: [] })
    expect(renderOutput(healthIssuesProcessor, raw, 'concise')).toBe('- **dataList**: (none)\n')
    expect(renderOutput(healthIssuesProcessor, raw, 'raw')).toEqual({ dataList: [] })
  })

  it('concise keeps only the name and date', () => {
    const concise = healthIssuesProcessor.concise({
      dataList: [{ healthIssueItem: { name: 'A', formattedDateNoted: 'd', id: '1', isReadOnly: false }, externalItems: [], externalOrgs: [], hasLocalInstance: false }],
    })
    expect(concise).toEqual({ dataList: [{ name: 'A', formattedDateNoted: 'd' }] })
  })
})
