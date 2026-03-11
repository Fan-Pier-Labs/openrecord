import { describe, it, expect, mock } from 'bun:test'
import { listConversations } from '../conversations'
import { MyChartRequest } from '../../myChartRequest'

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

describe('listConversations', () => {
  it('returns empty array when no token found', async () => {
    const req = mockRequest([{ body: '<html></html>' }])
    const result = await listConversations(req)
    expect(result).toBeNull()
  })

  it('returns conversation list', async () => {
    const conversationsData = {
      threads: [
        {
          subject: 'Lab Results Question',
          senderName: 'Dr. Smith',
          lastMessageDateDisplay: '01/15/2025',
          preview: 'Your recent lab results look normal.',
        },
        {
          subject: 'Prescription Refill',
          senderName: 'Nurse Johnson',
          lastMessageDateDisplay: '01/10/2025',
          preview: 'Your refill has been processed.',
        },
      ],
    }

    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="csrf_tok" />' },
      { body: JSON.stringify(conversationsData) },
    ])

    const result = await listConversations(req)
    expect(result.threads).toHaveLength(2)
    expect(result.threads[0].subject).toBe('Lab Results Question')
    expect(result.threads[0].senderName).toBe('Dr. Smith')
    expect(result.threads[1].subject).toBe('Prescription Refill')
  })

  it('returns empty threads array', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="tok" />' },
      { body: JSON.stringify({ threads: [] }) },
    ])

    const result = await listConversations(req)
    expect(result.threads).toHaveLength(0)
  })

  it('sends correct POST body with conversation params', async () => {
    const req = new MyChartRequest('mychart.example.com')
    req.firstPathPart = 'MyChart'
    const calls: Array<{ url: string; init?: RequestInit }> = []
    let callIndex = 0

    const responses = [
      { body: '<input name="__RequestVerificationToken" value="tok" />' },
      { body: JSON.stringify({ threads: [] }) },
    ]

    req.fetchWithCookieJar = mock(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: url.toString(), init })
      const r = responses[callIndex++]
      return new Response(r.body, { status: 200 })
    }) as typeof req.fetchWithCookieJar

    await listConversations(req)

    // Second call should be the GetConversationList POST
    expect(calls[1].init?.method).toBe('POST')
    const headers = calls[1].init!.headers as Record<string, string>
    expect(headers['__RequestVerificationToken']).toBe('tok')
    expect(headers['Content-Type']).toBe('application/json; charset=utf-8')

    const body = JSON.parse(calls[1].init!.body as string)
    expect(body.tag).toBe(1)
    expect(body.searchQuery).toBe('')
    expect(body.localLoadParams).toBeDefined()
    expect(body.localLoadParams.pagingInfo).toBe(1)
  })

  it('handles response with additional metadata', async () => {
    const conversationsData = {
      threads: [
        { subject: 'Test', senderName: 'Dr. A', preview: 'Hello' },
      ],
      totalCount: 42,
      hasMore: true,
    }

    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="tok" />' },
      { body: JSON.stringify(conversationsData) },
    ])

    const result = await listConversations(req)
    expect(result.threads).toHaveLength(1)
    expect(result.totalCount).toBe(42)
    expect(result.hasMore).toBe(true)
  })
})
