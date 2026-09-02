/**
 * Fidelity tests for behaviors captured on real MyChart instances (three live
 * captures: one on Epic's August 2025 release, two behaving as November 2025)
 * and now modelled by fake-mychart:
 *
 *  - GetList accepts only groupType 0/1 (one combined list of labs+imaging);
 *    anything else is a 500 with ASP.NET Web API's {"Message": ...} body.
 *  - GetDetails answers an unknown orderKey with a 200 EMPTY shell, never an
 *    error and never another order's data.
 *  - GetVisitNotes / GetLetterDetails answer unknown ids with literal null.
 *  - Result enums are strings ('Read', 'LAB'/'IMAGING', 'Unknown'), components
 *    carry numeric values and bounds, and responses carry the full real field
 *    set (conformToShape).
 *  - GetMultipleHistoricalResultComponents returns a map keyed by component id.
 *  - Care Team is a legacy MVC activity: PascalCase envelope, POST-only, every
 *    request parameter optional, and the antiforgery token enforced like the
 *    /api/* routes enforce it.
 *  - The epicVersion knob switches the error surface and the November-2025-only
 *    result fields.
 *  - SendMedicalAdviceRequest silently DISCARDS a message body over 500 characters.
 *  - GetConversationMessages / GetConversationDetails key the thread on `id`,
 *    and reject a bad one DIFFERENTLY: Messages 500s, Details answers 200 with
 *    a literal null.
 *
 * Requires fake-mychart running on FAKE_MYCHART_HOST (default localhost:4000).
 * Run with: bun run test:integration
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { myChartUserPassLogin } from '../../auth/login'
import type { MyChartRequest } from '../../core/myChartRequest'
import { listLabResults } from '../../chart/labs/labResults'
import { getGoals } from '../../chart/goals'
import { getActivityFeed } from '../../chart/activityFeed'
import { getEducationMaterials } from '../../chart/educationMaterials'
import { getEhiExportTemplates } from '../../chart/ehiExport'
import { getUpcomingOrders } from '../../chart/upcomingOrders'
import { getEmergencyContacts } from '../../chart/emergencyContacts'
import { getVisitNotes } from '../../chart/notes'
import { getCareTeam } from '../../chart/careTeam'
import { getLetterDetails } from '../../chart/letters'
import {
  buildSendPayload,
  getMessageRecipients,
  getMessageTopics,
  getVerificationToken,
  sendNewMessage,
  type MessageRecipient,
  type MessageTopic,
} from '../../chart/messages/sendMessage'
import { listConversations } from '../../chart/messages/conversations'
import { resetFakeMyChart } from './mountMode'

const HOST = process.env.FAKE_MYCHART_HOST ?? 'localhost:4000'

async function setEpicVersion(version: 'November 2025' | 'August 2025'): Promise<void> {
  const res = await fetch(`http://${HOST}/mode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ epicVersion: version }),
  })
  if (!res.ok) throw new Error(`setEpicVersion failed: ${res.status}`)
}

let session: MyChartRequest

async function api(path: string, body: unknown): Promise<Response> {
  return session.makeRequest({
    path,
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', '__RequestVerificationToken': 'tok-test' },
    body: JSON.stringify(body),
  })
}

beforeAll(async () => {
  await resetFakeMyChart(HOST)
  const result = await myChartUserPassLogin({ hostname: HOST, user: 'homer', pass: 'donuts123', protocol: 'http' })
  if (result.state !== 'logged_in') throw new Error(`login failed: ${result.state}`)
  session = result.mychartRequest
  session.disableAutoKeepalive = true
})

afterAll(async () => { await resetFakeMyChart(HOST) })

describe('test-results fidelity', () => {
  it('serves ONE combined list (labs + imaging) for groupType 0 and 1', async () => {
    for (const groupType of [0, 1]) {
      const res = await api('/api/test-results/GetList', { groupType, searchString: '', maxResults: 1000, isCurAdmFilterEnabled: false })
      expect(res.status).toBe(200)
      const list = await res.json() as { groupBy: string; newResultGroups: Array<{ key: string }>; newResults: Record<string, { orderMetadata: { read: string; resultType: string } }> }
      const keys = list.newResultGroups.map(g => g.key)
      expect(keys).toContain('GRP-LIPID')
      expect(keys).toContain('GRP-XRAY')
      // Real instances encode these as enum-name strings, not numbers.
      expect(list.groupBy).toBe('ORDER')
      const kinds = new Set(Object.values(list.newResults).map(r => r.orderMetadata.resultType))
      expect(kinds).toContain('LAB')
      expect(kinds).toContain('IMAGING')
      for (const r of Object.values(list.newResults)) expect(r.orderMetadata.read).toBe('Read')
    }
  })

  it('rejects any other groupType with the ASP.NET Web API 500 body', async () => {
    for (const groupType of [2, 3, 99]) {
      const res = await api('/api/test-results/GetList', { groupType, searchString: '', maxResults: 1000, isCurAdmFilterEnabled: false })
      expect(res.status).toBe(500)
      expect(await res.json()).toEqual({ Message: 'An error has occurred.' })
    }
  })

  it('answers an unknown orderKey with a 200 empty shell, never another order', async () => {
    const res = await api('/api/test-results/GetDetails', { orderKey: 'GRP-DOES-NOT-EXIST', organizationID: '', PageNonce: '' })
    expect(res.status).toBe(200)
    const body = await res.json() as { orderName: string; key: string; results: Array<{ name: string; resultComponents: unknown[]; }> }
    expect(body.orderName).toBe('')
    expect(body.key).toBe('')
    expect(body.results).toHaveLength(1)
    expect(body.results[0]!.name).toBe('')
    expect(body.results[0]!.resultComponents).toEqual([])
  })

  it('carries the full real field set on details: numeric components, instants, string enums', async () => {
    const res = await api('/api/test-results/GetDetails', { orderKey: 'GRP-LIPID', organizationID: '', PageNonce: '' })
    const body = await res.json() as {
      isEnhancedAskAQuestionActive: boolean;
      results: Array<{
        baseSingleMessageUrl: string;
        relatedConversationIds: unknown[];
        orderMetadata: { read: string; resultType: string; latestUpdateInstantISO: string; associatedDiagnoses: unknown[] };
        resultComponents: Array<{ componentResultInfo: { numericValue: number; abnormalFlagCategoryValue: string; referenceRange: { low: number; high: number; lowerBoundExclusive: boolean } } }>;
        canGenerateLLMSummary?: boolean;
      }>;
    }
    expect(typeof body.isEnhancedAskAQuestionActive).toBe('boolean')
    const r = body.results[0]
    expect(typeof r!.baseSingleMessageUrl).toBe('string')
    expect(Array.isArray(r!.relatedConversationIds)).toBe(true)
    expect(r!.orderMetadata.read).toBe('Read')
    expect(r!.orderMetadata.resultType).toBe('LAB')
    expect(r!.orderMetadata.latestUpdateInstantISO).not.toBe(undefined)
    const comp = r!.resultComponents[0]!.componentResultInfo
    expect(comp.numericValue).toBe(280)
    expect(comp.referenceRange.low).toBe(125)
    expect(comp.referenceRange.high).toBe(200)
    expect(comp.referenceRange.lowerBoundExclusive).toBe(false)
    // Captured Sep 2026 against two real instances: this field is the literal
    // string "Unknown" on every component, including ones outside their own
    // reference range. The fake serves it because real MyChart does; the
    // scraper is what drops it (dropUnusableAbnormalFlags in labResults.ts).
    // Do not "fix" this fixture to say High/Low — that would be inventing data
    // real MyChart never sends.
    expect(comp.abnormalFlagCategoryValue).toBe('Unknown')
    // November 2025 instances add this per result; that release is the default.
    expect(r!.canGenerateLLMSummary).toBe(false)
  })

  it('returns historical trends as a map keyed by component id', async () => {
    const res = await api('/api/past-results/GetMultipleHistoricalResultComponents', {
      orderID: 'GRP-LIPID', selectedComponentIDs: [], isInitialLoad: true, startTime: '', endTime: '',
      organizationID: '', isCustomFilterEnabled: false, PageNonce: '',
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { historicalResults: Record<string, { historicalResultData: unknown[] }>; orderedComponentIDs: string[] }
    expect(Array.isArray(body.historicalResults)).toBe(false)
    expect(body.orderedComponentIDs).toContain('COMP-CHOL')
    expect(body.historicalResults['COMP-CHOL']!.historicalResultData.length).toBeGreaterThan(1)
  })

  it('listLabResults end-to-end: distinct panels, trends attached, imaging included', async () => {
    const results = await listLabResults(session)
    const names = results.map(r => r.orderName)
    expect(names).toContain('Comprehensive Metabolic Panel')
    expect(names).toContain('Lipid Panel')
    expect(names).toContain('Complete Blood Count')
    expect(names.some(n => n.startsWith('XR '))).toBe(true)
    const lipid = results.find(r => r.orderName === 'Lipid Panel')!
    expect(lipid.historicalResults?.historicalResults?.['COMP-CHOL']).toBeDefined()
  })
})

describe('null answers for unknown ids', () => {
  it('GetVisitNotes: unknown CSN → literal null; scraper returns an empty result', async () => {
    const raw = await api('/api/visit-notes/GetVisitNotes', { CSN: 'CSN-DOES-NOT-EXIST', FromPvdPage: true })
    expect(raw.status).toBe(200)
    expect(await raw.text()).toBe('null')
    const viaScraper = await getVisitNotes(session, 'CSN-DOES-NOT-EXIST')
    expect(viaScraper.notes).toEqual([])
  })

  it('GetLetterDetails: unknown hnoId → literal null; scraper returns empty body', async () => {
    const raw = await api('/api/letters/GetLetterDetails', { hnoId: 'HNO-NOPE', csn: 'CSN-NOPE' })
    expect(raw.status).toBe(200)
    expect(await raw.text()).toBe('null')
    const viaScraper = await getLetterDetails(session, 'HNO-NOPE', 'CSN-NOPE')
    expect(viaScraper).toEqual({ bodyHTML: '' })
  })
})

describe('real envelopes reach the scrapers end-to-end', () => {
  // Each of these scrapers used to read an envelope key only the fake served,
  // so it returned data against the fake and NOTHING against real MyChart.
  // Both sides now speak the real shape; empty results here mean regression.
  it('goals', async () => {
    const goals = await getGoals(session)
    expect(goals.careTeamGoals.length).toBeGreaterThan(0)
    expect(goals.patientGoals.length).toBeGreaterThan(0)
  })
  it('activity feed', async () => {
    const feed = await getActivityFeed(session)
    expect(feed.length).toBeGreaterThan(0)
    expect(feed[0]!.title).not.toBe('')
  })
  it('education materials', async () => {
    const materials = await getEducationMaterials(session)
    expect(materials.length).toBeGreaterThan(0)
    expect(materials[0]!.title).not.toBe('')
  })
  it('EHI export templates', async () => {
    const templates = await getEhiExportTemplates(session)
    expect(templates.length).toBeGreaterThan(0)
    expect(templates[0]!.name).not.toBe('')
  })
  it('upcoming orders', async () => {
    const orders = await getUpcomingOrders(session)
    expect(orders.length).toBeGreaterThan(0)
    expect(orders[0]!.orderName).not.toBe('')
  })
  it('emergency contacts', async () => {
    const contacts = await getEmergencyContacts(session)
    expect(contacts.length).toBeGreaterThan(0)
    expect(contacts[0]!.name).not.toBe('')
    expect(contacts[0]!.phoneNumber).not.toBe('')
  })
})

describe('care team fidelity', () => {
  // Care Team is one of the legacy jQuery activities, not a React /app/* one:
  // no /api prefix, a PascalCase envelope, and a GET that errors rather than
  // serving the data the POST returns.
  it('answers a GET to Load with the ASP.NET error surface, not data', async () => {
    const res = await session.makeRequest({ path: '/Clinical/CareTeam/Load', followRedirects: false })
    expect(res.status).toBe(302)
    expect(res.headers.get('location') ?? '').toContain('/Home/FiveHundred')
  })

  it('returns the full PascalCase provider shape for a bare POST', async () => {
    const res = await session.makeRequest({
      path: '/Clinical/CareTeam/Load',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', '__RequestVerificationToken': 'tok-test' },
      body: '{}',
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { ProvidersList: Array<Record<string, unknown>> }
    expect(body.ProvidersList.length).toBeGreaterThan(0)
    for (const field of ['ID', 'Name', 'Photo', 'NationalProviderID', 'WebPageUrl', 'AboutMeBlurb',
      'CanMessage', 'Specialty', 'Relation', 'DepartmentID', 'Organizations', 'IsExternal',
      'CareTeamStatus', 'CanHideProvider']) {
      expect(body.ProvidersList[0]).toHaveProperty(field)
    }
  })

  it('refuses a token-less POST, exactly as the /api/* routes do', async () => {
    const res = await session.makeRequest({
      path: '/Clinical/CareTeam/Load',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      followRedirects: false,
    })
    expect(res.status).toBe(302)
    expect(res.headers.get('location') ?? '').toContain('/Home/FiveHundred')
  })

  it('types the three non-string leaves the way both live instances do', async () => {
    const res = await session.makeRequest({
      path: '/Clinical/CareTeam/Load',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', '__RequestVerificationToken': 'tok-test' },
      body: '{}',
    })
    const body = await res.json() as { ProvidersList: Array<Record<string, unknown>> }
    const provider = body.ProvidersList[0]!
    expect(Array.isArray(provider.AboutMeBlurb)).toBe(true)
    expect(provider.Organizations).toBeNull()
    expect(provider.SchedulableVisitTypes).toBeNull()
    expect(typeof provider.CareTeamStatus).toBe('number')
  })

  it('serves the outside providers from LoadExternal in the same envelope', async () => {
    const res = await session.makeRequest({
      path: '/Clinical/CareTeam/LoadExternal',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', '__RequestVerificationToken': 'tok-test' },
      body: '{}',
    })
    const body = await res.json() as { ProvidersList: Array<{ Name: string }> }
    expect(body.ProvidersList.length).toBeGreaterThan(0)
    expect(body.ProvidersList[0]!.Name).not.toBe('')
  })

  it('a provider with no stated role sends Relation: null, and reads as no role', async () => {
    const res = await session.makeRequest({
      path: '/Clinical/CareTeam/Load',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', '__RequestVerificationToken': 'tok-test' },
      body: '{}',
    })
    const body = await res.json() as { ProvidersList: Array<{ Name: string; Relation: string | null }> }
    const roleless = body.ProvidersList.find(p => p.Relation === null)
    expect(roleless).toBeDefined()
    const team = await getCareTeam(session)
    expect(team.members.find(m => m.name === roleless!.Name)!.relation).toBe('')
  })

  it('the scraper reads both lists', async () => {
    const team = await getCareTeam(session)
    expect(team.externalProvidersUnavailable).toBe(false)
    expect(team.members.filter(m => !m.isExternal).length).toBeGreaterThan(0)
    expect(team.members.filter(m => m.isExternal).length).toBeGreaterThan(0)
    expect(team.members[0]!.relation).not.toBe('')
  })
})

describe('conformToShape fills the full real field set', () => {
  it('LoadAllergies carries the page-level fields real instances return', async () => {
    const res = await api('/api/allergies/LoadAllergies', {})
    const body = await res.json() as Record<string, unknown>
    for (const field of ['dateOfBirth', 'hasUpdateSecurity', 'hasStandAloneUpdateSecurity', 'showDxrRefreshBanner', 'showDxrBannerAction', 'preTextStringKey']) {
      expect(body).toHaveProperty(field)
    }
  })
})

describe('epicVersion knob', () => {
  afterAll(async () => { await setEpicVersion('November 2025') })

  it('keepalives: text/html; keepalive.asp answers "0" on November 2025 even when alive', async () => {
    const dotNet = await session.makeRequest({ path: '/Home/KeepAlive', followRedirects: false })
    expect(dotNet.headers.get('content-type') ?? '').toContain('text/html')
    expect((await dotNet.text()).trim()).toBe('1')
    const asp = await session.makeRequest({ path: '/keepalive.asp', followRedirects: false })
    expect((await asp.text()).trim()).toBe('0')

    await setEpicVersion('August 2025')
    const aspLegacy = await session.makeRequest({ path: '/keepalive.asp', followRedirects: false })
    expect((await aspLegacy.text()).trim()).toBe('1')
    await setEpicVersion('November 2025')
  })

  it('August 2025 answers unknown paths and token-less POSTs with a bare 500, no redirect', async () => {
    await setEpicVersion('August 2025')
    const unknown = await session.makeRequest({ path: '/api/this-endpoint-does-not-exist', followRedirects: false })
    expect(unknown.status).toBe(500)
    expect(unknown.headers.get('content-type') ?? '').toContain('text/html')

    const noToken = await session.makeRequest({
      path: '/api/test-results/GetList',
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ groupType: 0 }),
      followRedirects: false,
    })
    expect(noToken.status).toBe(500)
    await setEpicVersion('November 2025')
  })

  it('care team: August 2025 refuses a GET and a token-less POST with a bare 500', async () => {
    // The two live instances differ here and nowhere else: the November one
    // answers both with the FourOhFour/FiveHundred redirect dance (asserted
    // above), the August one with a bare 500. The PAYLOAD is identical on both
    // releases — no care-team field rides on the version, unlike test results.
    await setEpicVersion('August 2025')

    const get = await session.makeRequest({ path: '/Clinical/CareTeam/Load', followRedirects: false })
    expect(get.status).toBe(500)
    expect(get.headers.get('content-type') ?? '').toContain('text/html')

    const noToken = await session.makeRequest({
      path: '/Clinical/CareTeam/Load',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      followRedirects: false,
    })
    expect(noToken.status).toBe(500)

    const legacyTeam = await getCareTeam(session)
    await setEpicVersion('November 2025')
    const modernTeam = await getCareTeam(session)
    expect(legacyTeam).toEqual(modernTeam)
  })

  it('August 2025 drops the November-2025-only result fields', async () => {
    await setEpicVersion('August 2025')
    const res = await api('/api/test-results/GetDetails', { orderKey: 'GRP-LIPID', organizationID: '', PageNonce: '' })
    const body = await res.json() as { results: Array<Record<string, unknown>> }
    expect(body.results[0]).not.toHaveProperty('canGenerateLLMSummary')
    expect(body.results[0]).not.toHaveProperty('isBedsideTablet')

    await setEpicVersion('November 2025')
    const modern = await api('/api/test-results/GetDetails', { orderKey: 'GRP-LIPID', organizationID: '', PageNonce: '' })
    const modernBody = await modern.json() as { results: Array<Record<string, unknown>> }
    expect(modernBody.results[0]).toHaveProperty('canGenerateLLMSummary')
    expect(modernBody.results[0]).toHaveProperty('isBedsideTablet')
  })
})

/**
 * The two single-conversation read endpoints key the thread on `id`.
 *
 * `conversationId` — which the *mutating* endpoints (SendReply,
 * DeleteConversation) do take — is rejected, and on GetConversationMessages the
 * rejection is an opaque HTTP 500 carrying ASP.NET's generic body. That is
 * indistinguishable from a retired endpoint, which is exactly how the wrong
 * parameter name survived: the scraper sent `conversationId`, every instance
 * answered 500, and the endpoint looked dead.
 *
 * GetConversationDetails rejects the SAME inputs with 200 and a literal JSON
 * `null` instead — the shape GetVisitNotes and GetLetterDetails also use for
 * unknown ids. A client that checks only the status code reads that as a thread
 * with nothing in it. Verified identically on all four live instances.
 */
