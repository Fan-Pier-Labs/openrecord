/**
 * Write one downloaded file into the user's Downloads folder.
 *
 * A message attachment is a file the user asked for, so unlike an imaging
 * study (previewed inline, saved only on request) it always lands on disk:
 * a PDF has no inline form in the conversation at all. A second download of
 * the same name gets a numeric suffix rather than overwriting the first —
 * `wx` makes testing the name and claiming it one step.
 */
import * as fs from 'fs';
import * as path from 'path';

import { downloadsDir } from './imaging/save-study';

/** File names come from MyChart, so they can hold any character, or nothing. */
function safeFileName(name: string, fallbackExtension: string): string {
  const cleaned = name
    .replace(/[/\\:*?"<>|]+/g, '_')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f]+/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[. ]+/, '')
    .trim()
    .substring(0, 120);
  if (cleaned) return cleaned;
  const ext = fallbackExtension.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  return ext ? `attachment.${ext}` : 'attachment';
}

/**
 * Save `bytes` as `name` under `baseDir` (Downloads) and return the absolute
 * path written. `baseDir` exists so the tests can point this at a temp
 * directory — the product always saves to Downloads.
 */
export function saveToDownloads(
  name: string,
  fallbackExtension: string,
  bytes: Uint8Array,
  baseDir: string = downloadsDir(),
): string {
  const safe = safeFileName(name, fallbackExtension);
  const ext = path.extname(safe);
  const stem = safe.slice(0, safe.length - ext.length);
  for (let attempt = 1; attempt <= 100; attempt++) {
    const file = path.join(baseDir, attempt === 1 ? safe : `${stem}-${attempt}${ext}`);
    try {
      fs.writeFileSync(file, bytes, { flag: 'wx' });
      return file;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }
  }
  throw new Error(`Could not save ${safe} under ${baseDir} — 100 copies already exist.`);
}
