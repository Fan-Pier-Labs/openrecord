/**
 * End-to-end proof that two logins on ONE hostname stay two separate
 * identities, driven through the extension's real tool handlers against
 * fake-mychart.
 *
 * This is the scenario that used to corrupt the store: passkeys and sessions
 * were keyed by hostname alone, so setting up marge on homer's hostname kept
 * homer's WebAuthn credential (`already_saved`), and marge's silent login then
 * authenticated as HOMER — the wrong-patient failure class. Homer is seeded
 * without 2FA; marge has TOTP enabled and accepts the fixed code 123456, so
 * her setup also exercises the complete_2fa path.
 *
 * `./memfs` intercepts every path under ~/.openrecord-mcpb, so the real
 * credential store on this machine is never touched — only the MyChart traffic
 * is real (well, fake, but served over HTTP).
 */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { resetFakeMyChart } from '../../../scrapers/myChart/__tests__/fake-mychart/mountMode'
import * as memfs from './memfs'

const store = await import('../credential-store')
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
const parse = (result: ToolResult) => JSON.parse(result.content[0].text)

beforeAll(async () => {
  await resetFakeMyChart(HOST)
  memfs.reset()
})

afterAll(() => {
  sessionManager.clearAllSessions()
})

describe('two logins on one hostname', () => {
  it('sets up homer, then marge, without disturbing homer', async () => {
    // Homer: plain username/password login, passkey auto-registered.
    const homer = parse(
      await call('setup_account', { hostname: HOST, username: 'homer', password: 'donuts123' }),
    )
    expect(homer.state).toBe('logged_in')
    expect(homer.account).toBe(`homer@${HOST}`)
    expect(homer.passkey_registered).toBe(true)

    const homerPasskey = store.readAccountPasskey(HOST, 'homer')
    expect(homerPasskey).toBeDefined()

    // Marge on the SAME hostname: TOTP 2FA, then her own passkey — the old
    // hostname-keyed store returned `already_saved` here and left her using
    // homer's credential.
    const margeSetup = parse(
      await call('setup_account', { hostname: HOST, username: 'marge', password: 'donuts123' }),
    )
    expect(margeSetup.state).toBe('need_2fa')
    const marge = parse(
      await call('complete_2fa', { pending_id: margeSetup.pending_id, code: '123456' }),
    )
    expect(marge.state).toBe('logged_in')
    expect(marge.account).toBe(`marge@${HOST}`)
    expect(marge.passkey_registered).toBe(true)

    // Homer's row, passkey and session all survived; marge's passkey is her own.
    expect(store.readAccounts()).toHaveLength(2)
    expect(store.readAccountPasskey(HOST, 'homer')).toBe(homerPasskey)
    const margePasskey = store.readAccountPasskey(HOST, 'marge')
    expect(margePasskey).toBeDefined()
    expect(margePasskey).not.toBe(homerPasskey)
    expect(store.readAccountSession(HOST, 'homer')).toBeDefined()
    expect(store.readAccountSession(HOST, 'marge')).toBeDefined()

    const accounts = parse(await call('list_accounts')).accounts
    expect(accounts.map((a: { account: string }) => a.account).sort()).toEqual([
      `homer@${HOST}`,
      `marge@${HOST}`,
    ])
    expect(accounts.every((a: { hasPasskey: boolean }) => a.hasPasskey)).toBe(true)
  }, 60_000)

  it('a bare-hostname account ref now refuses to guess between them', async () => {
    const result = await call('get_profile', { account: HOST })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain(`homer@${HOST}`)
    expect(result.content[0].text).toContain(`marge@${HOST}`)
  })

  it('each qualified id reads its own chart', async () => {
    const homerProfile = parse(await call('get_profile', { account: `homer@${HOST}` }))
    const margeProfile = parse(await call('get_profile', { account: `marge@${HOST}` }))
    expect(JSON.stringify(homerProfile)).toContain('Homer')
    expect(JSON.stringify(homerProfile)).not.toContain('Marge')
    expect(JSON.stringify(margeProfile)).toContain('Marge')
    expect(JSON.stringify(margeProfile)).not.toContain('Homer')
  }, 60_000)

  it("marge's silent passkey login authenticates as marge, not as whoever registered first", async () => {
    // Force a from-scratch login: no in-memory session, no cookie cache — the
    // silent ladder must use marge's own saved passkey. Before the per-user
    // store this is exactly where the wrong patient's chart came back.
    sessionManager.clearSession(`marge@${HOST}`)
    store.clearAccountSession(HOST, 'marge')

    const profile = parse(await call('get_profile', { account: `marge@${HOST}` }))
    expect(JSON.stringify(profile)).toContain('Marge')
    expect(JSON.stringify(profile)).not.toContain('Homer')
  }, 60_000)
})
