// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * Keeps a newer payload downloaded, and says so when it can't.
 *
 * At startup and then daily (Claude Desktop keeps the server alive for days),
 * ask the site for the current version and download it if it is newer than the
 * one running. A download takes effect the next time Claude Desktop starts the
 * extension. Success is silent; failure is not — once an update this launcher
 * knows about cannot be installed, every tool result tells the user to
 * reinstall from the site, because the launcher can't fix itself and nothing
 * else will.
 *
 * "Couldn't reach the site" is not a failure: it changes nothing, the way the
 * old update notice treated it.
 */

import { checkVersion } from '../../../scrapers/metadata/version';
import { installPayload } from './install';
import { VERSIONS_DIR, installState, pruneVersions } from './payloads';

const RECHECK_EVERY_MS = 24 * 60 * 60 * 1000;
const SITE_URL = 'https://openrecord.fanpierlabs.com/';

let notice: string | null = null;

export function updateNotice(): string | null {
  return notice;
}

function reinstallNotice(version: string, why: string, url: string = SITE_URL): string {
  // Addressed to the model: the result is read by Claude, not shown verbatim.
  return (
    `OpenRecord could not update itself to v${version} (${why}). The user needs to reinstall the ` +
    `extension: download it again from ${url} and open the file to install it over this one.\n` +
    '(Mention this to the user at the end of your reply.)'
  );
}

export function reportStartupFailure(version: string): void {
  notice = reinstallNotice(version, 'the downloaded version failed to start');
}

export async function checkForUpdate(
  runningVersion: string,
  options: { versionsDir?: string; baseUrl?: string; publicKey?: string; manifestUrl?: string } = {},
): Promise<void> {
  const versionsDir = options.versionsDir ?? VERSIONS_DIR;
  const check = await checkVersion({
    currentVersion: runningVersion,
    target: 'mcpb',
    ...(options.manifestUrl ? { url: options.manifestUrl } : {}),
  });
  if (!check) return;
  const latest = check.latestVersion;
  if (!check.updateAvailable) {
    notice = null;
    return;
  }
  const state = installState(latest, versionsDir);
  if (state === 'bad') {
    notice = reinstallNotice(latest, 'the downloaded version failed to start', check.updateUrl);
    return;
  }
  if (state === 'missing') {
    try {
      await installPayload(latest, {
        versionsDir,
        ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
        ...(options.publicKey ? { publicKey: options.publicKey } : {}),
      });
    } catch (err) {
      process.stderr.write(`[openrecord:launcher] update to ${latest} failed: ${String(err)}\n`);
      notice = reinstallNotice(latest, 'the download could not be installed', check.updateUrl);
      return;
    }
    pruneVersions([latest, runningVersion], versionsDir);
  }
  notice = null;
}

export function startUpdates(runningVersion: () => string): Promise<void> {
  setInterval(() => void checkForUpdate(runningVersion()), RECHECK_EVERY_MS).unref();
  return checkForUpdate(runningVersion());
}