describe('the conversation-read endpoints that only accept `id`', () => {
  const PATHS = [
    '/api/conversations/GetConversationMessages',
    '/api/conversations/GetConversationDetails',
  ]

  /** How each endpoint says no. They do not agree, and that is the point. */
  async function expectRejection(path: string, res: Response) {
    if (path.endsWith('GetConversationMessages')) {
      expect(res.status).toBe(500)
      expect(await res.json()).toEqual({ Message: 'An error has occurred.' })
    } else {
      expect(res.status).toBe(200)
      expect(await res.json()).toBeNull()
    }
  }

  for (const path of PATHS) {
    it(`${path} answers a real id with the thread`, async () => {
      const res = await api(path, { id: 'CONV-001', PageNonce: '' })
      expect(res.status).toBe(200)
      const body = await res.json() as { hthId: string; messages: unknown[] }
      expect(body.hthId).toBe('CONV-001')
      expect(body.messages.length).toBeGreaterThan(0)
    })

    it(`${path} rejects \`conversationId\`, never treating it as an empty thread`, async () => {
      await expectRejection(path, await api(path, { conversationId: 'CONV-001', PageNonce: '' }))
    })

    it(`${path} rejects an unknown id the same way`, async () => {
      await expectRejection(path, await api(path, { id: 'CONV-NOPE', PageNonce: '' }))
    })
  }

  it('pages GetConversationMessages backwards from an exclusive startInstantISO', async () => {
    const all = await api('/api/conversations/GetConversationMessages', { id: 'CONV-003', maxReadMessages: 100, PageNonce: '' })
    const { messages } = await all.json() as { messages: { wmgId: string; deliveryInstantISO: string }[] }
    expect(messages).toHaveLength(8)

    // No startInstantISO means "now": the newest page, and more behind it.
    const newest = await api('/api/conversations/GetConversationMessages', { id: 'CONV-003', PageNonce: '' })
    const newestBody = await newest.json() as { messages: { wmgId: string }[]; hasMoreMessages: boolean }
    expect(newestBody.messages.map(m => m.wmgId)).toEqual(messages.slice(3).map(m => m.wmgId))
    expect(newestBody.hasMoreMessages).toBe(true)

    // Strictly older than the oldest of that page, and nothing left behind it.
    const older = await api('/api/conversations/GetConversationMessages', {
      id: 'CONV-003', startInstantISO: messages[3]!.deliveryInstantISO, PageNonce: '',
    })
    const olderBody = await older.json() as { messages: { wmgId: string }[]; hasMoreMessages: boolean }
    expect(olderBody.messages.map(m => m.wmgId)).toEqual(messages.slice(0, 3).map(m => m.wmgId))
    expect(olderBody.hasMoreMessages).toBe(false)
  })

  it('leaves author.displayName empty, so names only resolve through the users/viewers maps', async () => {
    const res = await api('/api/conversations/GetConversationDetails', { id: 'CONV-003', PageNonce: '' })
    const body = await res.json() as {
      messages: { author: { displayName: string; empKey?: string; wprKey?: string } }[]
      users: Record<string, { name: string }>
      viewers: Record<string, { name: string }>
      userOverrideNames: Record<string, string>
    }
    expect(body.messages.every(m => m.author.displayName === '')).toBe(true)
    for (const { author } of body.messages) {
      const name = author.wprKey
        ? body.viewers[author.wprKey]?.name
        : body.userOverrideNames[author.empKey!] || body.users[author.empKey!]?.name
      expect(name).toBeTruthy()
    }
  })
})

