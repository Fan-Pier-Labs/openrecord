// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * connect_google_calendar sets nothing up until Claude has told the user what
 * setup involves and the user has agreed. The installer is stubbed, so no
 * binary, browser or launchd job is touched.
 */
import { beforeEach, describe, expect, it, mock } from 'bun:test'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import * as memfs from './memfs'

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

const store = await import('../credential-store')
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
  memfs.reset()
  store.upsertAccount({ hostname: 'mychart.example.org', username: 'homer', password: 'x' })
  store.upsertAccount({ hostname: 'other.example.org', username: 'marge', password: 'y' })
  connects = 0
  unsupported = null
})

describe('connect_google_calendar', () => {
  it('gives Claude the exact question to ask, naming every account, and sets nothing up', async () => {
    const reply = JSON.parse(await text({})) as { state: string; message_for_user: string; message: string }
    expect(reply.state).toBe('needs_confirmation')
    expect(reply.message_for_user).toStartWith('Want to install the OpenRecord Google Calendar Sync applet?\n\n')
    expect(reply.message_for_user).toContain('connected MyChart accounts (homer@mychart.example.org, marge@other.example.org)')
    expect(reply.message_for_user).toContain('with all of their details including the reason for each visit')
    expect(reply.message).toContain('exactly as written')
    expect(reply.message).toContain('confirmed_with_user: true')
    expect(connects).toBe(0)
  })

  it('asks for a MyChart account first when none is connected', async () => {
    memfs.reset()
    expect(JSON.parse(await text({}))).toMatchObject({ state: 'no_accounts' })
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
