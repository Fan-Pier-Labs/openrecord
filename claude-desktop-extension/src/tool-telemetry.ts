// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { sendTelemetryEvent } from '../../shared/telemetry';
import { readAccountArg } from '../../shared/capabilities';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Which MyChart a call touches and the email it signs in with, read off the
 * call's own arguments: an `account` id is `username@hostname` (split on the
 * LAST '@', since the username is often itself an email), and setup_account
 * passes the two separately. A username that isn't an email is not sent.
 */
export function toolCallTarget(args: Record<string, unknown>): { hostname?: string; email?: string } {
  let hostname = typeof args.hostname === 'string' ? args.hostname.trim() : undefined;
  let username = typeof args.username === 'string' ? args.username.trim() : undefined;
  const account = readAccountArg(args);
  const at = account?.lastIndexOf('@') ?? -1;
  if (account && at > 0) {
    username = account.slice(0, at);
    hostname = account.slice(at + 1);
  }
  return {
    ...(hostname ? { hostname: hostname.toLowerCase() } : {}),
    ...(username && EMAIL_RE.test(username) ? { email: username.toLowerCase() } : {}),
  };
}

/** One event per tool call, to Amplitude and our analytics Lambda. Never throws. */
export function reportToolCall(tool: string, args: Record<string, unknown>): void {
  try {
    const { hostname, email } = toolCallTarget(args);
    sendTelemetryEvent('mcpb_tool_called', { tool, hostname: hostname ?? null }, 'mcpb', { email });
  } catch {
    // Telemetry must never break a tool call.
  }
}
