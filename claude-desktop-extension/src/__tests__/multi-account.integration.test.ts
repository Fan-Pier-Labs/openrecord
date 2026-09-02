/**
 * End-to-end proof that two logins on ONE hostname stay two separate
 * identities, driven through the extension's real tool handlers against
 * fake-mychart.
 *
 * This is the scenario that used to corrupt the store: passkeys and sessions
 * were keyed by hostname alone, so registering a passkey for marge on homer's
 * hostname left homer's WebAuthn credential in place, and marge's silent login
 * then authenticated as HOMER — the wrong-patient failure class. Homer is
 * seeded without 2FA; marge has TOTP enabled and accepts the fixed code 123456,
 * so her setup also exercises the complete_2fa path.
 *
 * It also pins the consent rule: neither login route registers a passkey on
 * its own. Both report `passkey_recommended` and wait for an explicit
 * register_passkey call.
 *
 * `./memfs` intercepts every path under ~/.openrecord-mcpb and pins secrets to
 * the file backend, so neither the real credential store nor the OS keystore on
 * this machine is touched — only the MyChart traffic is real (well, fake, but
 * served over HTTP). This suite is the one that would notice: it runs
 * `setup_account` and `register_passkey` for real, so an unpinned run files
 * passkeys and passwords in the developer's own login keychain and leaves them
 * there. `beforeAll` refuses to run rather than let that happen.
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
const parse = (result: ToolResult) => JSON.parse(result.content[0]!.text)

beforeAll(async () => {
  // Not an `expect`: this has to stop the suite before the first login, not
  // report a failure after the secrets have already been written.
  const backend = store.secretBackend()
  if (backend !== 'file') {
    throw new Error(
      `secrets would go to the ${backend}, not the test file store — ` +
        'this suite registers real passkeys and would leave them in the OS ' +
        'keystore. Check the OPENRECORD_SECRET_BACKEND pin in ./memfs.',
    )
  }
  await resetFakeMyChart(HOST)
  memfs.reset()
})

afterAll(() => {
  sessionManager.clearAllSessions()
})

describe('two logins on one hostname', () => {
  it('sets up homer, then marge, without disturbing homer', async () => {
    // Homer: plain username/password login. Logging in registers NO passkey —
    // enrolling a sign-in factor on someone's medical record needs their
    // say-so, so the result only recommends it.
    const homer = parse(
      await call('setup_account', { hostname: HOST, username: 'homer', password: 'donuts123' }),
    )
    expect(homer.state).toBe('logged_in')
    expect(homer.account).toBe(`homer@${HOST}`)
    expect(homer.passkey_saved).toBe(false)
    expect(homer.passkey_recommended).toBe(true)
    expect(store.readAccountPasskey(HOST, 'homer')).toBeUndefined()

    // …and the user says yes.
    expect(parse(await call('register_passkey', { account: `homer@${HOST}` })).registered).toBe(true)
    const homerPasskey = store.readAccountPasskey(HOST, 'homer')
    expect(homerPasskey).toBeDefined()

    // Marge on the SAME hostname: TOTP 2FA, then her own passkey — the old
    // hostname-keyed store handed her homer's credential here, and her silent
    // login then authenticated as HOMER.
    const margeSetup = parse(
      await call('setup_account', { hostname: HOST, username: 'marge', password: 'donuts123' }),
    )
    expect(margeSetup.state).toBe('need_2fa')
    const marge = parse(
      await call('complete_2fa', { pending_id: margeSetup.pending_id, code: '123456' }),
    )
    expect(marge.state).toBe('logged_in')
    expect(marge.account).toBe(`marge@${HOST}`)
    // Homer's passkey on this hostname must not be mistaken for marge's.
    expect(marge.passkey_saved).toBe(false)
    expect(marge.passkey_recommended).toBe(true)
    expect(parse(await call('register_passkey', { account: `marge@${HOST}` })).registered).toBe(true)

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

  it('a bare hostname is no match — the error lists the real ids', async () => {
    const result = await call('get_profile', { account: HOST })
    expect(result.isError).toBe(true)
    expect(result.content[0]!.text).toContain(`homer@${HOST}`)
    expect(result.content[0]!.text).toContain(`marge@${HOST}`)
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
