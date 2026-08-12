/**
 * Behaviour tests for the extension's account-management ("meta") tools and for
 * the shared error path every scraper tool inherits.
 *
 * `proxy-tools.test.ts` asserts registration *shape*; this file actually invokes
 * handlers. `./tmpHome` redirects the credential store into a throwaway
 * directory — nothing here may touch a real ~/.openrecord-mcpb.
 *
 * Handlers that would reach MyChart over the network are exercised only through
 * their failure paths (no account configured), which is where the wrapper's
 * error handling lives.
 */
import { describe, it, expect, beforeEach } from 'bun:test'
import { rmSync } from 'node:fs'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { assertSandboxed } from './tmpHome'

const store = await import('../credential-store')
const { registerAllTools } = await import('../tools')

assertSandboxed(store._paths.ROOT)

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

const parse = (result: ToolResult) => JSON.parse(result.content[0].text)
const text = (result: ToolResult) => result.content[0].text

beforeEach(() => {
  rmSync(store._paths.ROOT, { recursive: true, force: true })
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
})

describe('disconnect_account', () => {
  it('removes a configured account', async () => {
    store.upsertAccount({ hostname: 'mychart.example.org', username: 'homer', password: 'x' })

    await call('disconnect_account', { account: 'mychart.example.org' })

    expect(store.findAccount('mychart.example.org')).toBeUndefined()
  })

  it('takes the stored passkey and session with it', async () => {
    store.upsertAccount({ hostname: 'mychart.example.org', username: 'homer', password: 'x' })
    store.saveAccountPasskey('mychart.example.org', '{"cred":"abc"}')
    store.saveAccountSession('mychart.example.org', 'cookies')

    await call('disconnect_account', { account: 'mychart.example.org' })

    expect(store.readAccountPasskey('mychart.example.org')).toBeUndefined()
    expect(store.readAccountSession('mychart.example.org')).toBeUndefined()
  })

  it('is not an error to disconnect something that was never connected', async () => {
    const result = await call('disconnect_account', { account: 'nope.example.org' })
    expect(result.content[0].text).toBeTruthy()
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

  it('registers a substantial scraper surface', () => {
    expect(tools.size).toBeGreaterThan(20)
  })
})
