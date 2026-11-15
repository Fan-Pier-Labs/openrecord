// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * connect_google_calendar sets nothing up until Claude has told the user what
 * setup involves and the user has agreed. The installer is stubbed, so no
 * binary, browser or launchd job is touched.
 */
import { beforeEach, describe, expect, it, mock } from 'bun:test'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import * as memfs from '../../../shared/mcp-server/__tests__/memfs'

let connects = 0
let uninstalls = 0
let unsupported: string | null = null
let syncAccounts: Array<{ account: string; error?: string }> = []
let uninstallError: Error | null = null
const applet = await import('../google-calendar/applet')
void mock.module('../google-calendar/applet', () => ({
  ...applet,
  unsupportedReason: () => unsupported,
  calendarSyncStatus: () => 'off',
  connectGoogleCalendar: () => {
    connects++
    return Promise.resolve({ sync: { ok: true, synced: 2, accounts: syncAccounts } })
  },
  uninstallGoogleCalendar: () => {
    uninstalls++
    return uninstallError ? Promise.reject(uninstallError) : Promise.resolve()
  },
}))

const store = await import('../../../shared/mcp-server/credential-store')
const { registerAllTools } = await import('../../../shared/mcp-server/tools')
const { MCPB_HOST } = await import('../host')

type Handler = (args: Record<string, unknown>) => Promise<{ content: Array<{ text: string }>; isError?: boolean }>
const tools = new Map<string, Handler>()
registerAllTools({
  registerTool: (name: string, _config: unknown, handler: Handler) => {
    tools.set(name, handler)
  },
} as unknown as McpServer, MCPB_HOST)

const call = (name: string, args: Record<string, unknown> = {}) => tools.get(name)!(args)
const text = async (args: Record<string, unknown>) => (await call('connect_google_calendar', args)).content[0]!.text

beforeEach(() => {
  memfs.reset()
  store.upsertAccount({ hostname: 'mychart.example.org', username: 'homer', password: 'x' })
  store.upsertAccount({ hostname: 'other.example.org', username: 'marge', password: 'y' })
  connects = 0
  uninstalls = 0
  unsupported = null
  syncAccounts = []
  uninstallError = null
})

describe('connect_google_calendar', () => {
  it('gives Claude the exact question to ask, naming every account, and sets nothing up', async () => {
    const reply = JSON.parse(await text({})) as { state: string; message_for_user: string; message: string }
    expect(reply.state).toBe('needs_confirmation')
    expect(reply.message_for_user).toStartWith('Want to install the OpenRecord Google Calendar Sync applet?\n\n')
    expect(reply.message_for_user).toContain('connected MyChart accounts (homer@mychart.example.org, marge@other.example.org)')
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

  it('names the accounts the first sync could not reach', async () => {
    syncAccounts = [{ account: 'homer@mychart.example.org' }, { account: 'marge@other.example.org', error: 'signed out' }]
    const reply = JSON.parse(await text({ confirmed_with_user: true })) as { message: string }
    expect(reply.message).toContain('could not be synced yet: marge@other.example.org (signed out)')
  })
})

describe('disconnect_google_calendar', () => {
  it('turns sync off and says what stays behind', async () => {
    const reply = JSON.parse((await call('disconnect_google_calendar')).content[0]!.text) as { state: string; message: string }
    expect(reply.state).toBe('disconnected')
    expect(reply.message).toContain('"MyChart Appointments" calendar')
    expect(uninstalls).toBe(1)
  })

  it('reports a failed uninstall as a tool error', async () => {
    uninstallError = new Error('launchctl refused')
    const result = await call('disconnect_google_calendar')
    expect(result.isError).toBe(true)
    expect(result.content[0]!.text).toContain('launchctl refused')
  })
})

describe('the extension host', () => {
  it('adds calendar sync status to list_accounts', async () => {
    const reply = JSON.parse((await call('list_accounts')).content[0]!.text) as Record<string, unknown>
    expect(reply).toMatchObject({ count: 2, calendarSync: 'off' })
  })
})
