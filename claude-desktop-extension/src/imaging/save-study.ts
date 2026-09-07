/**
 * Write a downloaded imaging study's JPEGs into the user's Downloads folder.
 *
 * This extension is a local stdio server, so the filesystem is the only
 * "download" surface it has: inline image blocks let Claude see an X-ray, but
 * they live and die with the conversation. Which is why saving exists — and
 * why the caller asks for it explicitly, rather than every viewed scan leaving
 * files behind.
 *
 * Every study gets its own folder because a CT is hundreds of slices, and
 * dumping those loose into Downloads is hostile.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { DownloadStudyJpegsResult } from './download-study';

export interface SavedStudy {
  /** Absolute path of the folder the JPEGs were written to. */
  directory: string;
  /** File names inside {@link directory}, in study order. */
  files: string[];
}

/**
 * `~/Downloads`, which is its default location on both platforms the extension
 * ships for. Falls back to the home directory when it is missing rather than
 * creating a Downloads folder for a user who deliberately does not have one.
 */
export function downloadsDir(): string {
  const downloads = path.join(os.homedir(), 'Downloads');
  return fs.existsSync(downloads) ? downloads : os.homedir();
}

/** Study and series names come from MyChart, so they can hold any character. */
function safeName(name: string, fallback: string): string {
  const cleaned = name
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 80);
  return cleaned || fallback;
}

/**
 * Claim a new folder for this study. Re-downloading a study must not overwrite
 * the copy already on disk, so a taken name gets a numeric suffix — `mkdir`
 * without `recursive` is what makes testing the name and claiming it one step,
 * where `existsSync` then `mkdir` would race.
 */
function makeStudyDir(base: string, name: string): string {
  for (let attempt = 1; attempt <= 100; attempt++) {
    const dir = path.join(base, attempt === 1 ? name : `${name}-${attempt}`);
    try {
      fs.mkdirSync(dir);
      return dir;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }
  }
  throw new Error(`Could not create a folder for this study under ${base} — 100 copies already exist.`);
}

/**
 * Write every encoded image of {@link result} to a fresh folder and return
 * where they went. Throws if the folder cannot be created or a write fails —
 * the caller keeps the inline images either way, so a failure here costs a
 * copy on disk, never the pictures themselves.
 *
 * `baseDir` exists so the tests can point this at a temp directory — the
 * product always saves to Downloads.
 */
export function saveStudyJpegs(result: DownloadStudyJpegsResult, baseDir: string = downloadsDir()): SavedStudy {
  const directory = makeStudyDir(baseDir, safeName(result.studyName, 'imaging-study'));
  const files: string[] = [];

  // Numbered by position, not by `index`: an image that failed to encode
  // leaves a hole in `index`, and gaps in a folder of files read as pictures
  // that went missing. File N is the Nth picture Claude was shown.
  result.images.forEach((img, position) => {
    const file = `${String(position + 1).padStart(3, '0')}_${safeName(img.seriesDescription, 'image')}.jpg`;
    fs.writeFileSync(path.join(directory, file), Buffer.from(img.jpegBase64, 'base64'));
    files.push(file);
  });

  return { directory, files };
}
