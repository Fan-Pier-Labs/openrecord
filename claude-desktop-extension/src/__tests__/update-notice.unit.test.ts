// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { afterEach, describe, expect, it } from 'bun:test'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { setTestTransport } from '../../../scrapers/http'
import { startUpdateCheck, withUpdateNotice } from '../update-notice'
import { registerAllTools } from '../tools'

interface ToolResult {
  content: Array<{ type: string; text: string }>
}

function manifest(mcpb: string) {
  return {
    versions: { scrapers: '1.0.0', cli: '2.0.0', mcpb, app: '1.0.0' },
    updateUrls: {
      scrapers: 'https://example.test/scrapers',
      cli: 'https://example.test/cli',
      mcpb: 'https://example.test/mcpb',
      app: 'https://example.test/app',
    },
  }
}

function serve(body: unknown, status = 200) {
  setTestTransport(() => Promise.resolve(new Response(JSON.stringify(body), { status })))
}

const RESULT = { content: [{ type: 'text', text: '{"ok":true}' }] }

afterEach(async () => {
  // Leave the module with no notice for whichever test runs next.
  serve(manifest('2.0.0'))
  await startUpdateCheck('2.0.0')
  setTestTransport(null)
})

describe('update notice', () => {
  it('adds nothing before any check has answered, or when up to date', async () => {
    expect(withUpdateNotice(RESULT)).toBe(RESULT)
    serve(manifest('2.0.0'))
    await startUpdateCheck('2.0.0')
    expect(withUpdateNotice(RESULT)).toBe(RESULT)
  })

  it('appends one line naming both versions and the download when behind', async () => {
    serve(manifest('2.1.0'))
    await startUpdateCheck('2.0.0')
    const result = withUpdateNotice(RESULT)
    expect(result.content).toHaveLength(2)
    expect(result.content[0]).toEqual(RESULT.content[0])
    expect(result.content[1]!.text).toContain('v2.0.0 → v2.1.0 — https://example.test/mcpb')
  })

  it('keeps the last answer when a later check cannot reach the site', async () => {
    serve(manifest('2.1.0'))
    await startUpdateCheck('2.0.0')
    serve('Not Found', 404)
    await startUpdateCheck('2.0.0')
    expect(withUpdateNotice(RESULT).content).toHaveLength(2)
  })

  it('still checks when telemetry is opted out', async () => {
    process.env.MYCHART_CLI_TELEMETRY_DISABLED = '1'
    try {
      serve(manifest('2.1.0'))
      await startUpdateCheck('2.0.0')
      expect(withUpdateNotice(RESULT).content).toHaveLength(2)
    } finally {
      delete process.env.MYCHART_CLI_TELEMETRY_DISABLED
    }
  })

  it('reaches every registered tool, check_pending_call included', async () => {
    const handlers = new Map<string, (args: Record<string, unknown>) => Promise<ToolResult>>()
    registerAllTools({
      registerTool: (name: string, _config: unknown, handler: (args: Record<string, unknown>) => Promise<ToolResult>) => {
        handlers.set(name, handler)
      },
    } as unknown as McpServer)

    serve(manifest('2.1.0'))
    await startUpdateCheck('2.0.0')
    const result = await handlers.get('check_pending_call')!({})
    expect(result.content.at(-1)!.text).toContain('Update available: v2.0.0 → v2.1.0')
  })
})
