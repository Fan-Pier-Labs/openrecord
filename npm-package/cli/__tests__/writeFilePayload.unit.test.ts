import { describe, expect, it, afterAll } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { writeFilePayload } from '../capabilityActions';

/** The CLI's rendering of a returnsFile payload: bytes on disk, path back. */
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'write-file-payload-'));
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe('writeFilePayload', () => {
  it('writes the file into the output directory, creating it', async () => {
    const dir = path.join(tmpDir, 'nested', 'out');
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const filePath = await writeFilePayload({ fileName: 'Statement_20260115.pdf', mimeType: 'application/pdf', bytes }, dir);
    expect(filePath).toBe(path.join(dir, 'Statement_20260115.pdf'));
    expect(new Uint8Array(fs.readFileSync(filePath))).toEqual(bytes);
  });

  it('never writes outside the output directory, whatever the file name says', async () => {
    const filePath = await writeFilePayload(
      { fileName: '../../escape.pdf', mimeType: 'application/pdf', bytes: new Uint8Array([1]) },
      tmpDir,
    );
    expect(filePath).toBe(path.join(tmpDir, 'escape.pdf'));
  });
});
