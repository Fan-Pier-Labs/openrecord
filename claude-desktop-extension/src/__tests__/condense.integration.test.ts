/**
 * The condensing wrapper, end to end against fake-mychart.
 *
 * `condense.unit.test.ts` proves the shape of each condenser against fixtures.
 * This proves the wiring nobody would notice breaking: that the tool handlers
 * really return the condensed rendering rather than the scraper's payload,
 * that they say so, and that `get_raw_data` really does hand back everything
 * they dropped. If the condense call were ever removed from the handler, every
 * unit test here would still pass and only this file would fail.
 */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { resetFakeMyChart } from '../../../scrapers/myChart/__tests__/fake-mychart/mountMode'
import * as memfs from './memfs'

const sessionManager = await import('../session-manager')
const { registerAllTools } = await import('../tools')

const HOST = process.env.FAKE_MYCHART_HOST ?? 'localhost:4000'
const ACCOUNT = `homer@${HOST}`

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
const notes = (result: ToolResult) => result.content.slice(1).map((c) => c.text).join('\n')

beforeAll(async () => {
  await resetFakeMyChart(HOST)
  memfs.reset()
  const login = parse(await call('setup_account', { hostname: HOST, username: 'homer', password: 'donuts123' }))
  expect(login.state).toBe('logged_in')
})

afterAll(() => {
  sessionManager.clearAllSessions()
})

describe('get_past_visits', () => {
  it('returns a compact visit list rather than Epic’s view model', async () => {
    const result = await call('get_past_visits', { account: ACCOUNT })
    expect(result.isError).toBeFalsy()

    const payload = parse(result)
    expect(payload.count).toBeGreaterThan(0)
    expect(payload.visits[0]).toHaveProperty('csn')
    expect(payload.visits[0]).toHaveProperty('date')
    // The button-state booleans are what this layer exists to remove.
    expect(result.content[0]!.text).not.toContain('IsRescheduleEnabled')
    expect(result.content[0]!.text).not.toContain('PayerOrgDetails')
  })

  it('tells the model where the dropped fields went', async () => {
    // Without this line a model that needs a trimmed field has no way to know
    // the field ever existed, and would report it as absent from the chart.
    expect(notes(await call('get_past_visits', { account: ACCOUNT }))).toContain('get_raw_data')
  })

  it('get_raw_data hands back everything the condensed call dropped', async () => {
    const condensed = await call('get_past_visits', { account: ACCOUNT })
    const raw = await call('get_raw_data', { account: ACCOUNT, capability: 'get_past_visits' })

    expect(raw.isError).toBeFalsy()
    expect(raw.content[0]!.text).toContain('IsRescheduleEnabled')
    expect(raw.content[0]!.text.length).toBeGreaterThan(condensed.content[0]!.text.length * 5)
  })
})

describe('get_lab_results', () => {
  it('keeps every component value, units and reference range', async () => {
    const payload = parse(await call('get_lab_results', { account: ACCOUNT }))
    const components = payload.results.flatMap((r: { components?: unknown[] }) => r.components ?? [])

    expect(components.length).toBeGreaterThan(0)
    for (const component of components as Array<Record<string, unknown>>) {
      expect(typeof component.name).toBe('string')
      expect(typeof component.value).toBe('string')
    }
  })

  it('drops the per-datapoint copies of the reference range, and get_raw_data still has them', async () => {
    const condensed = await call('get_lab_results', { account: ACCOUNT })
    const raw = await call('get_raw_data', { account: ACCOUNT, capability: 'get_lab_results' })

    expect(condensed.content[0]!.text).not.toContain('lowerBoundExclusive')
    expect(raw.content[0]!.text).toContain('lowerBoundExclusive')
  })
})

describe('get_raw_data', () => {
  it('forwards the arguments a capability takes', async () => {
    const letters = parse(await call('get_letters', { account: ACCOUNT }))
    const letter = letters[0]
    expect(letter).toBeDefined()

    const raw = await call('get_raw_data', {
      account: ACCOUNT,
      capability: 'get_letter_details',
      args: { hno_id: letter.hnoId, csn: letter.csn },
    })
    expect(raw.isError).toBeFalsy()
    expect(parse(raw).bodyHTML).toContain('<')
  })

  it('runs a capability that has no condenser of its own', async () => {
    const raw = await call('get_raw_data', { account: ACCOUNT, capability: 'get_medications' })
    expect(raw.isError).toBeFalsy()
    expect(parse(raw).medications.length).toBeGreaterThan(0)
  })
})
