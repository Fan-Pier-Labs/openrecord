// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { describe, it, expect, beforeEach } from 'bun:test'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import * as memfs from './memfs'

const store = await import('../credential-store')
const { demoConflict, saveAccount } = await import('../demo-account')
const { registerAllTools } = await import('../tools')

const DEMO = 'fake-mychart.fanpierlabs.com'
const REAL = 'mychart.example.org'
const ids = () => store.readAccounts().map(store.accountId)

beforeEach(() => {
  memfs.reset()
})

describe('the demo and real accounts are never saved together', () => {
  it('a real account replaces the demo', () => {
    saveAccount(DEMO, 'homer', 'donuts123')
    saveAccount(REAL, 'patient', 'pw')
    expect(ids()).toEqual([`patient@${REAL}`])
  })

  it('the demo is refused while a real account is saved, and the real one is kept', () => {
    saveAccount(REAL, 'patient', 'pw')
    expect(demoConflict(`https://${DEMO}/MyChart/`)).toContain(`patient@${REAL}`)
    expect(() => saveAccount(DEMO, 'homer', 'donuts123')).toThrow("can't be connected while real accounts are")
    expect(ids()).toEqual([`patient@${REAL}`])
  })

  it('demo logins sit together, as do real ones', () => {
    saveAccount(DEMO, 'homer', 'donuts123')
    saveAccount(DEMO, 'marge', 'donuts123')
    expect(demoConflict(DEMO)).toBeNull()
    expect(ids()).toHaveLength(2)

    memfs.reset()
    saveAccount(REAL, 'a', 'pw')
    saveAccount('mychart.other.org', 'b', 'pw')
    expect(ids()).toHaveLength(2)
  })

  it('setup_account refuses the demo before logging in when a real account is saved', async () => {
    saveAccount(REAL, 'patient', 'pw')
    let handler: ((args: Record<string, unknown>) => Promise<{ content: { text: string }[]; isError?: boolean }>) | undefined
    registerAllTools({
      registerTool: (name: string, _config: unknown, h: typeof handler) => {
        if (name === 'setup_account') handler = h
      },
    } as unknown as McpServer)
    const result = await handler!({ hostname: DEMO, username: 'homer', password: 'donuts123' })
    expect(result.isError).toBe(true)
    expect(result.content[0]!.text).toContain('Do not disconnect them unless the user explicitly asks')
    expect(ids()).toEqual([`patient@${REAL}`])
  })
})
