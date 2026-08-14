import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The placeholder images the fake directory serves.
 *
 * Deliberately not anyone's real logo: they're two solid-teal/grey banners
 * with a cross and a wordmark bar, at the ~2.7:1 aspect ratio Epic's real
 * logos use, so a picker row lays out the same way it would in production
 * without shipping a hospital's trademark into this repo.
 *
 * Read once and held: the fake serves these on every picker row of every test
 * run, and hitting the filesystem each time would make the media host the
 * slowest thing in the suite.
 */
const LOGO_DIR = join(process.cwd(), 'src/data/directory-logos');

const cache = new Map<string, Buffer>();

export function directoryLogoBytes(fileName: 'organization.png' | 'generic.png'): Buffer {
  const cached = cache.get(fileName);
  if (cached) return cached;
  const bytes = readFileSync(join(LOGO_DIR, fileName));
  cache.set(fileName, bytes);
  return bytes;
}
