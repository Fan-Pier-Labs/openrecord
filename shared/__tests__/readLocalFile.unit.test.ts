import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import * as os from 'os'
import * as path from 'path'
import { readLocalFile } from '../readLocalFile'

describe('readLocalFile', () => {
  let dir: string

  beforeAll(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'readLocalFile-'))
    writeFileSync(path.join(dir, 'Scan.PDF'), Buffer.from('%PDF-1.4'))
    writeFileSync(path.join(dir, 'notes.xyz'), Buffer.from('x'))
  })

  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('reads a file as its basename, bytes and a MIME type from the extension', async () => {
    const file = await readLocalFile(path.join(dir, 'Scan.PDF'))
    expect(file.fileName).toBe('Scan.PDF')
    expect(file.mimeType).toBe('application/pdf')
    expect(new TextDecoder().decode(file.bytes)).toBe('%PDF-1.4')
  })

  it('falls back to a generic type for an extension it does not know', async () => {
    expect((await readLocalFile(path.join(dir, 'notes.xyz'))).mimeType).toBe('application/octet-stream')
  })

  it('expands ~/ to the home directory', async () => {
    const relative = path.relative(os.homedir(), path.join(dir, 'Scan.PDF'))
    expect((await readLocalFile(`~/${relative}`)).fileName).toBe('Scan.PDF')
  })

  it('refuses a missing path and a directory', async () => {
    await expect(readLocalFile(path.join(dir, 'nope.pdf'))).rejects.toThrow(/Attachment not found/)
    await expect(readLocalFile(dir)).rejects.toThrow(/Attachment not found/)
  })
})
