/**
 * In-memory store for in-flight login attempts that are waiting on a 2FA
 * code from the user. The `setup_account` tool produces a `pending_id`
 * when MyChart asks for a 2FA code; the user gives Claude the code in
 * chat; Claude then calls `complete_2fa(pending_id, code)` to finish.
 *
 * Entries expire after 10 minutes to keep the map bounded.
 */

import { randomUUID } from 'crypto';
import type { MyChartRequest } from '../../scrapers/myChart/core/myChartRequest';

interface PendingLogin {
  hostname: string;
  username: string;
  password: string;
  mychartRequest: MyChartRequest;
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
  pending.set(id, { ...args, expiresAt: Date.now() + TTL_MS });
  return id;
}

export function takePending(id: string): PendingLogin | null {
  gc();
  const entry = pending.get(id);
  if (!entry) return null;
  pending.delete(id);
  return entry;
}

export function discardPending(id: string): void {
  pending.delete(id);
}
