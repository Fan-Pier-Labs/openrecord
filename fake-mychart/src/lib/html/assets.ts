import { readFileSync } from 'fs';
import { join } from 'path';

import { mountPrefix } from '@/lib/mount';

/**
 * The portal's CSS and the pages' inline JS live as real `.css` / `.js` files
 * under `assets/`, and are read off disk rather than imported: nothing in the
 * bundle references them, so Next never compiles or rewrites them, and what the
 * page serves is byte-for-byte what the file holds. A bundler-visible import
 * would give neither — `?raw` resolves to `undefined` in a route handler under
 * this Next version, and a plain `.css` import is a stylesheet, not a string.
 *
 * Paths resolve from the working directory, which is always this package's
 * root: `bun run fake-mychart` cds here, and the image copies the source tree
 * to `/app` and starts there.
 */
const ASSET_DIR = join(process.cwd(), 'src/lib/html/assets');

const cache = new Map<string, string>();

function read(name: string): string {
  // Production reads each file once; dev re-reads so editing a stylesheet or a
  // page script shows up on reload without restarting the server.
  const cached = cache.get(name);
  if (cached !== undefined && process.env.NODE_ENV === 'production') return cached;
  const text = readFileSync(join(ASSET_DIR, name), 'utf8');
  cache.set(name, text);
  return text;
}

/**
 * A `<style>` block holding the named stylesheets, in order.
 *
 * Inline rather than linked on purpose: real MyChart serves its CSS as separate
 * files, but a `<link>` here would be a request the scraper never makes and a
 * route the fake would have to serve, for markup nothing parses.
 */
export function inlineStyle(...names: string[]): string {
  return `<style>\n${names.map(read).join('')}</style>`;
}

/**
 * A `<script>` block holding the named scripts, with `{{MP}}` replaced by the
 * mount prefix. The substitution runs per render rather than per read because
 * `POST /mode` moves the whole instance between `/MyChart` and the domain root
 * while the server is up.
 */
export function inlineScript(...names: string[]): string {
  const prefix = mountPrefix();
  const js = names.map(name => read(name).replaceAll('{{MP}}', prefix)).join('');
  return `<script>\n${js}</script>`;
}
