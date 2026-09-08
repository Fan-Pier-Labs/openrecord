import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FULL_SCRAPE_CAPABILITIES, writeDownloadedFile } from '../capabilityActions';

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'openrecord-cli-file-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe('writeDownloadedFile', () => {
  it('creates the output directory and writes the bytes under the file\'s own name', async () => {
    const out = path.join(dir, 'nested', 'attachments');
    const filePath = await writeDownloadedFile(
      { fileName: 'plan.pdf', mimeType: 'application/pdf', size: 3, bytes: new Uint8Array([1, 2, 3]) },
      out,
    );
    expect(filePath).toBe(path.join(out, 'plan.pdf'));
    expect(fs.readFileSync(filePath)).toEqual(Buffer.from([1, 2, 3]));
  });

  it('keeps file downloads out of the default full scrape', () => {
    expect(FULL_SCRAPE_CAPABILITIES.some((c) => c.returnsFile)).toBe(false);
  });
});
