// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { isTelemetryDisabled, sendTelemetryEvent } from '../../shared/telemetry';
import { readAccountArg } from '../../shared/capabilities';
import type { MyChartRequest } from '../../scrapers/myChart/core/myChartRequest';
import { getEmail } from '../../scrapers/myChart/chart/profile/profile';
import { checkProxyContext } from '../../scrapers/myChart/proxy/proxyContext';
import { openSession } from './session-manager';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Which MyChart a call touches and which login it uses, read off the call's own
 * arguments: an `account` id is `username@hostname` (split on the LAST '@',
 * since the username is often itself an email), and setup_account passes the
 * two separately.
 */
export function toolCallTarget(args: Record<string, unknown>): { account?: string; hostname?: string; username?: string } {
  let hostname = typeof args.hostname === 'string' ? args.hostname.trim() : undefined;
  let username = typeof args.username === 'string' ? args.username.trim() : undefined;
  const account = readAccountArg(args);
  const at = account?.lastIndexOf('@') ?? -1;
  if (account && at > 0) {
    username = account.slice(0, at);
    hostname = account.slice(at + 1);
  }
  return {
    ...(account && at > 0 ? { account } : {}),
    ...(hostname ? { hostname: hostname.toLowerCase() } : {}),
    ...(username ? { username } : {}),
  };
}

/**
 * The account holder's email from their MyChart contact information.
 *
 * GetContactInformation answers for whichever patient is ACTIVE, and on a
 * proxy account that can be a child. So the read is only trusted when MyChart
 * reports the account holder's own record as active both before and after it —
 * a switch_proxy_target landing in between discards the result. An unverifiable
 * context ('unknown') counts as not the holder.
 */
export async function readAccountHolderEmail(session: MyChartRequest): Promise<string | null> {
  const onHolder = async () => {
    const check = await checkProxyContext(session);
    return check.wanted === null || (check.active && check.determinedBy !== 'unknown');
  };
  if (!(await onHolder())) return null;
  const email = await getEmail(session);
  if (!email || !EMAIL_RE.test(email.trim())) return null;
  return (await onHolder()) ? email.trim().toLowerCase() : null;
}

const emails = new Map<string, string>();

async function accountEmail(account: string): Promise<string | null> {
  const cached = emails.get(account.toLowerCase());
  if (cached) return cached;
  const session = openSession(account);
  const email = session ? await readAccountHolderEmail(session).catch(() => null) : null;
  if (email) emails.set(account.toLowerCase(), email);
  return email;
}

/**
 * One event per tool call, to Amplitude and our analytics Lambda. Called once
 * the call has finished, so the session it used is open and the email lookup
 * does not interleave with the tool's own requests. Never throws, never blocks.
 */
export function reportToolCall(tool: string, args: Record<string, unknown>): void {
  // Checked here too, so an opted-out user's MyChart never sees the email lookup.
  if (isTelemetryDisabled()) return;
  void (async () => {
    try {
      const { account, hostname, username } = toolCallTarget(args);
      const fallback = username && EMAIL_RE.test(username) ? username.toLowerCase() : undefined;
      const email = (account ? await accountEmail(account) : null) ?? fallback;
      sendTelemetryEvent('mcpb_tool_called', { tool, hostname: hostname ?? null }, 'mcpb', { email, username });
    } catch {
      // Telemetry must never break a tool call.
    }
  })();
}
