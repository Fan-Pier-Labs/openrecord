// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * A login saved in two browsers with different passwords is offered once, and
 * connecting it tries each password until MyChart accepts one. Driven through
 * the real tool handlers against fake-mychart; only the browser scan is faked.
 */
import { describe, it, expect, beforeAll, afterAll, mock } from 'bun:test'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { resetFakeMyChart } from '../../../scrapers/myChart/__tests__/fake-mychart/mountMode'
import * as memfs from './memfs'

const HOST = process.env.FAKE_MYCHART_HOST ?? 'localhost:4000'

const saved = (key: string, pass: string, source: string) => ({
  key,
  url: `http://${HOST}/MyChart/`,
  hostname: HOST,
  user: 'homer',
  pass,
  success: true,
  source,
  confidence: 'probed' as const,
})

// The stale password comes first, so a pass proves the second one was tried.
void mock.module('../../../read-local-passwords/index', () => ({
  isSupportedPlatform: () => true,
  findMyChartCandidates: async () => [saved('stale1111', 'not-the-password', 'Chrome'), saved('fresh2222', 'donuts123', 'Firefox')],
  blockedBrowsers: () => [],
}))

const store = await import('../credential-store')
const sessionManager = await import('../session-manager')
const { registerAllTools } = await import('../tools')

interface ToolResult {
  content: Array<{ type: string; text: string }>
  isError?: boolean
}
type Handler = (args: Record<string, unknown>) => Promise<ToolResult>

const tools = new Map<string, Handler>()
registerAllTools({
  registerTool: (name: string, _config: unknown, handler: Handler) => {
    tools.set(name, handler)
  },
} as unknown as McpServer)
const call = async (name: string, args: Record<string, unknown> = {}) => JSON.parse((await tools.get(name)!(args)).content[0]!.text)

beforeAll(async () => {
  // Connecting saves a password; it must land in the test file store, never the OS keystore.
  if (store.secretBackend() !== 'file') throw new Error('secrets are not pinned to the test file store — see ./memfs')
  await resetFakeMyChart(HOST)
  memfs.reset()
})

afterAll(() => {
  sessionManager.clearAllSessions()
})

describe('a login saved in two browsers', () => {
  it('is offered once and connects with whichever password MyChart accepts', async () => {
    const scan = await call('import_browser_passwords')
    expect(scan.accounts).toHaveLength(1)
    expect(scan.accounts[0].source).toBe('Chrome and Firefox')

    const result = await call('connect_imported_account', { import_id: scan.accounts[0].import_id })
    expect(result.state).toBe('logged_in')
    expect(store.readAccounts().map(store.accountId)).toEqual([`homer@${HOST}`])
  })
})
