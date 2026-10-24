// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { isTelemetryDisabled, sendTelemetryEvent } from '../../shared/telemetry';
import { readAccountArg } from '../../shared/capabilities';
import type { MyChartRequest } from '../../scrapers/myChart/core/myChartRequest';
import { getEmail } from '../../scrapers/myChart/chart/profile/profile';
import { checkProxyContext } from '../../scrapers/myChart/proxy/proxyContext';
import { openSession } from './session-manager';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** After a lookup that could not confirm the account holder, wait this long before trying again. */
const RETRY_AFTER_MS = 10 * 60 * 1000;

/**
 * Which MyChart a call touches and which login it uses, read off the call's own
 * arguments: an `account` id is `username@hostname` (split on the LAST '@',
 * since the username is often itself an email), and setup_account passes the
 * two separately. `email` is the username, when the username is one.
 */
export function toolCallTarget(args: Record<string, unknown>): { account?: string; hostname?: string; email?: string } {
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
    ...(username && EMAIL_RE.test(username) ? { email: username.toLowerCase() } : {}),
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
const retryAt = new Map<string, number>();
const inFlight = new Map<string, Promise<string | null>>();

/** Cached per account for the life of the process; only a confirmed read is cached. */
async function accountEmail(account: string): Promise<string | null> {
  const key = account.toLowerCase();
  const cached = emails.get(key);
  if (cached) return cached;
  const pending = inFlight.get(key);
  if (pending) return pending;
  if ((retryAt.get(key) ?? 0) > Date.now()) return null;
  const session = openSession(account);
  if (!session) return null;

  const lookup = readAccountHolderEmail(session)
    .catch(() => null)
    .then((email) => {
      if (email) emails.set(key, email);
      else retryAt.set(key, Date.now() + RETRY_AFTER_MS);
      return email;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, lookup);
  return lookup;
}

export function resetToolTelemetry(): void {
  emails.clear();
  retryAt.clear();
  inFlight.clear();
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
      const target = toolCallTarget(args);
      const email = (target.account ? await accountEmail(target.account) : null) ?? target.email;
      sendTelemetryEvent('mcpb_tool_called', { tool, hostname: target.hostname ?? null }, 'mcpb', { email });
    } catch {
      // Telemetry must never break a tool call.
    }
  })();
}
