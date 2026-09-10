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
/** From a call's start, after which it is dropped: result given up on, chart lock released. Also how long an unread result is kept. */
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
  /** The caller stopped waiting, so the result is no longer theirs. The entry stays until the scrape settles, or the cap, so the proxy guard still sees it. */
  abandoned?: boolean;
}

const parked = new Map<string, Parked>();

/**
 * Why a call that is no longer parked went away, kept for the last few, so a
 * stale id gets an answer instead of one message covering "you collected it",
 * "you abandoned it" and "it ran too long" alike. Live testing could not tell
 * those apart, and they call for different next moves.
 */
const gone = new Map<string, string>();
const GONE_KEEP = 50;

/** Drop a parked call, remembering what became of it. */
function forget(p: Parked, why: string): void {
  parked.delete(p.id);
  gone.set(p.id, `${p.tool} was ${why}`);
  if (gone.size > GONE_KEEP) gone.delete(gone.keys().next().value!);
}

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
  for (const p of parked.values()) {
    if (p.settledAt === undefined) {
      // Past the cap the result is given up on, and the chart lock with it.
      // A scrape can fail to settle at all, and an entry kept for one would
      // block switch_proxy_target for the life of the process with no call
      // able to clear it.
      if (now - p.startedAt >= MAX_RUN_MS) forget(p, 'given up on after running 10 minutes');
    } else if (p.abandoned) {
      forget(p, 'abandoned, and its result discarded when it finished');
    } else if (now - p.settledAt >= MAX_RUN_MS) {
      forget(p, 'left uncollected for 10 minutes after it finished, and dropped');
    }
  }
}

function describe(p: Parked, now: number): string {
  const state =
    p.settledAt !== undefined ? 'finished, result unread'
      : p.abandoned ? `abandoned, but still reading after ${elapsed(p.startedAt, now)}`
        : `running for ${elapsed(p.startedAt, now)}`;
  return `${p.tool} (id "${p.id}", ${state}${p.account ? `, on ${p.account}` : ''})`;
}

/** Every parked call, oldest first — what blocks a repeat or a proxy switch. */
function listing(now: number): string {
  const all = [...parked.values()].sort((a, b) => a.startedAt - b.startedAt);
  return all.length ? all.map((p) => describe(p, now)).join('; ') : 'nothing is pending';
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
  { id, wait, abandon }: { id?: string; wait?: boolean; abandon?: boolean },
  deadlineMs = DEADLINE_MS,
): Promise<CallToolResult> {
  const now = Date.now();
  sweep(now);
  // The listing is read through the same sweep as every guard, so what it says
  // is pending is exactly what can be blocking a repeat or a proxy switch.
  if (id === undefined) return text(`Pending calls: ${listing(now)}.`);
  const p = parked.get(id);
  if (!p) {
    const why = gone.get(id) ?? 'no call with that id was parked here';
    return text(`No pending call has id "${id}": ${why}, and it is holding nothing. Pending calls: ${listing(now)}.`, true);
  }

  if (abandon) {
    if (p.settledAt !== undefined) {
      forget(p, 'abandoned, and its finished result discarded unread');
      return text(`Abandoned ${p.tool}: its finished result was discarded unread.`);
    }
    p.abandoned = true;
    const guard = p.account
      ? ` switch_proxy_target on ${p.account} refuses until the read finishes; call ${CHECK_TOOL} with this id again to wait for that.`
      : '';
    return text(`Abandoned ${p.tool}. ${ABANDON_MEANS}${guard}`);
  }

  // An abandoned call's result is not the caller's any more, but its scrape is
  // still reading the chart, so waiting here is how they see the account come
  // free — which is exactly what switch_proxy_target's refusal tells them to
  // do. Short-circuiting here instead left that instruction unfollowable.
  const discarded = p.abandoned === true;

  // A wait that would run past the cap is cut to the cap, and running that
  // out means the cap is reached even if the test clock never moved.
  const remaining = MAX_RUN_MS - (now - p.startedAt);
  const clipped = remaining <= deadlineMs;
  const result = p.result ?? (wait === false ? undefined : await settleWithin(p.promise, clipped ? remaining : deadlineMs));
  if (result) {
    forget(p, discarded ? 'abandoned, and its result discarded when it finished' : 'collected');
    if (!discarded) return result;
    const freed = p.account ? ` switch_proxy_target on ${p.account} is free again.` : '';
    return text(`${p.tool} has finished, and its result was discarded because the call was abandoned.${freed}`);
  }
  if (wait !== false && clipped) {
    forget(p, 'given up on after running 10 minutes');
    return text(`Gave up on ${p.tool} after 10 minutes. Its result is discarded and this account is no longer held. ${ABANDON_MEANS}`, true);
  }
  const how = discarded
    ? `Its result will be discarded, because it was abandoned. Call ${CHECK_TOOL} again to wait for the account to come free.`
    : `Call ${CHECK_TOOL} again to keep waiting, or with abandon: true to stop waiting. ${ABANDON_MEANS}`;
  return text(`${p.tool} (id "${id}") is still running (${elapsed(p.startedAt, Date.now())} so far, of at most 10 minutes). ${how}`);
}

/** Test seam. */
export function resetPendingCalls(): void {
  parked.clear();
  gone.clear();
}
