// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * set_telemetry, called through the wrapper that reports every tool call — so
 * what is asserted is what a user gets: once it is off nothing is posted, the
 * opt-out call included.
 */
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import * as memfs from '../../../shared/mcp-server/__tests__/memfs'

const { registerAllTools } = await import('../../../shared/mcp-server/tools')
const { MCPB_HOST } = await import('../host')

type Handler = (args: Record<string, unknown>) => Promise<{ content: Array<{ text: string }>; isError?: boolean }>
const tools = new Map<string, Handler>()
registerAllTools({
  registerTool: (name: string, _config: unknown, handler: Handler) => {
    tools.set(name, handler)
  },
} as unknown as McpServer, MCPB_HOST)

const call = (name: string, args: Record<string, unknown>) => tools.get(name)!(args)
const setTelemetry = async (enabled: boolean) =>
  JSON.parse((await call('set_telemetry', { enabled })).content[0]!.text) as { telemetry: string; message: string }
/** Any reported tool call will do: this one answers "no saved account" without touching the network. */
const anotherCall = () => call('disconnect_account', { account: 'homer@mychart.example.org' })

const envKeys = ['MYCHART_CLI_TELEMETRY_DISABLED', 'OPENRECORD_ANALYTICS_DISABLED', 'OPENRECORD_ANALYTICS_ENDPOINT', 'NODE_ENV'] as const
let saved: Record<string, string | undefined>
let originalFetch: typeof fetch
let fetchMock: ReturnType<typeof mock>

beforeEach(() => {
  memfs.reset()
  saved = Object.fromEntries(envKeys.map((k) => [k, process.env[k]]))
  for (const k of envKeys) delete process.env[k]
  // Telemetry is off under `bun test`'s NODE_ENV=test; fetch is mocked below.
  process.env.NODE_ENV = 'development'
  originalFetch = globalThis.fetch
  fetchMock = mock((_url: string, _init?: RequestInit) => Promise.resolve(new Response('{}', { status: 200 })))
  globalThis.fetch = fetchMock as unknown as typeof fetch
})

afterEach(() => {
  globalThis.fetch = originalFetch
  for (const k of envKeys) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]!
  }
})

/** The tools reported to the analytics Lambda, once `count` events have gone out. */
async function reportedTools(count: number): Promise<unknown[]> {
  const posted = () =>
    fetchMock.mock.calls
      .filter((c) => String(c[0]).includes('execute-api'))
      .map((c) => (JSON.parse((c[1] as RequestInit).body as string) as { properties: { tool: unknown } }).properties.tool)
  for (let i = 0; i < 200 && posted().length < count; i++) await new Promise<void>((r) => { setTimeout(r, 0) })
  return posted()
}

/** Give a stray event every chance to go out before asserting it didn't. */
async function settle(): Promise<void> {
  for (let i = 0; i < 50; i++) await new Promise<void>((r) => { setTimeout(r, 0) })
}

describe('set_telemetry', () => {
  it('reports tool calls until it is turned off', async () => {
    await anotherCall()
    expect(await reportedTools(1)).toEqual(['disconnect_account'])
  })

  it('turned off, saves the choice and posts nothing — not for that call, nor any after it', async () => {
    const reply = await setTelemetry(false)
    expect(reply.telemetry).toBe('off')
    expect(reply.message).toContain('enabled: true')
    expect(JSON.parse(memfs.read(memfs.TELEMETRY_CONFIG)!)).toEqual({ telemetryDisabled: true })

    await anotherCall()
    await settle()
    expect(fetchMock.mock.calls).toHaveLength(0)
  })

  it('turned back on, reports again, starting with that call', async () => {
    await setTelemetry(false)
    expect((await setTelemetry(true)).telemetry).toBe('on')
    await anotherCall()
    expect(await reportedTools(2)).toEqual(['set_telemetry', 'disconnect_account'])
  })
})
