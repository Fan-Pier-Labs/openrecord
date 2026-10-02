/**
 * {@link ExportFolder} on the local filesystem, for the Node clients (CLI,
 * Claude Desktop extension). Node only.
 */

import { promises as fs, mkdirSync } from 'fs';
import * as path from 'path';

import type { ExportFolder } from './exportEverything';

/** A folder handle that refuses any path climbing out of `root`. */
export function nodeExportFolder(dir: string): ExportFolder {
  const root = path.resolve(dir);
  const resolve = (relativePath: string) => {
    const full = path.resolve(root, ...relativePath.split('/'));
    if (full !== root && !full.startsWith(root + path.sep)) throw new Error(`Refusing to write outside the export: ${relativePath}`);
    return full;
  };
  return {
    async write(relativePath, data) {
      const full = resolve(relativePath);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, data);
    },
    read: (relativePath) => fs.readFile(resolve(relativePath), 'utf8'),
  };
}

/**
 * Claim a fresh `<baseDir>/<name>` folder; a second export the same day gets
 * `<name> (2)` rather than writing over the first. `mkdir` without `recursive`
 * makes testing the name and claiming it one step.
 */
export function createExportDir(baseDir: string, name: string): string {
  for (let n = 1; n <= 100; n++) {
    const dir = path.resolve(baseDir, n === 1 ? name : `${name} (${n})`);
    try {
      mkdirSync(dir);
      return dir;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }
  }
  throw new Error(`Could not create an export folder under ${baseDir} — 100 already exist.`);
}

export function exportDirName(hostname: string, now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `OpenRecord export - ${hostname.replace(/[^a-zA-Z0-9.-]+/g, '_')} - ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
