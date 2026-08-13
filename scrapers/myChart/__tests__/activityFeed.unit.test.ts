import { describe, it, expect, mock } from 'bun:test'
import { getActivityFeed } from '../activityFeed'
import { MyChartRequest } from '../myChartRequest'

function mockRequest(responses: Array<{ body: string }>) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  let i = 0
  req.transport = mock(async () => {
    const r = responses[i++]
    return new Response(r.body, { status: 200 })
  })
  return req
}

describe('getActivityFeed', () => {
  it('returns empty array when no token found', async () => {
    const req = mockRequest([{ body: '<html></html>' }])
    expect(await getActivityFeed(req)).toEqual([])
  })

  it('parses feed items from API response', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      {
        body: JSON.stringify({
          singleItemFeedViewModels: [{
            feedItems: [
              { identifier: 'F1', displayText: 'New lab result', announcementBody: 'CBC results available', priorityInstant: 1709251200000, type: 'lab', primaryAction: { uri: '/app/test-results' } },
            ],
          }],
        }),
      },
    ])

    const result = await getActivityFeed(req)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      id: 'F1',
      title: 'New lab result',
      description: 'CBC results available',
      date: new Date(1709251200000).toISOString(),
      type: 'lab',
      link: '/app/test-results',
    })
  })

  it('handles missing fields with defaults', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      { body: JSON.stringify({ singleItemFeedViewModels: [{ feedItems: [{}] }] }) },
    ])
    const result = await getActivityFeed(req)
    expect(result[0]).toEqual({ id: '', title: '', description: '', date: '', type: '', link: '' })
  })

  it('handles empty items list', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      { body: JSON.stringify({ singleItemFeedViewModels: [] }) },
    ])
    expect(await getActivityFeed(req)).toEqual([])
  })
})
