/**
 * A downloaded attachment always lands on disk, and only a small image or
 * text file is also shown inline: Claude Desktop caps a tool result at 1MB,
 * and a PDF has no content block to be shown in.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { INLINE_BUDGET_BYTES, fileResult, saveDownloadedFile } from '../file-result';
import type { DownloadedFile } from '../../../../shared/capabilities';

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'openrecord-file-result-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const file = (over: Partial<DownloadedFile>): DownloadedFile => ({
  fileName: 'plan.pdf',
  mimeType: 'application/pdf',
  size: 4,
  bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
  ...over,
});

function summary(result: { content: Array<{ type: string; text?: string }> }) {
  return JSON.parse(result.content[0]!.text!) as Record<string, unknown>;
}

describe('saveDownloadedFile', () => {
  test('writes the bytes under the given directory and never overwrites an earlier copy', () => {
    const first = saveDownloadedFile(file({}), dir);
    const second = saveDownloadedFile(file({ bytes: new Uint8Array([1, 2]) }), dir);
    expect(first).toBe(path.join(dir, 'plan.pdf'));
    expect(second).toBe(path.join(dir, 'plan-2.pdf'));
    expect(fs.readFileSync(first)).toEqual(Buffer.from([0x25, 0x50, 0x44, 0x46]));
    expect(fs.readFileSync(second)).toEqual(Buffer.from([1, 2]));
  });
});

describe('fileResult', () => {
  test('a PDF is saved and described, with the path to read it from, and nothing inline', () => {
    const result = fileResult(file({}), dir);
    expect(result.content).toHaveLength(1);
    expect(summary(result)).toMatchObject({
      file_name: 'plan.pdf',
      mime_type: 'application/pdf',
      size_bytes: 4,
      saved_to: path.join(dir, 'plan.pdf'),
      shown_inline: false,
    });
    expect(summary(result).note).toContain(path.join(dir, 'plan.pdf'));
    expect(fs.existsSync(path.join(dir, 'plan.pdf'))).toBe(true);
  });

  test('a small image is saved and also shown inline', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const result = fileResult(file({ fileName: 'scan.png', mimeType: 'image/png', size: 4, bytes: png }), dir);
    expect(summary(result).shown_inline).toBe(true);
    expect(result.content[1]).toEqual({ type: 'image', data: Buffer.from(png).toString('base64'), mimeType: 'image/png' });
  });

  test('a small text file is saved and shown inline as text', () => {
    const result = fileResult(file({ fileName: 'note.txt', mimeType: 'text/plain', size: 5, bytes: new TextEncoder().encode('hello') }), dir);
    expect(result.content[1]).toEqual({ type: 'text', text: 'hello' });
  });

  test('an image over the inline budget is saved and only described', () => {
    const big = new Uint8Array(INLINE_BUDGET_BYTES);
    const result = fileResult(file({ fileName: 'big.png', mimeType: 'image/png', size: big.length, bytes: big }), dir);
    expect(result.content).toHaveLength(1);
    expect(summary(result)).toMatchObject({ shown_inline: false });
    expect(summary(result).note).toMatch(/too large to show/);
    expect(fs.statSync(path.join(dir, 'big.png')).size).toBe(big.length);
  });
});