/**
 * The send endpoint SWALLOWS a message body over 500 characters — 200, an empty
 * conversation id, nothing filed. Wire shape and why it matters:
 * `fake-mychart/README.md`, "Response Shapes and Error Behavior".
 *
 * `sendNewMessage` defends on both sides: it refuses an over-limit body before the server
 * can swallow it, and treats a 200 without a usable id as indeterminate rather than
 * success. Only the first is reachable over real HTTP — against a faithful server the guard
 * always fires first, which is the point — so the indeterminate branch stays covered by
 * `sendMessage.unit.test.ts`.
 */
describe('the over-limit message body that the send endpoint drops silently', () => {
  const SEND_PATH = '/api/medicaladvicerequests/SendMedicalAdviceRequest'

  let recipient: MessageRecipient
  let topic: MessageTopic

  beforeAll(async () => {
    const token = await getVerificationToken(session)
    if (!token) throw new Error('no verification token')
    const [recipients, topics] = await Promise.all([
      getMessageRecipients(session, token),
      getMessageTopics(session, token),
    ])
    if (!recipients[0] || !topics[0]) throw new Error('fake-mychart served no recipients/topics')
    recipient = recipients[0]
    topic = topics[0]
  })

  async function conversationCount(): Promise<number> {
    const list = await listConversations(session)
    return list?.conversations?.length ?? 0
  }

  /** The scraper's own payload, so the raw-endpoint tests post what the client really posts. */
  function payload(messageBody: string): Record<string, unknown> {
    return buildSendPayload(
      { recipient, topic, subject: 'Over-limit body test', messageBody },
      { wprId: 'WPR-HOMER', composeId: 'COMPOSE-TEST' },
    )
  }

  it('501 characters: HTTP 200, an empty conversation id, and nothing filed', async () => {
    const before = await conversationCount()
    const res = await api(SEND_PATH, payload('x'.repeat(501)))
    expect(res.status).toBe(200)
    // A JSON empty string, not an error body and not an error status.
    expect(await res.text()).toBe('""')
    expect(await conversationCount()).toBe(before)
  }, 30_000)

  it('500 characters: a real conversation id, and the message is filed', async () => {
    const before = await conversationCount()
    const res = await api(SEND_PATH, payload('y'.repeat(500)))
    expect(res.status).toBe(200)
    const conversationId = await res.json() as string
    expect(conversationId.length).toBeGreaterThan(0)
    expect(await conversationCount()).toBe(before + 1)
  }, 30_000)

  it('sendNewMessage refuses an over-limit body instead of losing it', async () => {
    const before = await conversationCount()

    const result = await sendNewMessage(session, {
      recipient,
      topic,
      subject: 'Over-limit body test',
      messageBody: 'z'.repeat(501),
    })

    expect(result.success).toBe(false)
    expect(result.conversationId).toBeUndefined()
    expect(result.error).toContain('501')
    // The whole point: the server never got the chance to swallow it.
    expect(await conversationCount()).toBe(before)
  }, 30_000)

  it('sendNewMessage still sends a body right at the limit', async () => {
    const body = 'w'.repeat(500)
    const before = await conversationCount()

    const result = await sendNewMessage(session, {
      recipient,
      topic,
      subject: 'At-limit body test',
      messageBody: body,
    })

    expect(result.error).toBeUndefined()
    expect(result.success).toBe(true)
    expect(result.conversationId?.length ?? 0).toBeGreaterThan(0)

    const list = await listConversations(session)
    expect(list?.conversations?.length ?? 0).toBe(before + 1)
    const filed = list?.conversations?.find((c) => c.hthId === result.conversationId)
    expect(filed?.messages?.[0]?.body).toBe(body)
  }, 30_000)
})
