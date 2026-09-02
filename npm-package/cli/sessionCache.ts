/**
 * The CLI's cookie cache: `.cookie-cache/<hostname>.json` under the working
 * directory, holding a serialized MyChartRequest so a rerun skips login and 2FA.
 *
 * This owns the cache format outright — path, serialization, and the validity
 * check that decides whether a cached session is still usable. Anything that
 * wants to resume a CLI session (the CLI itself, the probes in `dev-scripts/`)
 * imports it rather than re-deriving the path, so a change here reaches every
 * caller instead of quietly breaking the ones that guessed.
 *
 * Kept apart from `cli.ts` because that module parses argv at import time.
 */

import * as fs from 'fs';
import * as path from 'path';
import { areCookiesValid } from '../../scrapers/myChart/auth/login';
import { MyChartRequest } from '../../scrapers/myChart/core/myChartRequest';

export const COOKIE_CACHE_DIR = path.join(process.cwd(), '.cookie-cache');

/** The cached session for a host, or null if there is none or it has expired. */
export async function tryLoadCachedSession(hostname: string): Promise<MyChartRequest | null> {
  const cachePath = path.join(COOKIE_CACHE_DIR, `${hostname}.json`);
  try {
    const data = await fs.promises.readFile(cachePath, 'utf-8');
    const mychartRequest = await MyChartRequest.unserialize(data);
    if (!mychartRequest) return null;
    const valid = await areCookiesValid(mychartRequest);
    if (valid) return mychartRequest;
    console.log('  Cached cookies expired, will do fresh login.');
    return null;
  } catch {
    return null;
  }
}

export async function saveCachedSession(hostname: string, mychartRequest: MyChartRequest): Promise<void> {
  await fs.promises.mkdir(COOKIE_CACHE_DIR, { recursive: true });
  const cachePath = path.join(COOKIE_CACHE_DIR, `${hostname}.json`);
  await fs.promises.writeFile(cachePath, await mychartRequest.serialize());
}
