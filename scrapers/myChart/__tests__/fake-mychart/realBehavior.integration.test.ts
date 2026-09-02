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
