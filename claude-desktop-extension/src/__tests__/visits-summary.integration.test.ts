/**
 * End-to-end proof that the visits tools condense by default and hand back the
 * untouched payload on request, driven through the extension's real tool
 * handlers against fake-mychart.
 *
 * The projection's own edge cases are covered in
 * shared/__tests__/summaries.unit.test.ts; what only a live round trip can
 * show is that the condensed payload survives the actual scrape — MyChart
 * spreads a visit's date, type, provider and department across fields the fake
 * only populates correctly because it conforms every response to a captured
 * skeleton. A projection that reads the wrong field name looks identical to an
 * empty chart.
 *
 * `./memfs` intercepts every path under ~/.openrecord-mcpb, so the real
 * credential store on this machine is never touched.
 */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { resetFakeMyChart } from '../../../scrapers/myChart/__tests__/fake-mychart/mountMode'
import type { PastVisitsSummary, UpcomingVisitsSummary } from '../../../shared/summaries'
import * as memfs from './memfs'

const sessionManager = await import('../session-manager')
const { registerAllTools } = await import('../tools')

const HOST = process.env.FAKE_MYCHART_HOST ?? 'localhost:4000'

interface ToolResult {
  content: Array<{ type: string; text: string }>
  isError?: boolean
}
type Handler = (args: Record<string, unknown>) => Promise<ToolResult>

function captureTools(): Map<string, Handler> {
  const tools = new Map<string, Handler>()
  const server = {
    registerTool: (name: string, _config: unknown, handler: Handler) => {
      tools.set(name, handler)
    },
  } as unknown as McpServer
  registerAllTools(server)
  return tools
}

const tools = captureTools()
const call = async (name: string, args: Record<string, unknown> = {}) => {
  const handler = tools.get(name)
  if (!handler) throw new Error(`tool ${name} is not registered`)
  return handler(args)
}
const parse = (result: ToolResult) => JSON.parse(result.content[0]!.text)

const account = `homer@${HOST}`

beforeAll(async () => {
  await resetFakeMyChart(HOST)
  memfs.reset()
  const setup = parse(await call('setup_account', { hostname: HOST, username: 'homer', password: 'donuts123' }))
  expect(setup.state).toBe('logged_in')
})

afterAll(() => {
  sessionManager.clearAllSessions()
})

describe('get_past_visits', () => {
  it('returns a flat, newest-first list with every load-bearing field populated', async () => {
    const result = await call('get_past_visits', { account, years_back: 5 })
    const summary = parse(result) as PastVisitsSummary

    // Homer's fixture is 22 visits across 3 pages of MyChart's LoadPast.
    expect(summary.count).toBe(22)
    expect(summary.visits.length).toBe(22)

    // Flat: no per-organization nesting to walk. Newest first.
    const dates = summary.visits.map((v) => Date.parse(v.date))
    expect(dates).toEqual([...dates].sort((a, b) => b - a))

    // Every visit must carry the four fields a model reasons over plus the CSN
    // that get_visit_notes / get_visit_avs take. A blank one here means the
    // projection is reading a field name real MyChart doesn't use.
    for (const v of summary.visits) {
      expect(v.date, v.csn).toBeTruthy()
      expect(v.type, v.csn).toBeTruthy()
      expect(v.provider, v.csn).toBeTruthy()
      expect(v.location, v.csn).toBeTruthy()
      expect(v.csn, v.type).toBeTruthy()
    }

    const ed = summary.visits.find((v) => v.csn === 'CSN-HOMER-003')!
    expect(ed.type).toBe('ER Visit - Donut Incident')
    expect(ed.provider).toBe('Nick Riviera, MD')
    expect(ed.location).toContain('Springfield General Hospital ER')
    expect(ed.chief_complaint).toBeTruthy()
    expect(ed.diagnoses?.length).toBeGreaterThan(0)

    // Single-org account: the organization is the same on every row, so it is
    // not repeated 22 times.
    expect(summary.visits.every((v) => v.organization === undefined)).toBe(true)
  })

  it('is an order of magnitude smaller than the raw payload it replaces', async () => {
    const condensed = await call('get_past_visits', { account, years_back: 5 })
    const raw = await call('get_past_visits', { account, years_back: 5, full_detail: true })

    const condensedSize = condensed.content[0]!.text.length
    const rawSize = raw.content[0]!.text.length

    // The raw payload is what overflowed the context window and had to be read
    // off disk instead.
    expect(rawSize).toBeGreaterThan(150_000)
    expect(condensedSize).toBeLessThan(rawSize / 10)
  })

  it('full_detail: true returns MyChart\'s payload untouched', async () => {
    const raw = parse(await call('get_past_visits', { account, years_back: 5, full_detail: true }))

    // The original nesting, all of it: ViewBagProperties / SerializedIndex /
    // List keyed by organization id.
    expect(raw.ViewBagProperties).toBeDefined()
    expect(Object.keys(raw.List)).toEqual(['ORG-SPRINGFIELD'])
    const visits = raw.List['ORG-SPRINGFIELD'].List
    expect(visits.length).toBe(22)
    expect(Object.keys(visits[0]).length).toBeGreaterThan(150)
  })
})

describe('get_upcoming_visits', () => {
  it('condenses each bucket while keeping them apart', async () => {
    const summary = parse(await call('get_upcoming_visits', { account })) as UpcomingVisitsSummary

    expect(summary.later.length).toBe(1)
    expect(summary.in_progress).toEqual([])
    expect(summary.next_days).toEqual([])
    expect(summary.count).toBe(1)

    const appointment = summary.later[0]!
    expect(appointment.csn).toBe('CSN-HOMER-001')
    expect(appointment.type).toBe('Annual Physical')
    expect(appointment.provider).toBe('Julius Hibbert, MD')
    expect(appointment.location).toContain('Springfield General Hospital')
  })

  it('full_detail: true keeps the raw bucket names and every field', async () => {
    const raw = parse(await call('get_upcoming_visits', { account, full_detail: true }))
    expect(raw.LaterVisitsList.length).toBe(1)
    // LoadUpcoming's visit object is a little narrower than LoadPast's, but
    // still two orders of magnitude more fields than the summary keeps.
    expect(Object.keys(raw.LaterVisitsList[0]).length).toBeGreaterThan(120)
  })
})
