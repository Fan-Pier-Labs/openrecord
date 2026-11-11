// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * The extension's two login modes, end to end through its real tool handlers
 * against fake-mychart. marge is seeded to hit 2FA on every password login and
 * has no TOTP secret saved here, so every sign-in she needs is a choice
 * between sending a code and not.
 *
 * - A data tool call is human-triggered: it may send ONE code and must hand
 *   back a pending_id that complete_2fa finishes. A repeat call reuses it.
 * - Renewal mid-request and background work are machine mode: they never send
 *   a code. A failed renewal drops the session so the next call signs in as
 *   human.
 *
 * Codes are read from fake-mychart's outbox, where every SendCode delivers a
 * fresh one, so "how many codes went out" is the server's own count, and
 * complete_2fa gets the code the patient would have read off their phone.
 * `./memfs` keeps credentials off the real keystore (see
 * multi-account.integration.test.ts for why that guard matters).
 */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { resetFakeMyChart } from '../../../scrapers/myChart/__tests__/fake-mychart/mountMode'
import { readOutbox } from '../../../scrapers/myChart/__tests__/fake-mychart/outbox'
import * as memfs from './memfs'

const store = await import('../credential-store')
const sessionManager = await import('../session-manager')
const { registerAllTools } = await import('../tools')

const HOST = process.env.FAKE_MYCHART_HOST ?? 'localhost:4000'
const MARGE = `marge@${HOST}`

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

const call = (name: string, args: Record<string, unknown> = {}) => tools.get(name)!(args)
const parse = (result: ToolResult) => JSON.parse(result.content[0]!.text)

const codesSent = async () => (await readOutbox(HOST, 'marge')).length
const latestCode = async () => (await readOutbox(HOST, 'marge')).at(-1)!.code

beforeAll(async () => {
  if (store.secretBackend() !== 'file') {
    throw new Error('secrets would go to the OS keystore, not the test file store. Check the pin in ./memfs.')
  }
  process.env.MYCHART_CLI_TELEMETRY_DISABLED = '1'
  await resetFakeMyChart(HOST)
  memfs.reset()
  store.upsertAccount({ hostname: HOST, username: 'marge', password: 'donuts123' })
})

afterAll(() => {
  sessionManager.clearAllSessions()
})

describe('a data tool call (human-triggered)', () => {
  let pendingId = ''

  it('sends one code and returns need_2fa with a pending_id', async () => {
    const result = parse(await call('get_profile', { account: MARGE, mode: 'json' }))
    expect(result.state).toBe('need_2fa')
    expect(result.pending_id).toBeString()
    expect(result.message).toContain('complete_2fa')
    expect(await codesSent()).toBe(1)
    pendingId = result.pending_id
  }, 60_000)

  it('hands back the same pending_id on a repeat call, sending nothing', async () => {
    const result = parse(await call('get_profile', { account: MARGE, mode: 'json' }))
    expect(result.pending_id).toBe(pendingId)
    expect(await codesSent()).toBe(1)
  })

  it('finishes with complete_2fa, after which the tool reads the chart', async () => {
    const done = parse(await call('complete_2fa', { pending_id: pendingId, code: await latestCode() }))
    expect(done.state).toBe('logged_in')

    const profile = parse(await call('get_profile', { account: MARGE, mode: 'json' }))
    expect(JSON.stringify(profile)).toContain('Marge')
    expect(await codesSent()).toBe(1)
  }, 60_000)
})

describe('work nobody is waiting on (machine mode)', () => {
  it('a background resolve refuses with NeedsHumanSignInError and sends nothing', async () => {
    sessionManager.clearSession(MARGE)
    store.clearAccountSession(HOST, 'marge')
    const before = await codesSent()

    const err = await sessionManager.resolveSessionWithoutUser(MARGE).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(sessionManager.NeedsHumanSignInError)
    expect(await codesSent()).toBe(before)
  }, 60_000)

  it('a session that expires mid-call renews silently or fails without a code; the next call sends one', async () => {
    // Sign marge in again with the code she is sent.
    const pending = parse(await call('get_profile', { account: MARGE, mode: 'json' }))
    expect(pending.state).toBe('need_2fa')
    expect(parse(await call('complete_2fa', { pending_id: pending.pending_id, code: await latestCode() })).state).toBe('logged_in')
    // Signs every session out server-side (and empties the outbox).
    await resetFakeMyChart(HOST)
    const before = await codesSent()

    // The live session bounces to the login page; the renewal hook is machine
    // mode, so it stops at 2FA and the call fails without sending a code.
    const expired = await call('get_profile', { account: MARGE, mode: 'json' })
    expect(expired.isError).toBe(true)
    expect(expired.content[0]!.text).toContain('Call get_profile again')
    expect(await codesSent()).toBe(before)

    // The session was dropped, so the next call signs in as human: one code.
    const again = parse(await call('get_profile', { account: MARGE, mode: 'json' }))
    expect(again.state).toBe('need_2fa')
    expect(await codesSent()).toBe(before + 1)
  }, 60_000)
})
