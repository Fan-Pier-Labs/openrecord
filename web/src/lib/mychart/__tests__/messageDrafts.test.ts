import { describe, it, expect, mock } from 'bun:test'
import { saveReplyDraft, saveNewMessageDraft, deleteDraft } from '../messageDrafts'
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

describe('saveReplyDraft', () => {
  it('returns error when no token found', async () => {
    const req = mockRequest([{ body: '<html></html>' }])
    const result = await saveReplyDraft(req, 'conv-1', 'draft text')
    expect(result.success).toBe(false)
    expect(result.error).toContain('verification token')
  })

  it('returns success on 200 response', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      { body: '' },
    ])
    const result = await saveReplyDraft(req, 'conv-1', 'draft text')
    expect(result.success).toBe(true)
  })
})

describe('saveNewMessageDraft', () => {
  it('returns error when no token found', async () => {
    const req = mockRequest([{ body: '<html></html>' }])
    const result = await saveNewMessageDraft(req, 'draft body', 'Subject')
    expect(result.success).toBe(false)
  })

  it('returns success on 200 response', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      { body: '' },
    ])
    const result = await saveNewMessageDraft(req, 'draft body', 'Subject')
    expect(result.success).toBe(true)
  })
})

describe('deleteDraft', () => {
  it('returns error when no token found', async () => {
    const req = mockRequest([{ body: '<html></html>' }])
    const result = await deleteDraft(req, 'conv-1')
    expect(result.success).toBe(false)
  })

  it('returns success on 200 response', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      { body: '' },
    ])
    const result = await deleteDraft(req, 'conv-1')
    expect(result.success).toBe(true)
  })
})
