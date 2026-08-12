/**
 * Tests for the CLI's TOTP secret store.
 *
 * No disk: `fs.promises` is mocked over a Map. `MYCHART_TOTP_DIR` is set before
 * the dynamic import because the module resolves its directory once, at load.
 * The secret here is a shared 2FA seed — it must never be written to a real
 * path during a test run.
 */
import { describe, it, expect, beforeEach, mock } from 'bun:test'
import * as realFs from 'node:fs'
import path from 'node:path'

const TOTP_DIR = path.join('/virtual-totp-store', '.totp-secrets')
process.env.MYCHART_TOTP_DIR = TOTP_DIR

const files = new Map<string, string>()
const dirs = new Set<string>()

const isVirtual = (p: unknown) => typeof p === 'string' && p.startsWith('/virtual-totp-store')

function enoent(p: string): NodeJS.ErrnoException {
  const err = new Error(`ENOENT: no such file or directory, open '${p}'`) as NodeJS.ErrnoException
  err.code = 'ENOENT'
  return err
}

const fakeFs = {
  ...realFs,
  promises: {
    ...realFs.promises,
    async mkdir(dir: string, ...rest: unknown[]) {
      if (!isVirtual(dir)) return realFs.promises.mkdir(dir, ...(rest as []))
      dirs.add(dir)
      return undefined
    },
    async writeFile(p: string, data: unknown, ...rest: unknown[]) {
      if (!isVirtual(p)) return realFs.promises.writeFile(p, data as string, ...(rest as []))
      files.set(p, String(data))
    },
    async readFile(p: string, ...rest: unknown[]) {
      if (!isVirtual(p)) return realFs.promises.readFile(p, ...(rest as []))
      const data = files.get(p)
      if (data === undefined) throw enoent(p)
      return data
    },
  },
}
mock.module('fs', () => fakeFs)
mock.module('node:fs', () => fakeFs)

const { saveTotpSecret, loadTotpSecret } = await import('../totpStore')

const pathFor = (host: string) => path.join(TOTP_DIR, `${host}.txt`)

beforeEach(() => {
  files.clear()
  dirs.clear()
})

describe('saveTotpSecret', () => {
  it('round-trips a secret', async () => {
    await saveTotpSecret('mychart.example.org', 'JBSWY3DPEHPK3PXP')
    expect(await loadTotpSecret('mychart.example.org')).toBe('JBSWY3DPEHPK3PXP')
  })

  it('creates the store directory', async () => {
    await saveTotpSecret('mychart.example.org', 'SEED')
    expect(dirs.has(TOTP_DIR)).toBe(true)
  })

  it('files each host separately', async () => {
    await saveTotpSecret('a.example.org', 'SEED-A')
    await saveTotpSecret('b.example.org', 'SEED-B')

    expect(await loadTotpSecret('a.example.org')).toBe('SEED-A')
    expect(await loadTotpSecret('b.example.org')).toBe('SEED-B')
  })

  it('overwrites a re-enrolled host rather than appending', async () => {
    await saveTotpSecret('mychart.example.org', 'OLD')
    await saveTotpSecret('mychart.example.org', 'NEW')

    expect(await loadTotpSecret('mychart.example.org')).toBe('NEW')
  })

  it('honours MYCHART_TOTP_DIR', async () => {
    await saveTotpSecret('mychart.example.org', 'SEED')
    expect([...files.keys()]).toEqual([pathFor('mychart.example.org')])
  })
})

describe('loadTotpSecret', () => {
  it('returns null when no secret is stored', async () => {
    expect(await loadTotpSecret('mychart.example.org')).toBeNull()
  })

  it('trims trailing whitespace a hand-edited file may carry', async () => {
    files.set(pathFor('mychart.example.org'), '  JBSWY3DPEHPK3PXP \n')
    expect(await loadTotpSecret('mychart.example.org')).toBe('JBSWY3DPEHPK3PXP')
  })

  it('returns null rather than throwing when the read fails', async () => {
    // A missing store must degrade to "no secret", not crash the CLI.
    expect(await loadTotpSecret('never-enrolled.example.org')).toBeNull()
  })
})
