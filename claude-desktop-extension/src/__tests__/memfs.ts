/**
 * In-memory filesystem for the credential store, so its tests touch no disk.
 *
 * `credential-store.ts` is defined by its file behaviour — the layout under
 * ~/.openrecord-mcpb, 0600 permissions, tolerating corrupt JSON — so the way to
 * test it is to give it a filesystem, not to skip the filesystem. This replaces
 * `fs` with a Map. No temp directories, no `os` mocking, no writes anywhere.
 *
 * **Scoped on purpose.** `cd claude-desktop-extension && bun test` runs every
 * file in ONE process, and `imaging/__tests__/encode.test.ts` reads real fixture
 * files. So the mock intercepts only paths under the credential-store root and
 * delegates everything else to the real `fs`. A blanket mock would break the
 * other suites in the same run.
 *
 * Nothing under the root ever reaches real `fs`: the delegate throws if such a
 * path reaches it, which turns any gap in this shim into a loud failure rather
 * than a write to the developer's actual credentials.
 */
import { mock } from 'bun:test'
import * as nodeFs from 'node:fs'
import * as os from 'node:os'
import path from 'node:path'

/** Same derivation credential-store.ts uses, so interception lines up exactly. */
export const ROOT = path.join(os.homedir(), '.openrecord-mcpb')

// Captured before mock.module swaps the module out.
const realReadFileSync = nodeFs.readFileSync
const realWriteFileSync = nodeFs.writeFileSync
const realMkdirSync = nodeFs.mkdirSync
const realChmodSync = nodeFs.chmodSync
const realUnlinkSync = nodeFs.unlinkSync

interface Entry {
  data: string
  mode: number
}

const files = new Map<string, Entry>()
const dirs = new Set<string>()

const isStorePath = (p: unknown): boolean => typeof p === 'string' && p.startsWith(ROOT)

function guardDelegate(p: unknown): void {
  if (isStorePath(p)) {
    throw new Error(`memfs gap: ${String(p)} reached the real fs — it should have been intercepted`)
  }
}

function enoent(p: string): NodeJS.ErrnoException {
  const err = new Error(`ENOENT: no such file or directory, open '${p}'`) as NodeJS.ErrnoException
  err.code = 'ENOENT'
  return err
}

const fakeFs = {
  ...nodeFs,

  readFileSync(p: string, ...rest: unknown[]) {
    if (!isStorePath(p)) {
      guardDelegate(p)
      return (realReadFileSync as (...a: unknown[]) => unknown)(p, ...rest)
    }
    const entry = files.get(p)
    if (!entry) throw enoent(p)
    return entry.data
  },

  writeFileSync(p: string, data: unknown, ...rest: unknown[]) {
    if (!isStorePath(p)) {
      guardDelegate(p)
      return (realWriteFileSync as (...a: unknown[]) => unknown)(p, data, ...rest)
    }
    // Default 0644 until chmodSync says otherwise, mirroring real file creation.
    files.set(p, { data: String(data), mode: files.get(p)?.mode ?? 0o644 })
  },

  mkdirSync(dir: string, ...rest: unknown[]) {
    if (!isStorePath(dir)) {
      guardDelegate(dir)
      return (realMkdirSync as (...a: unknown[]) => unknown)(dir, ...rest)
    }
    dirs.add(dir)
    return undefined
  },

  chmodSync(p: string, mode: number, ...rest: unknown[]) {
    if (!isStorePath(p)) {
      guardDelegate(p)
      return (realChmodSync as (...a: unknown[]) => unknown)(p, mode, ...rest)
    }
    const entry = files.get(p)
    if (!entry) throw enoent(p)
    entry.mode = mode
  },

  unlinkSync(p: string, ...rest: unknown[]) {
    if (!isStorePath(p)) {
      guardDelegate(p)
      return (realUnlinkSync as (...a: unknown[]) => unknown)(p, ...rest)
    }
    if (!files.delete(p)) throw enoent(p)
  },
}

await mock.module('fs', () => fakeFs)
await mock.module('node:fs', () => fakeFs)

// ── Test helpers ────────────────────────────────────────────────────────────

/** Wipes the in-memory store between tests. */
export function reset(): void {
  files.clear()
  dirs.clear()
}

/** Permission bits the store last set on a path, or undefined if absent. */
export function modeOf(p: string): number | undefined {
  return files.get(p)?.mode
}

export function exists(p: string): boolean {
  return files.has(p) || dirs.has(p)
}

/** Seeds a file directly, for corrupt-content cases. */
export function put(p: string, data: string): void {
  files.set(p, { data, mode: 0o644 })
}

/** Raw persisted bytes, for asserting what actually got written. */
export function read(p: string): string | undefined {
  return files.get(p)?.data
}

/** Every path the store has written, for asserting nothing stray was created. */
export function writtenPaths(): string[] {
  return [...files.keys()].sort()
}
