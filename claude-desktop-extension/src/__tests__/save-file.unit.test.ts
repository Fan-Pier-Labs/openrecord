/**
 * Saving a `returnsFile` payload must never overwrite the copy already on
 * disk, and must write the bytes it was given, nothing else. The `baseDir`
 * seam keeps this off the developer's own Downloads folder.
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { saveFilePayload } from '../save-file';

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
const payload = { fileName: 'Statement_20260115.pdf', mimeType: 'application/pdf', bytes: PDF };

let baseDir: string;
beforeEach(() => {
  baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openrecord-save-file-'));
});
afterEach(() => {
  fs.rmSync(baseDir, { recursive: true, force: true });
});

describe('saveFilePayload', () => {
  it('writes the bytes under the payload’s file name', () => {
    const saved = saveFilePayload(payload, baseDir);
    expect(saved).toBe(path.join(baseDir, 'Statement_20260115.pdf'));
    expect(new Uint8Array(fs.readFileSync(saved))).toEqual(PDF);
  });

  it('suffixes a second copy instead of overwriting the first', () => {
    const first = saveFilePayload(payload, baseDir);
    const second = saveFilePayload({ ...payload, bytes: new Uint8Array([1]) }, baseDir);
    const third = saveFilePayload(payload, baseDir);
    expect(path.basename(second)).toBe('Statement_20260115-2.pdf');
    expect(path.basename(third)).toBe('Statement_20260115-3.pdf');
    expect(new Uint8Array(fs.readFileSync(first))).toEqual(PDF);
  });
});
