/**
 * How this client hands a downloaded file to the conversation.
 *
 * A message attachment is a PDF or a picture, sometimes several MB, and
 * Claude Desktop refuses a tool result over 1MB. So the bytes always go to a
 * file — under the OS temp directory, so a glance at an attachment leaves
 * nothing in the user's Downloads — and the result says where. An image or a
 * text file that fits the same budget `inline-preview.ts` uses is shown
 * inline too; a PDF never is, because there is no content block that renders
 * one, so the path is what Claude reads it from.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { DownloadedFile } from '../../../shared/capabilities';

/** Base64 bytes a file may take inline; the rest of the 1MB is headroom for the summary. */
export const INLINE_BUDGET_BYTES = 800 * 1024;

type Content = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };

export function attachmentsDir(): string {
  return path.join(os.tmpdir(), 'openrecord-attachments');
}

function base64Length(bytes: number): number {
  return Math.ceil(bytes / 3) * 4;
}

/**
 * Write the file under `baseDir` and return its absolute path. A name already
 * taken gets a numeric suffix rather than being overwritten: two attachments
 * can share a name, and the earlier one may still be what Claude is reading.
 * `wx` makes testing the name and claiming it one step.
 */
export function saveDownloadedFile(file: DownloadedFile, baseDir: string = attachmentsDir()): string {
  fs.mkdirSync(baseDir, { recursive: true });
  const extension = path.extname(file.fileName);
  const stem = extension ? file.fileName.slice(0, -extension.length) : file.fileName;
  for (let attempt = 1; attempt <= 100; attempt++) {
    const target = path.join(baseDir, attempt === 1 ? file.fileName : `${stem}-${attempt}${extension}`);
    try {
      fs.writeFileSync(target, file.bytes, { flag: 'wx' });
      return target;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }
  }
  throw new Error(`Could not save ${file.fileName} under ${baseDir} — 100 copies already exist.`);
}

/**
 * The tool result for one downloaded file: a JSON summary naming the saved
 * path, then the content itself when it is an image or text small enough to
 * show. Takes the payload rather than running the capability, so it cannot
 * become a second path around the active-patient assertion.
 */
export function fileResult(file: DownloadedFile, baseDir?: string): { content: Content[] } {
  const savedTo = saveDownloadedFile(file, baseDir);
  const fits = base64Length(file.size) <= INLINE_BUDGET_BYTES;
  const isImage = file.mimeType.startsWith('image/');
  const isText = file.mimeType.startsWith('text/');
  const shownInline = fits && (isImage || isText);

  const note = shownInline
    ? undefined
    : !fits
      ? `The file is ${Math.round(file.size / 1024)} KB, too large to show in the conversation. It is saved at ${savedTo} — read it from there.`
      : `A ${file.mimeType} file cannot be shown in the conversation. It is saved at ${savedTo} — read it from there.`;

  const content: Content[] = [
    {
      type: 'text',
      text: JSON.stringify(
        {
          file_name: file.fileName,
          mime_type: file.mimeType,
          size_bytes: file.size,
          saved_to: savedTo,
          shown_inline: shownInline,
          ...(note ? { note } : {}),
        },
        null,
        2,
      ),
    },
  ];
  if (shownInline && isImage) {
    content.push({ type: 'image', data: Buffer.from(file.bytes).toString('base64'), mimeType: file.mimeType });
  } else if (shownInline) {
    content.push({ type: 'text', text: Buffer.from(file.bytes).toString('utf8') });
  }
  return { content };
}
