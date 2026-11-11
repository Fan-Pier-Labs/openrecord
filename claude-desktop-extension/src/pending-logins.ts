// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * In-memory store for in-flight login attempts that are waiting on a 2FA
 * code from the user. `setup_account`, or a data tool that had to sign in,
 * produces a `pending_id` when MyChart sends a 2FA code; the user gives
 * Claude the code in chat; Claude then calls `complete_2fa(pending_id, code)`
 * to finish.
 *
 * Entries expire after 10 minutes to keep the map bounded.
 */

import { randomUUID } from 'crypto';
import type { MyChartRequest } from '../../scrapers/myChart/core/myChartRequest';
import type { TwoFaDeliveryInfo } from '../../scrapers/myChart/auth/login';
import { normalizeHostname } from './credential-store';

interface PendingLogin {
  hostname: string;
  username: string;
  password: string;
  mychartRequest: MyChartRequest;
  delivery?: TwoFaDeliveryInfo | undefined;
  expiresAt: number;
}

const pending = new Map<string, PendingLogin>();

const TTL_MS = 10 * 60_000;

function gc(): void {
  const now = Date.now();
  for (const [id, p] of pending) {
    if (p.expiresAt < now) pending.delete(id);
  }
}

export function addPending(args: Omit<PendingLogin, 'expiresAt'>): string {
  gc();
  const id = randomUUID();
  pending.set(id, { ...args, hostname: normalizeHostname(args.hostname), expiresAt: Date.now() + TTL_MS });
  return id;
}

export function takePending(id: string): PendingLogin | null {
  gc();
  const entry = pending.get(id);
  if (!entry) return null;
  pending.delete(id);
  return entry;
}

/**
 * The unexpired pending login for an account, if one is waiting on a code.
 * A data tool that finds one hands back its id rather than signing in again —
 * every fresh sign-in would text or email the user another code.
 */
export function findPendingFor(hostname: string, username: string): { id: string; delivery?: TwoFaDeliveryInfo | undefined } | null {
  gc();
  // Both sides normalised: setup_account and a data tool may spell the same
  // account differently, and a miss here means a second code.
  const host = normalizeHostname(hostname);
  const user = username.trim().toLowerCase();
  for (const [id, p] of pending) {
    if (p.hostname === host && p.username.trim().toLowerCase() === user) return { id, delivery: p.delivery };
  }
  return null;
}

export function discardPending(id: string): void {
  pending.delete(id);
}
