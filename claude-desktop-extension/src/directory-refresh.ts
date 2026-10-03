/**
 * Keeps `search_mycharts` on a recent run of the refresh behind the bundled
 * `mychart-instances.json`, rather than on the one from this extension's
 * release.
 *
 * A run is minutes of requests, so it never happens inside a search: at
 * startup the last run's result is loaded from disk, and if it is older than
 * a month (or there is none) a new run starts in the background. Until it
 * finishes, search answers from what it already had.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { MyChartInstanceSeed } from '../../scrapers/list-all-mycharts/directory';
import {
  DIRECTORY_REFRESH_INTERVAL_MS,
  refreshMyChartDirectory,
  useRefreshedMyCharts,
} from '../../scrapers/list-all-mycharts/searchDirectory';

const CACHE_PATH = path.join(os.homedir(), '.openrecord-mcpb', 'mychart-instances.json');

interface SavedRefresh {
  refreshedAt: string;
  instances: MyChartInstanceSeed[];
}

/**
 * How often to ask whether the saved run is stale. `setTimeout` can't wait a
 * month — anything over ~24.8 days overflows and fires at once, which would
 * loop the crawl — so a daily check decides instead.
 */
const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;

/**
 * Load the saved run, then refresh whenever it is over a month old: now, if it
 * already is, and otherwise when a daily check finds it so. The runs happen in
 * the background and never throw — a refresh that fails leaves search on the
 * list it had, and the next daily check tries again.
 */
export function startDirectoryRefresh(cachePath: string = CACHE_PATH): void {
  let refreshedAt = 0;
  try {
    const saved = JSON.parse(fs.readFileSync(cachePath, 'utf8')) as SavedRefresh;
    if (saved.instances.length > 0) {
      useRefreshedMyCharts(saved.instances);
      refreshedAt = Date.parse(saved.refreshedAt) || 0;
    }
  } catch {
    // No saved run yet, or an unreadable one: refresh.
  }

  let running = false;
  const refreshIfStale = async () => {
    if (running || Date.now() - refreshedAt < DIRECTORY_REFRESH_INTERVAL_MS) return;
    running = true;
    try {
      const instances = await refreshMyChartDirectory();
      if (instances.length === 0) return;
      refreshedAt = Date.now();
      fs.mkdirSync(path.dirname(cachePath), { recursive: true });
      const saved: SavedRefresh = { refreshedAt: new Date(refreshedAt).toISOString(), instances };
      fs.writeFileSync(cachePath, JSON.stringify(saved));
    } catch {
      // Offline or Epic is down: keep searching what we have, try tomorrow.
    } finally {
      running = false;
    }
  };
  void refreshIfStale();
  setInterval(() => void refreshIfStale(), CHECK_EVERY_MS).unref();
}
