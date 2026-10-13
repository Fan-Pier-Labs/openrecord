// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * Write a `returnsFile` capability's payload into the user's Downloads folder.
 *
 * A file the user asked for always lands on disk — unlike an imaging study
 * (previewed inline, saved only on request), a PDF has no inline form in the
 * conversation at all. A name already taken gets a numeric suffix: a second
 * download must never overwrite the first. `wx` makes testing the name and
 * claiming it one step.
 */
import * as fs from 'fs';
import * as path from 'path';

import type { FilePayload } from '../../shared/capabilities';
import { downloadsDir } from './imaging/save-study';
import { safeFileName } from '../../scrapers/myChart/core/safeFileName';

/**
 * Save the payload under `baseDir` (Downloads) and return the absolute path
 * written. `baseDir` exists so the tests can point this at a temp directory —
 * the product always saves to Downloads.
 */
export function saveFilePayload(payload: FilePayload, baseDir: string = downloadsDir()): string {
  // The scraper already made the name safe; basename is the belt to its braces.
  const { name, ext } = path.parse(path.basename(payload.fileName));
  for (let attempt = 1; attempt <= 100; attempt++) {
    const file = path.join(baseDir, attempt === 1 ? `${name}${ext}` : `${name}-${attempt}${ext}`);
    try {
      fs.writeFileSync(file, payload.bytes, { flag: 'wx' });
      return file;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }
  }
  throw new Error(`Could not save ${payload.fileName} under ${baseDir} — 100 copies already exist.`);
}

/**
 * `save_file`: text the model wrote, under a name the model chose. The name is
 * cut to a bare basename, so it cannot reach outside `baseDir`; one with no
 * extension is saved as Markdown.
 */
export function saveTextFile(fileName: string, content: string, baseDir: string = downloadsDir()): string {
  const name = safeFileName(path.basename(fileName.replace(/\\/g, '/')), 'openrecord-export.md');
  return saveFilePayload(
    {
      fileName: /\.[A-Za-z0-9]{1,8}$/.test(name) ? name : `${name}.md`,
      mimeType: 'text/plain',
      bytes: new TextEncoder().encode(content),
    },
    baseDir,
  );
}
