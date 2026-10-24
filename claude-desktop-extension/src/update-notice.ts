// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * Tells someone on an old .mcpb that a new one is out, at the bottom of every
 * tool result. The extension has no UI of its own between calls, so a tool
 * result is the only place a notice can reach the user.
 *
 * The check runs in the background — at startup, then daily, since Claude
 * Desktop keeps the server alive for days — and a tool call only reads its last
 * answer, so no call ever waits on our site. "Couldn't tell" keeps the previous
 * answer rather than clearing it.
 *
 * Unlike the CLI's, this check ignores MYCHART_CLI_TELEMETRY_DISABLED: an
 * extension nobody can tell is outdated stays outdated, and it sends nothing
 * but the request itself.
 */

import { version as MCPB_VERSION } from '../manifest.json';
import { checkVersion, fetchVersionManifest, formatUpdateNotice } from '../../scrapers/metadata/version';

const RECHECK_EVERY_MS = 24 * 60 * 60 * 1000;

let notice: string | null = null;

async function refresh(currentVersion: string): Promise<void> {
  // Fetched here and passed in because checkVersion skips its own fetch when
  // telemetry is off.
  const manifest = await fetchVersionManifest();
  if (!manifest) return;
  const check = await checkVersion({ currentVersion, target: 'mcpb', manifest });
  if (check) notice = check.updateAvailable ? formatUpdateNotice(check) : null;
}

/** `currentVersion` is a parameter so a test can pretend to be an old install. */
export function startUpdateCheck(currentVersion: string = MCPB_VERSION): Promise<void> {
  setInterval(() => void refresh(currentVersion), RECHECK_EVERY_MS).unref();
  return refresh(currentVersion);
}

export function withUpdateNotice<T extends { content: unknown[] }>(result: T): T {
  if (!notice) return result;
  // Addressed to the model: the result is read by Claude, not shown verbatim.
  const text = `OpenRecord ${notice}\n(Mention this update to the user at the end of your reply.)`;
  return { ...result, content: [...result.content, { type: 'text', text }] };
}
