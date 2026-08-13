/**
 * Tests for `changeDirToPackageRoot`.
 *
 * No disk. `fs.existsSync` is mocked over an in-memory set of paths, and
 * `process.cwd`/`process.chdir` are stubbed, so the walk up the tree is
 * simulated entirely in memory — including the case where it runs off the top
 * of the filesystem, which would otherwise depend on whatever happens to sit
 * above the temp directory on the machine running the test.
 */
import { describe, it, expect, beforeEach, afterAll, mock } from 'bun:test'
import * as realFs from 'node:fs'
import path from 'node:path'

/** Absolute paths that "exist". Only package.json lookups are ever asked. */
let present = new Set<string>()
let cwd = '/'

const realExistsSync = realFs.existsSync
const fakeFs = {
  ...realFs,
  existsSync: (p: realFs.PathLike) =>
    typeof p === 'string' && p.startsWith('/repo') ? present.has(p) : realExistsSync(p),
  default: realFs,
}
await mock.module('fs', () => fakeFs)
await mock.module('node:fs', () => fakeFs)

const realCwd = process.cwd.bind(process)
const realChdir = process.chdir.bind(process)
process.cwd = () => cwd
process.chdir = ((dir: string) => {
  cwd = dir
})

afterAll(() => {
  process.cwd = realCwd
  process.chdir = realChdir
})

const { changeDirToPackageRoot } = await import('../util')

/** Marks each directory as holding a package.json. */
function packagesAt(...dirs: string[]) {
  present = new Set(dirs.map((d) => path.join(d, 'package.json')))
}

beforeEach(() => {
  present = new Set()
  cwd = '/'
})

describe('changeDirToPackageRoot', () => {
  it('walks up to the nearest ancestor holding a package.json', () => {
    packagesAt('/repo')
    cwd = '/repo/a/b/c'

    changeDirToPackageRoot()

    expect(process.cwd()).toBe('/repo')
  })

  it('stays put when the current directory already has one', () => {
    packagesAt('/repo')
    cwd = '/repo'

    changeDirToPackageRoot()

    expect(process.cwd()).toBe('/repo')
  })

  it('stops at the nearest package.json, not the outermost', () => {
    // A workspace inside a monorepo must resolve to the inner package.
    packagesAt('/repo', '/repo/packages/inner')
    cwd = '/repo/packages/inner/src'

    changeDirToPackageRoot()

    expect(process.cwd()).toBe('/repo/packages/inner')
  })

  it('leaves the working directory alone when nothing above has one', () => {
    // Walking off the top of the tree must be a no-op, not a chdir to '/'.
    packagesAt()
    cwd = '/repo/x/y'

    expect(() => changeDirToPackageRoot()).not.toThrow()

    expect(process.cwd()).toBe('/repo/x/y')
  })

  it('climbs several levels in one call', () => {
    packagesAt('/repo')
    cwd = '/repo/a/b/c/d/e/f'

    changeDirToPackageRoot()

    expect(process.cwd()).toBe('/repo')
  })
})
