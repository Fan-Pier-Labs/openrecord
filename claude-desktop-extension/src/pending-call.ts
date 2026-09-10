/**
 * Parks a tool call that outruns Claude Desktop's request timeout, so its
 * result can be collected by id with `check_pending_call`.
 *
 * The timeout is undocumented. The one measurement on record is in Claude
 * Desktop's client log (~/Library/Logs/Claude/mcp.log): a `notifications/
 * cancelled` with "MCP error -32001: Request timed out" 197 s after the
 * request (June 2026 build, on `initialize`); four minutes is the figure
 * usually quoted. DEADLINE_MS sits under both and above the scrapers'
 * 2-minute per-request deadline (scrapers/http.ts).
 *
 * Calls are not serialized — the same log shows Claude Desktop issuing a
 * second call 5.5 s after an unanswered first — so several may park. A
 * parked call refuses one thing: a repeat of itself with the same arguments,
 * the retry that would send a message twice. switch_proxy_target also
 * refuses while a parked read on the account is still running
 * (`unsettledCallOnAccount`): MyChart's active patient is server-side state,
 * and switching under a running read hands it the wrong chart.
 *
 * Abandoning a call only stops waiting for it. Nothing in the scraper core
 * takes an abort signal, so the work runs on and a write already sent lands.
 */

import { randomUUID } from 'crypto';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export const CHECK_TOOL = 'check_pending_call';
export const DEADLINE_MS = 150_000;
export const DEADLINE_LABEL = '2.5 minutes';
/** From a call's start, after which it counts as abandoned; also how long an unread result is kept. */
export const MAX_RUN_MS = 10 * 60_000;

interface Parked {
  id: string;
  tool: string;
  key: string;
  account: string | null;
  startedAt: number;
  promise: Promise<CallToolResult>;
  result?: CallToolResult;
  settledAt?: number;
  /** Nobody is waiting any more. The entry stays until settled so the proxy guard still sees the scrape. */
  abandoned?: boolean;
}

const parked = new Map<string, Parked>();

const ABANDON_MEANS =
  'Abandoning only stops waiting: the work runs on in the background until it finishes, and a message or request it already sent still lands.';

function text(message: string, isError = false): CallToolResult {
  return { content: [{ type: 'text', text: message }], ...(isError ? { isError: true } : {}) };
}

function elapsed(startedAt: number, now: number): string {
  const secs = Math.max(0, Math.round((now - startedAt) / 1000));
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

/**
 * Sorted keys at every level, so argument order cannot make two calls differ.
 * Not a `JSON.stringify` replacer array: that is an allowlist applied at every
 * depth, so a nested object's keys are dropped and it serialises as `{}`.
 */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    const keys = Object.keys(o).filter((k) => o[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** The result if it arrives within `ms`, else undefined. Never rejects. */
function settleWithin(promise: Promise<CallToolResult>, ms: number): Promise<CallToolResult | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

function sweep(now: number): void {
  for (const [id, p] of parked) {
    if (p.settledAt === undefined) {
      if (now - p.startedAt >= MAX_RUN_MS) p.abandoned = true;
    } else if (p.abandoned || now - p.settledAt >= MAX_RUN_MS) {
      parked.delete(id);
    }
  }
}

/** Run a tool's handler under the deadline. `deadlineMs` is the test seam. */
export async function runGuarded(
  tool: string,
  args: Record<string, unknown>,
  fn: () => CallToolResult | Promise<CallToolResult>,
  deadlineMs = DEADLINE_MS,
): Promise<CallToolResult> {
  const now = Date.now();
  sweep(now);
  const key = `${tool} ${canonical(args)}`;
  const same = [...parked.values()].find((p) => p.key === key && !p.abandoned);
  if (same) {
    const state = same.settledAt === undefined ? `running (started ${elapsed(same.startedAt, now)} ago)` : 'finished, with its result unread';
    return text(`This exact call is already ${state}. Call ${CHECK_TOOL} with id "${same.id}" instead of running it again.`, true);
  }

  const promise = Promise.resolve()
    .then(fn)
    .catch((err: unknown) => text(`Error: ${(err as Error).message}`, true));
  const result = await settleWithin(promise, deadlineMs);
  if (result) return result;

  const account = typeof args.account === 'string' ? args.account.trim().toLowerCase() : null;
  const entry: Parked = { id: randomUUID(), tool, key, account, startedAt: now, promise };
  parked.set(entry.id, entry);
  void promise.then((r) => {
    entry.result = r;
    entry.settledAt = Date.now();
  });
  return text(
    `${tool} (id "${entry.id}") is still running after ${DEADLINE_LABEL} and keeps running in the background for up ` +
      `to 10 minutes. Call ${CHECK_TOOL} with that id to wait for and read its result. Do NOT call ${tool} again ` +
      'with the same arguments; it would be refused. Other tools are unaffected.',
  );
}

/** The parked call still reading this account's chart, abandoned or not. */
export function unsettledCallOnAccount(account: string): { tool: string; id: string } | undefined {
  sweep(Date.now());
  const wanted = account.trim().toLowerCase();
  return [...parked.values()].find((p) => p.settledAt === undefined && p.account === wanted);
}

/** The `check_pending_call` handler. `deadlineMs` is the test seam. */
export async function checkPendingCall(
  { id, wait, abandon }: { id: string; wait?: boolean; abandon?: boolean },
  deadlineMs = DEADLINE_MS,
): Promise<CallToolResult> {
  const now = Date.now();
  sweep(now);
  const p = parked.get(id);
  if (!p) return text(`No pending call has id "${id}": it was already read, abandoned, or given up on after 10 minutes.`, true);

  if (abandon) {
    if (p.settledAt === undefined) p.abandoned = true;
    else parked.delete(id);
    const guard = p.abandoned && p.account ? ` switch_proxy_target on ${p.account} refuses until it finishes.` : '';
    return text(`Abandoned ${p.tool}. ${ABANDON_MEANS}${guard}`);
  }
  if (p.abandoned) return text(`${p.tool} was abandoned, or ran past 10 minutes; its result is discarded. ${ABANDON_MEANS}`, true);

  // A wait that would run past the cap is cut to the cap, and running that
  // out means the cap is reached even if the test clock never moved.
  const remaining = MAX_RUN_MS - (now - p.startedAt);
  const clipped = remaining <= deadlineMs;
  const result = p.result ?? (wait === false ? undefined : await settleWithin(p.promise, clipped ? remaining : deadlineMs));
  if (result) {
    parked.delete(id);
    return result;
  }
  if (wait !== false && clipped) {
    p.abandoned = true;
    return text(`Gave up on ${p.tool} after 10 minutes; its result is discarded. ${ABANDON_MEANS}`, true);
  }
  return text(
    `${p.tool} (id "${id}") is still running (${elapsed(p.startedAt, Date.now())} so far, of at most 10 minutes). ` +
      `Call ${CHECK_TOOL} again to keep waiting, or with abandon: true to stop waiting. ${ABANDON_MEANS}`,
  );
}

/** Test seam. */
export function resetPendingCalls(): void {
  parked.clear();
}
