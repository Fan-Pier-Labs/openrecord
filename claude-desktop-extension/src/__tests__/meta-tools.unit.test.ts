// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * Behaviour tests for the extension's account-management ("meta") tools and for
 * the shared error path every scraper tool inherits.
 *
 * `proxy-tools.test.ts` asserts registration *shape*; this file actually invokes
 * handlers. `./memfs` replaces `fs` with a Map for the credential store's
 * paths, so nothing here touches disk.
 *
 * Handlers that would reach MyChart over the network are exercised only through
 * their failure paths (no account configured), which is where the wrapper's
 * error handling lives.
 */
import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import * as memfs from './memfs'

const store = await import('../credential-store')
const { registerAllTools } = await import('../tools')

interface ToolResult {
  content: Array<{ type: string; text: string }>
  isError?: boolean
}

type Handler = (args: Record<string, unknown>) => Promise<ToolResult>

function captureTools(): Map<string, { handler: Handler }> {
  const tools = new Map<string, { handler: Handler }>()
  const server = {
    registerTool: (name: string, _config: unknown, handler: Handler) => {
      tools.set(name, { handler })
    },
  } as unknown as McpServer
  registerAllTools(server)
  return tools
}

const tools = captureTools()

const call = (name: string, args: Record<string, unknown> = {}) => {
  const tool = tools.get(name)
  if (!tool) throw new Error(`tool ${name} is not registered`)
  return tool.handler(args)
}

const parse = (result: ToolResult) => JSON.parse(result.content[0]!.text)
const text = (result: ToolResult) => result.content[0]!.text

beforeEach(() => {
  memfs.reset()
})

describe('list_accounts', () => {
  it('reports an empty list before any setup', async () => {
    expect(parse(await call('list_accounts')).accounts).toEqual([])
  })

  it('lists a configured account by hostname', async () => {
    store.upsertAccount({ hostname: 'mychart.example.org', username: 'homer', password: 'donuts123' })

    const accounts = parse(await call('list_accounts')).accounts
    expect(accounts).toHaveLength(1)
    expect(accounts[0].hostname).toBe('mychart.example.org')
  })

  it('never returns the stored password', async () => {
    // This output goes straight into a model's context.
    store.upsertAccount({
      hostname: 'mychart.example.org',
      username: 'homer',
      password: 'donuts123',
      totpSecret: 'SEEDVALUE',
    })

    const body = text(await call('list_accounts'))
    expect(body).not.toContain('donuts123')
    expect(body).not.toContain('SEEDVALUE')
  })

  it('lists every configured account', async () => {
    store.upsertAccount({ hostname: 'a.example.org', username: 'homer', password: 'x' })
    store.upsertAccount({ hostname: 'b.example.org', username: 'marge', password: 'y' })

    expect(parse(await call('list_accounts')).accounts).toHaveLength(2)
  })

  it('lists two logins on one hostname as separate accounts with qualified ids', async () => {
    store.upsertAccount({ hostname: 'mychart.example.org', username: 'homer', password: 'x' })
    store.upsertAccount({ hostname: 'mychart.example.org', username: 'marge', password: 'y' })

    const accounts = parse(await call('list_accounts')).accounts
    expect(accounts.map((a: { account: string }) => a.account).sort()).toEqual([
      'homer@mychart.example.org',
      'marge@mychart.example.org',
    ])
  })

  it('reports hasPasskey per login, not per hostname', async () => {
    store.upsertAccount({ hostname: 'mychart.example.org', username: 'homer', password: 'x' })
    store.upsertAccount({ hostname: 'mychart.example.org', username: 'marge', password: 'y' })
    store.saveAccountPasskey('mychart.example.org', 'homer', '{"cred":"homers"}')

    const accounts = parse(await call('list_accounts')).accounts
    const byUser = Object.fromEntries(
      accounts.map((a: { username: string; hasPasskey: boolean }) => [a.username, a.hasPasskey]),
    )
    expect(byUser).toEqual({ homer: true, marge: false })
  })
})

describe('disconnect_account', () => {
  it('removes a configured account by its id', async () => {
    store.upsertAccount({ hostname: 'mychart.example.org', username: 'homer', password: 'x' })

    await call('disconnect_account', { account: 'homer@mychart.example.org' })

    expect(store.findAccount('mychart.example.org', 'homer')).toBeUndefined()
  })

  it('takes the stored passkey and session with it', async () => {
    store.upsertAccount({ hostname: 'mychart.example.org', username: 'homer', password: 'x' })
    store.saveAccountPasskey('mychart.example.org', 'homer', '{"cred":"abc"}')
    store.saveAccountSession('mychart.example.org', 'homer', 'cookies')

    await call('disconnect_account', { account: 'homer@mychart.example.org' })

    expect(store.readAccountPasskey('mychart.example.org', 'homer')).toBeUndefined()
    expect(store.readAccountSession('mychart.example.org', 'homer')).toBeUndefined()
  })

  it('forgets only the named login, leaving the hostname\'s other login intact', async () => {
    store.upsertAccount({ hostname: 'mychart.example.org', username: 'homer', password: 'x' })
    store.upsertAccount({ hostname: 'mychart.example.org', username: 'marge', password: 'y' })
    store.saveAccountPasskey('mychart.example.org', 'marge', '{"cred":"marges"}')

    await call('disconnect_account', { account: 'homer@mychart.example.org' })

    expect(store.findAccount('mychart.example.org', 'homer')).toBeUndefined()
    expect(store.findAccount('mychart.example.org', 'marge')).toBeDefined()
    expect(store.readAccountPasskey('mychart.example.org', 'marge')).toBe('{"cred":"marges"}')
  })

  it('does not treat a bare hostname as a match', async () => {
    // Hostname alone never names a login: forgetting is per identity.
    store.upsertAccount({ hostname: 'mychart.example.org', username: 'homer', password: 'x' })

    const result = await call('disconnect_account', { account: 'mychart.example.org' })

    expect(text(result)).toContain('No saved account')
    expect(store.readAccounts()).toHaveLength(1)
  })

  it('is not an error to disconnect something that was never connected', async () => {
    const result = await call('disconnect_account', { account: 'nobody@nope.example.org' })
    expect(result.content[0]!.text).toBeTruthy()
  })
})

