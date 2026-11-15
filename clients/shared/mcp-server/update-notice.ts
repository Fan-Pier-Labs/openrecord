// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * Tells someone on an old .mcpb (or mychart-cli) that a new one is out, at the
 * bottom of every tool result. The server has no UI of its own between calls,
 * so a tool result is the only place a notice can reach the user.
 *
 * The check runs in the background — at startup, then daily, since Claude
 * Desktop keeps the server alive for days — and a tool call only reads its last
 * answer, so no call ever waits on our site. "Couldn't tell" keeps the previous
 * answer rather than clearing it.
 */

import { checkVersion, formatUpdateNotice, type VersionTarget } from '../../../scrapers/metadata/version';

const RECHECK_EVERY_MS = 24 * 60 * 60 * 1000;

let notice: string | null = null;

async function refresh(target: VersionTarget, currentVersion: string): Promise<void> {
  const check = await checkVersion({ currentVersion, target });
  if (check) notice = check.updateAvailable ? formatUpdateNotice(check) : null;
}

/** `target` is the release this host compares against: the .mcpb, or mychart-cli on npm. */
export function startUpdateCheck(target: VersionTarget, currentVersion: string): Promise<void> {
  setInterval(() => void refresh(target, currentVersion), RECHECK_EVERY_MS).unref();
  return refresh(target, currentVersion);
}

export function withUpdateNotice<T extends { content: unknown[] }>(result: T): T {
  if (!notice) return result;
  // Addressed to the model: the result is read by Claude, not shown verbatim.
  const text = `OpenRecord ${notice}\n(Mention this update to the user at the end of your reply.)`;
  return { ...result, content: [...result.content, { type: 'text', text }] };
}
