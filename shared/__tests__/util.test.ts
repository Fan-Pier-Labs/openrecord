import { describe, it, expect, afterEach } from 'bun:test'
import { changeDirToPackageRoot } from '../util'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const originalCwd = process.cwd()
const tempRoots: string[] = []

/** Builds a throwaway tree and returns its (symlink-resolved) path. */
function scratchTree(): string {
  // macOS puts tmpdir behind /var -> /private/var, and process.cwd() reports the
  // resolved path — so resolve up front or every comparison below fails.
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'pkgroot-')))
  tempRoots.push(root)
  return root
}

afterEach(() => {
  process.chdir(originalCwd)
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('changeDirToPackageRoot', () => {
  it('walks up to the nearest ancestor holding a package.json', () => {
    const root = scratchTree()
    writeFileSync(path.join(root, 'package.json'), '{}')
    const nested = path.join(root, 'a', 'b', 'c')
    mkdirSync(nested, { recursive: true })

    process.chdir(nested)
    changeDirToPackageRoot()

    expect(process.cwd()).toBe(root)
  })

  it('stays put when the current directory already has a package.json', () => {
    const root = scratchTree()
    writeFileSync(path.join(root, 'package.json'), '{}')

    process.chdir(root)
    changeDirToPackageRoot()

    expect(process.cwd()).toBe(root)
  })

  it('stops at the nearest package.json, not the outermost one', () => {
    const root = scratchTree()
    writeFileSync(path.join(root, 'package.json'), '{}')
    const inner = path.join(root, 'packages', 'inner')
    mkdirSync(inner, { recursive: true })
    writeFileSync(path.join(inner, 'package.json'), '{}')
    const deep = path.join(inner, 'src')
    mkdirSync(deep)

    process.chdir(deep)
    changeDirToPackageRoot()

    expect(process.cwd()).toBe(inner)
  })

  it('leaves the working directory alone when no package.json exists above', () => {
    // Walking off the top of the tree must be a no-op, not a chdir to '/'.
    const root = scratchTree()
    const nested = path.join(root, 'x', 'y')
    mkdirSync(nested, { recursive: true })

    process.chdir(nested)
    expect(() => changeDirToPackageRoot()).not.toThrow()

    // The scratch tree lives under the system temp dir, which has no
    // package.json anywhere above it, so the loop runs out at the filesystem
    // root and returns without moving.
    expect(process.cwd()).toBe(nested)
  })
})