describe('scraper tools without a configured account', () => {
  // Every scraper tool shares one wrapper, so its failure path is what a user
  // hits when the model invents an account id.
  const scraperTools = ['get_medications', 'get_allergies', 'get_immunizations']

  for (const name of scraperTools) {
    it(`${name} fails with guidance rather than throwing`, async () => {
      const result = await call(name, { account: 'unconfigured.example.org' })

      expect(result.isError).toBe(true)
      expect(text(result)).toContain('Error:')
      expect(text(result)).toMatch(/No MyChart accounts configured|not configured/)
    })
  }

  it('names the configured accounts when the requested one is unknown', async () => {
    store.upsertAccount({ hostname: 'real.example.org', username: 'homer', password: 'x' })

    const result = await call('get_medications', { account: 'typo.example.org' })
    expect(text(result)).toContain('real.example.org')
  })

  it('treats a missing account argument as an error, not a crash', async () => {
    const result = await call('get_medications', {})
    expect(result.isError).toBe(true)
  })
})

describe('registered surface', () => {
  it('registers the account-management tools Claude Desktop drives setup with', () => {
    for (const name of ['list_accounts', 'setup_account', 'complete_2fa', 'disconnect_account']) {
      expect(tools.has(name)).toBe(true)
    }
  })

  /**
   * Tripwire, not the proof. The proof is
   * `multi-account.integration.test.ts`, which logs in against fake-mychart
   * and asserts no passkey landed in the store — an outcome, not a spelling.
   * This runs without a server, so it catches the regression on every `bun run
   * test` instead of only when the fixture is up.
   *
   * Enrolling a passkey is a write to the patient's MyChart account that
   * removes the password and the 2FA code from every later sign-in, and the
   * credential outlives the session. Logging in must never do it as a side
   * effect — only `register_passkey`, which the user asks for, may, and that
   * one lives in `shared/capabilities/`.
   *
   * Matches the module path rather than the identifier: a comment naming
   * `setupPasskey` should not fail the build, and an import is what actually
   * puts the call back within reach of the login handlers.
   */
  it('tripwire: tools.ts does not import the passkey-registration scraper', async () => {
    const source = await Bun.file(new URL('../tools.ts', import.meta.url)).text()
    expect(source).not.toContain('scrapers/myChart/auth/setupPasskey')
  })

  it('registers a substantial scraper surface', () => {
    expect(tools.size).toBeGreaterThan(20)
  })
})

describe('error reporting', () => {
  const envKeys = ['MYCHART_CLI_TELEMETRY_DISABLED', 'OPENRECORD_ANALYTICS_DISABLED', 'OPENRECORD_ANALYTICS_ENDPOINT'] as const
  let saved: Record<string, string | undefined>
  let originalFetch: typeof fetch
  let fetchMock: ReturnType<typeof mock>

  beforeEach(() => {
    saved = Object.fromEntries(envKeys.map((k) => [k, process.env[k]]))
    for (const k of envKeys) delete process.env[k]
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

  /** The events posted to the analytics Lambda, once `count` of them have gone out. */
  type LambdaEvent = { event: string; properties: Record<string, unknown>; error?: { name: string; message: string; stack: string } }
  async function lambdaEvents(count: number): Promise<LambdaEvent[]> {
    const posted = () =>
      fetchMock.mock.calls
        .filter((c) => String(c[0]).includes('execute-api'))
        .map((c) => JSON.parse((c[1] as RequestInit).body as string) as LambdaEvent)
    for (let i = 0; i < 200 && posted().length < count; i++) await new Promise<void>((r) => { setTimeout(r, 0) })
    return posted()
  }

  it('sends a failed call as mcpb_tool_error with the stack of what was thrown', async () => {
    const result = await call('get_profile', { account: 'nobody@mychart.example.org' })
    expect(result.isError).toBe(true)

    const events = await lambdaEvents(2)
    const failure = events.find((e) => e.event === 'mcpb_tool_error')!
    expect(failure.properties.tool).toBe('get_profile')
    expect(failure.properties.hostname).toBe('mychart.example.org')
    expect(failure.error!.message).toBe('No MyChart accounts configured. Call setup_account first.')
    // The stack the tool result threw away: where it was thrown, not just what it said.
    expect(failure.error!.stack).toContain('resolveSession')
    expect(events.some((e) => e.event === 'mcpb_tool_called')).toBe(true)
  })

  it('sends no error event for a call that succeeds', async () => {
    await call('list_accounts')
    const events = await lambdaEvents(1)
    // Give a stray error event every chance to show up before asserting it didn't.
    for (let i = 0; i < 50; i++) await new Promise<void>((r) => { setTimeout(r, 0) })
    expect(events.map((e) => e.event)).toEqual(['mcpb_tool_called'])
  })
})
