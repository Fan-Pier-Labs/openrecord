/**
 * Non-blocking update checker that compares the local version against the
 * latest GitHub release. Fire-and-forget — never throws or blocks the caller.
 */

import { compareVersions } from 'compare-versions';

import { logger } from './logger';
const GITHUB_RELEASES_URL =
  'https://api.github.com/repos/Fan-Pier-Labs/openrecord/releases/latest';

export interface UpdateCheckResult {
  latestVersion: string;
  updateAvailable: boolean;
}

export async function checkForUpdate(opts: {
  currentVersion: string;
  packageName: string;
  logger?: { warn: (msg: string) => void };
}): Promise<UpdateCheckResult | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(GITHUB_RELEASES_URL, {
      signal: controller.signal,
      headers: { Accept: 'application/vnd.github.v3+json' },
    });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const data = (await res.json()) as { tag_name?: string };
    if (!data.tag_name) return null;

    const latestVersion = data.tag_name.replace(/^v/, '');
    const updateAvailable = compareVersions(opts.currentVersion, latestVersion) < 0;

    if (updateAvailable) {
      const msg = `\n  Update available: v${opts.currentVersion} → v${latestVersion} — https://github.com/Fan-Pier-Labs/openrecord/releases/latest\n`;
      if (opts.logger) {
        opts.logger.warn(msg);
      } else {
        logger.warn(msg);
      }
    }

    return { latestVersion, updateAvailable };
  } catch {
    return null;
  }
}
