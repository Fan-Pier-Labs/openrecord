/**
 * Write a `returnsFile` capability's payload into the user's Downloads folder.
 *
 * A PDF has no inline rendering in a tool result, so the file on disk *is*
 * the deliverable, and it is written on every call rather than behind an
 * opt-in like the imaging previews. A name already taken gets a numeric
 * suffix: re-downloading a statement must never overwrite the copy on disk.
 */
import * as fs from 'fs';
import * as path from 'path';

import type { FilePayload } from '../../shared/capabilities';
import { downloadsDir } from './imaging/save-study';

/** Claim a file name, `wx` so testing and creating are one step. */
export function saveFilePayload(payload: FilePayload, baseDir: string = downloadsDir()): string {
  const { name, ext } = path.parse(payload.fileName);
  for (let attempt = 1; attempt <= 100; attempt++) {
    const file = path.join(baseDir, attempt === 1 ? payload.fileName : `${name}-${attempt}${ext}`);
    try {
      fs.writeFileSync(file, payload.bytes, { flag: 'wx' });
      return file;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }
  }
  throw new Error(`Could not save ${payload.fileName} under ${baseDir} — 100 copies already exist.`);
}
