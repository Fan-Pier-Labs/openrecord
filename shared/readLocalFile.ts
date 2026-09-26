/**
 * `CapabilityContext.readFile` for the Node clients (CLI, Claude Desktop
 * extension): a message attachment is a path on this machine. Node only.
 */

import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { FilePayload } from '../scrapers/myChart/core/filePayload';

// Only the multipart part's Content-Type; MyChart judges a file by its
// extension against GetComposeSettings, so an unlisted type still goes.
const MIME_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  heic: 'image/heic',
  txt: 'text/plain',
  rtf: 'application/rtf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  m4v: 'video/x-m4v',
};

export async function readLocalFile(ref: string): Promise<FilePayload> {
  const resolved = path.resolve(ref.startsWith('~/') ? path.join(os.homedir(), ref.slice(2)) : ref);
  const stat = await fs.stat(resolved).catch(() => undefined);
  if (!stat?.isFile()) throw new Error(`Attachment not found: ${resolved}`);
  const fileName = path.basename(resolved);
  const ext = path.extname(fileName).slice(1).toLowerCase();
  return {
    fileName,
    mimeType: MIME_TYPES[ext] ?? 'application/octet-stream',
    bytes: new Uint8Array(await fs.readFile(resolved)),
  };
}
