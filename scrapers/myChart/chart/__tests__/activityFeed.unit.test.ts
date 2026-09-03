import { describe, it, expect, mock } from 'bun:test'
import { getActivityFeed, fetchActivityFeedRaw, activityFeedProcessor } from '../activityFeed'
import { MyChartRequest } from '../../core/myChartRequest'
import { MissingVerificationTokenError } from '../../core/util'
import type { RawResponse } from '../../core/rawResponse'

function mockRequest(responses: Array<{ body: string }>) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  let i = 0
  req.transport = mock(async () => {
    const r = responses[i++]
    return new Response(r!.body, { status: 200, headers: { 'content-type': 'application/json' } })
  })
  return req
}

const TOKEN_PAGE = '<input name="__RequestVerificationToken" value="t" />'

/** The captured `feedItems` element, every field. */
const ITEM = {
  phone: '555-0100',
  smsActive: false,
  allTextEnabled: false,
  email: '',
  allEmailEnabled: false,
  canEditInfo: true,
  displayText: 'New lab result',
  type: 'lab',
  defaultType: 'lab',
  groupCount: 1,
  priority: 5,
  priorityInstant: 1709251200000,
  iconKey: 'lab',
  subiconKey: '',
  shouldShowWatermark: false,
  primaryAction: { uriId: 'u', uri: '/app/test-results', uriType: 1, uriDisplayText: 'View results', uriAccessibleText: '', uriIconKey: '', isHidden: false },
  secondaryAction: { uriId: '', uri: '', uriType: 0, uriDisplayText: '', uriAccessibleText: '', uriIconKey: '', isHidden: true },
  identifier: 'F1',
  topicId: 3,
  isH2GEnabled: false,
}

const FEED = {
  singleItemFeedViewModels: [{
    eptId: 'EPT-1',
    displayName: 'Homer',
    photoUrl: '/p.jpg',
    tabColor: 2,
    zeroStateIconKey: '',
    isSelected: true,
    feedItems: [ITEM],
    todayItems: [{ ...ITEM, identifier: 'F2', displayText: 'Appointment today', titleDisplayText: 'Today', announcementBody: 'Bring your card' }],
  }],
  linkedAccountsViewModel: { subjectName: 'x' },
}

const ITEM_STANDARD = {
  identifier: 'F1',
  displayText: 'New lab result',
  titleDisplayText: null,
  announcementBody: null,
  type: 'lab',
  defaultType: 'lab',
  topicId: 3,
  priority: 5,
  priorityInstant: 1709251200000,
  priorityInstantISO: '2024-03-01T00:00:00.000Z',
  groupCount: 1,
  primaryAction: { uriDisplayText: 'View results' },
}

function envelope(body: unknown): RawResponse {
  return { requests: [{ path: '/api/item-feed/FetchItemFeed', method: 'POST', requestBody: { maxItems: 50, offset: 0 }, status: 200, contentType: 'application/json', body }] }
}

describe('fetchActivityFeedRaw', () => {
  it('throws rather than returning an empty feed when the page has no token', async () => {
    await expect(fetchActivityFeedRaw(mockRequest([{ body: '<html></html>' }]))).rejects.toBeInstanceOf(MissingVerificationTokenError)
  })

  it('records the home page and the FetchItemFeed POST with its paging body', async () => {
    const raw = await fetchActivityFeedRaw(mockRequest([{ body: TOKEN_PAGE }, { body: JSON.stringify(FEED) }]))
    expect(raw.requests.map((r) => `${r.method} ${r.path}`)).toEqual(['GET /app/home', 'POST /api/item-feed/FetchItemFeed'])
    expect(raw.requests[1]!.requestBody).toEqual({ maxItems: 50, offset: 0 })
    expect(raw.requests[1]!.body).toEqual(FEED)
  })
})

describe('activityFeedProcessor', () => {
  it('keeps each patient tab with its three item lists under MyChart names', () => {
    const standard = activityFeedProcessor.standard(envelope(FEED))
    expect(standard.singleItemFeedViewModels).toHaveLength(1)
    const vm = standard.singleItemFeedViewModels[0]!
    expect(vm.displayName).toBe('Homer')
    expect(vm.eptId).toBe('EPT-1')
    expect(vm).not.toHaveProperty('photoUrl')
    expect(vm.feedItems).toEqual([ITEM_STANDARD])
    expect(vm.todayItems[0]).toMatchObject({ identifier: 'F2', titleDisplayText: 'Today', announcementBody: 'Bring your card' })
    expect(vm.forYouItems).toEqual([])
    expect(standard).not.toHaveProperty('linkedAccountsViewModel')
    // Portal links, icons and the contact-info nag fields are UI.
    expect(vm.feedItems[0]!.primaryAction).toEqual({ uriDisplayText: 'View results' })
    expect(vm.feedItems[0]).not.toHaveProperty('phone')
  })

  it('emits every field as null on an item with nothing in it, and no instant for priorityInstant 0', () => {
    const standard = activityFeedProcessor.standard(envelope({ singleItemFeedViewModels: [{ feedItems: [{}, { priorityInstant: 0 }] }] }))
    expect(standard.singleItemFeedViewModels[0]!.feedItems[0]).toEqual({
      identifier: null,
      displayText: null,
      titleDisplayText: null,
      announcementBody: null,
      type: null,
      defaultType: null,
      topicId: null,
      priority: null,
      priorityInstant: null,
      priorityInstantISO: null,
      groupCount: null,
      primaryAction: { uriDisplayText: null },
    })
    expect(standard.singleItemFeedViewModels[0]!.feedItems[1]).toMatchObject({ priorityInstant: 0, priorityInstantISO: null })
  })

  it('reports an empty feed as empty', () => {
    expect(activityFeedProcessor.standard(envelope({ singleItemFeedViewModels: [] }))).toEqual({ singleItemFeedViewModels: [] })
    expect(activityFeedProcessor.standard({ requests: [] })).toEqual({ singleItemFeedViewModels: [] })
  })

  it('projects concise to whose item, what it says and when', () => {
    expect(activityFeedProcessor.concise(activityFeedProcessor.standard(envelope(FEED)))).toEqual({
      singleItemFeedViewModels: [{
        displayName: 'Homer',
        feedItems: [{ displayText: 'New lab result', priorityInstantISO: '2024-03-01T00:00:00.000Z' }],
        todayItems: [{ displayText: 'Appointment today', priorityInstantISO: '2024-03-01T00:00:00.000Z' }],
        forYouItems: [],
      }],
    })
  })
})

describe('getActivityFeed', () => {
  it('returns the standard object', async () => {
    const result = await getActivityFeed(mockRequest([{ body: TOKEN_PAGE }, { body: JSON.stringify(FEED) }]))
    expect(result.singleItemFeedViewModels[0]!.feedItems[0]!.priorityInstantISO).toBe('2024-03-01T00:00:00.000Z')
  })
})
