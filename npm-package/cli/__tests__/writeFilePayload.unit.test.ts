import { describe, expect, it, afterAll } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { writeFilePayload } from '../capabilityActions';
import type { FilePayload } from '../../../shared/capabilities';

/**
 * The CLI's rendering of a returnsFile payload: the bytes on disk under the
 * name the scraper gave it. The silent failure modes are a name that is a
 * path and a re-download overwriting the first copy.
 */

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'write-file-payload-'));
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

const PDF = new TextEncoder().encode('%PDF-1.4\n%fake\n');

function payload(overrides: Partial<FilePayload> = {}): FilePayload {
  return { fileName: 'proof of coverage.pdf', mimeType: 'application/pdf', bytes: PDF, ...overrides };
}

describe('writeFilePayload', () => {
  it('writes the bytes under the payload’s own name, creating the directory', async () => {
    const dir = path.join(tmpDir, 'nested', 'out');
    const written = await writeFilePayload(payload(), dir);
    expect(written).toBe(path.join(dir, 'proof of coverage.pdf'));
    expect(fs.readFileSync(written)).toEqual(Buffer.from(PDF));
  });

  it('keeps a second download of the same name beside the first', async () => {
    const dir = path.join(tmpDir, 'twice');
    const first = await writeFilePayload(payload(), dir);
    const second = await writeFilePayload(payload({ bytes: new Uint8Array([1, 2, 3]) }), dir);
    expect(path.basename(first)).toBe('proof of coverage.pdf');
    expect(path.basename(second)).toBe('proof of coverage-2.pdf');
    expect(fs.readFileSync(first)).toEqual(Buffer.from(PDF));
  });

  it('cannot be steered outside the output directory by the name', async () => {
    const dir = path.join(tmpDir, 'safe');
    const written = await writeFilePayload(payload({ fileName: '../../escape.pdf' }), dir);
    expect(path.dirname(written)).toBe(dir);
    expect(path.basename(written)).toBe('escape.pdf');
  });
});
