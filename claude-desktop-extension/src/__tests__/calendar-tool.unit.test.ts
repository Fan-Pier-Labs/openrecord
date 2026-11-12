// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * connect_google_calendar sets nothing up until Claude has told the user what
 * setup involves and the user has agreed. The installer is stubbed, so no
 * binary, browser or launchd job is touched.
 */
import { beforeEach, describe, expect, it, mock } from 'bun:test'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import './memfs'

let connects = 0
let unsupported: string | null = null
const applet = await import('../google-calendar/applet')
void mock.module('../google-calendar/applet', () => ({
  ...applet,
  unsupportedReason: () => unsupported,
  connectGoogleCalendar: () => {
    connects++
    return Promise.resolve({ sync: { ok: true, synced: 2, accounts: [] } })
  },
}))

const { registerAllTools } = await import('../tools')

type Handler = (args: Record<string, unknown>) => Promise<{ content: Array<{ text: string }>; isError?: boolean }>
let connect: Handler = () => Promise.reject(new Error('not registered'))
registerAllTools({
  registerTool: (name: string, _config: unknown, handler: Handler) => {
    if (name === 'connect_google_calendar') connect = handler
  },
} as unknown as McpServer)

const text = async (args: Record<string, unknown>) => (await connect(args)).content[0]!.text

beforeEach(() => {
  connects = 0
  unsupported = null
})

describe('connect_google_calendar', () => {
  it('explains what setup involves and sets nothing up until the user confirms', async () => {
    const reply = JSON.parse(await text({})) as { state: string; message: string }
    expect(reply.state).toBe('needs_confirmation')
    for (const point of ['every 4 hours', 'menu-bar app', 'asking you, Claude', 'Google sign-in', 'Always Allow', 'confirmed_with_user: true']) {
      expect(reply.message).toContain(point)
    }
    expect(connects).toBe(0)
  })

  it('sets up once the user has confirmed', async () => {
    const reply = JSON.parse(await text({ confirmed_with_user: true })) as { state: string; synced: number }
    expect(reply).toMatchObject({ state: 'connected', synced: 2 })
    expect(connects).toBe(1)
  })

  it('says it cannot run here before asking the user anything', async () => {
    unsupported = 'Google Calendar sync needs macOS: it runs from a menu-bar app.'
    expect(await text({})).toContain('needs macOS')
    expect(connects).toBe(0)
  })
})
