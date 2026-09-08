import { describe, expect, it, afterAll } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { writeAttachmentFile } from '../capabilityActions';
import type { MessageAttachmentFile } from '../../../shared/capabilities';

/**
 * The CLI's rendering of a deliversFile payload: the attachment's bytes on
 * disk under the name MyChart gave it. The silent failure modes are a name
 * that is a path, a name that is nothing, and a re-download overwriting the
 * first copy.
 */

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'write-attachment-'));
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

const PDF = new TextEncoder().encode('%PDF-1.4\n%fake\n');

function attachment(overrides: Partial<MessageAttachmentFile> = {}): MessageAttachmentFile {
  return {
    conversationId: 'CONV-1',
    dcsId: 'WP-DCS-1',
    name: 'proof of coverage.pdf',
    fileExtension: 'PDF',
    mimeType: 'application/pdf',
    bytes: PDF,
    ...overrides,
  };
}

describe('writeAttachmentFile', () => {
  it('writes the bytes under the attachment’s own name, creating the directory', async () => {
    const dir = path.join(tmpDir, 'nested', 'out');
    const written = await writeAttachmentFile(attachment(), dir);
    expect(written).toBe(path.join(dir, 'proof of coverage.pdf'));
    expect(fs.readFileSync(written)).toEqual(Buffer.from(PDF));
  });

  it('keeps a second download of the same name beside the first', async () => {
    const dir = path.join(tmpDir, 'twice');
    const first = await writeAttachmentFile(attachment(), dir);
    const second = await writeAttachmentFile(attachment({ bytes: new Uint8Array([1, 2, 3]) }), dir);
    expect(path.basename(first)).toBe('proof of coverage.pdf');
    expect(path.basename(second)).toBe('proof of coverage-2.pdf');
    expect(fs.readFileSync(first)).toEqual(Buffer.from(PDF));
  });

  it('cannot be steered outside the output directory by the name', async () => {
    const dir = path.join(tmpDir, 'safe');
    const written = await writeAttachmentFile(attachment({ name: '../../escape.pdf' }), dir);
    expect(path.dirname(written)).toBe(dir);
    expect(path.basename(written)).toBe('_.._escape.pdf');
  });

  it('falls back to the extension when the name is empty', async () => {
    const dir = path.join(tmpDir, 'unnamed');
    expect(path.basename(await writeAttachmentFile(attachment({ name: '' }), dir))).toBe('attachment.pdf');
    expect(path.basename(await writeAttachmentFile(attachment({ name: '', fileExtension: '' }), dir))).toBe('attachment');
  });
});
