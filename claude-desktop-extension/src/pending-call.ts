/**
 * A tool call that outruns Claude Desktop's patience is parked here, and its
 * result collected by id with `check_pending_call`.
 *
 * Claude Desktop cancels a request it has waited too long on. The one
 * measurement on record is in its own client log (`~/Library/Logs/Claude/
 * mcp.log`): a `notifications/cancelled` carrying "MCP error -32001: Request
 * timed out", sent 197 s after the request, on the June 2026 build. Whether
 * `tools/call` shares that limit is unmeasured, and the figure usually quoted
 * is four minutes. `DEADLINE_MS` sits under both, and above the scrapers'
 * own 2-minute per-request deadline (`scrapers/http.ts`). A chart read that
 * pages through years of billing or pulls an imaging study can take longer,
 * so every registered tool runs under it: answer in time and the caller sees
 * the result as usual; miss it and the call keeps running here while the
 * caller gets a note with an id to collect the result by.
 *
 * Nothing is serialized. Claude Desktop dispatches the tool calls of one
 * turn as they stream, without waiting for the earlier ones to answer (its
 * log shows a second call issued 5.5 s after a first that had not answered),
 * so several calls can be running at once and more than one can park. What
 * a parked call blocks is exactly one thing: an identical call — same tool,
 * same arguments — while it is still running or its result is unread. That
 * is the retry, and a retried send_message is a second message to the
 * doctor. A call that is still inside the deadline blocks nothing, because
 * the host has not failed anything there is a reason to retry.
 *
 * The other guard is `switch_proxy_target`: MyChart's active patient is
 * server-side state, so a switch under a still-running parked read would
 * hand that read the wrong family member's chart. `unsettledCallOnAccount`
 * is what the switch asks before it runs, and it keeps answering for an
 * abandoned call until the scrape actually finishes.
 *
 * "Abandon" is exactly that. Nothing in the scraper core takes an abort
 * signal, so abandoning a call stops waiting for it and discards its result;
 * the work itself runs on to completion in the background, and a write that
 * was already sent still lands. Every string that offers the option says so.
 */

import { randomUUID } from 'crypto';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export const CHECK_TOOL = 'check_pending_call';
export const DEADLINE_MS = 150_000;
export const DEADLINE_LABEL = '2.5 minutes';
/** Measured from the original call's start; after this it is given up on. */
export const MAX_RUN_MS = 10 * 60_000;
/** How long an unread result is kept after it lands. */
const KEEP_RESULT_MS = 10 * 60_000;

interface Parked {
  id: string;
  tool: string;
  /** Tool plus canonical arguments; what "the same call" means. */
  key: string;
  account: string | null;
  startedAt: number;
  promise: Promise<CallToolResult>;
  result?: CallToolResult;
  settledAt?: number;
  /**
   * Set when nobody is waiting for this call any more. The entry stays until
   * the promise settles so the proxy-switch guard still sees the scrape.
   */
  abandoned?: 'user' | 'cap';
}

const parked = new Map<string, Parked>();

function text(message: string, isError = false): CallToolResult {
  return { content: [{ type: 'text', text: message }], ...(isError ? { isError: true } : {}) };
}

function elapsed(startedAt: number, now: number): string {
  const secs = Math.max(0, Math.round((now - startedAt) / 1000));
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

const ABANDON_MEANS =
  'Abandoning only stops waiting: the work runs on in the background until it finishes on its own, ' +
  'and a message or request it already sent still lands.';

/** Sorted keys at every level, so argument order cannot make two calls differ. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

function accountOf(args: Record<string, unknown>): string | null {
  return typeof args.account === 'string' ? args.account.trim().toLowerCase() : null;
}

/** The result if it arrives within `ms`, else undefined. Never rejects. */
function settleWithin(promise: Promise<CallToolResult>, ms: number): Promise<CallToolResult | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

/** Drop what nobody can collect any more; give up on what has run too long. */
function sweep(now: number): void {
  for (const [id, p] of parked) {
    const settled = p.settledAt !== undefined;
    if (settled && p.abandoned) parked.delete(id);
    else if (settled && now - p.settledAt! >= KEEP_RESULT_MS) parked.delete(id);
    else if (!settled && !p.abandoned && now - p.startedAt >= MAX_RUN_MS) p.abandoned = 'cap';
  }
}

function describe(p: Parked, now: number): string {
  const state = p.settledAt !== undefined ? 'finished, result unread' : `running for ${elapsed(p.startedAt, now)}`;
  return `${p.tool} (id "${p.id}", ${state})`;
}

/** The parked calls a caller can still collect, oldest first. */
function collectable(): Parked[] {
  return [...parked.values()].filter((p) => !p.abandoned).sort((a, b) => a.startedAt - b.startedAt);
}

/**
 * Run a tool's handler under the deadline. `deadlineMs` is the test seam.
 */
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
    if (same.settledAt !== undefined) {
      return text(
        `This exact call already ran and its result is waiting to be read: ${describe(same, now)}. ` +
          `Call ${CHECK_TOOL} with id "${same.id}" to receive it instead of running it again.`,
        true,
      );
    }
    return text(
      `This exact call is already running: ${describe(same, now)}, of at most 10 minutes. Do NOT run it ` +
        `again. Call ${CHECK_TOOL} with id "${same.id}" to wait for its result (up to ${DEADLINE_LABEL} per ` +
        'call), or with abandon: true to stop waiting for it.',
      true,
    );
  }

  const promise = Promise.resolve()
    .then(fn)
    .catch((err: unknown) => text(`Error: ${(err as Error).message}`, true));
  const result = await settleWithin(promise, deadlineMs);
  if (result) return result;

  const entry: Parked = { id: randomUUID(), tool, key, account: accountOf(args), startedAt: now, promise };
  parked.set(entry.id, entry);
  void promise.then((r) => {
    entry.result = r;
    entry.settledAt = Date.now();
  });
  return text(
    `${tool} (id "${entry.id}") is still running after ${DEADLINE_LABEL} and keeps running here in the ` +
      `background, for up to 10 minutes in total. Call ${CHECK_TOOL} with that id to wait for its result and ` +
      `read it. Do NOT call ${tool} again with the same arguments — it is already running, and would be ` +
      'refused. Other tools are not affected.',
  );
}

/**
 * The parked call still reading this account's chart, if any — including
 * one that was abandoned, since abandoning does not stop the scrape.
 */
export function unsettledCallOnAccount(account: string): { tool: string; id: string; startedAt: number } | undefined {
  sweep(Date.now());
  const wanted = account.trim().toLowerCase();
  const p = [...parked.values()].find((c) => c.settledAt === undefined && c.account === wanted);
  return p ? { tool: p.tool, id: p.id, startedAt: p.startedAt } : undefined;
}

/**
 * The `check_pending_call` handler: hand back the result if it is in, wait
 * for it if asked, or abandon it. `deadlineMs` is the test seam.
 */
export async function checkPendingCall(
  args: { id?: string; wait?: boolean; abandon?: boolean },
  deadlineMs = DEADLINE_MS,
): Promise<CallToolResult> {
  const now = Date.now();
  sweep(now);

  let p: Parked | undefined;
  if (args.id) {
    p = parked.get(args.id);
    if (!p) {
      const others = collectable();
      return text(
        `No pending call has id "${args.id}". ` +
          (others.length
            ? `Pending: ${others.map((o) => describe(o, now)).join('; ')}.`
            : 'No tool call is pending; every tool is available.'),
        true,
      );
    }
  } else {
    const candidates = collectable();
    if (candidates.length === 0) return text('No tool call is pending. Every tool is available.');
    if (candidates.length > 1) {
      return text(
        `${candidates.length} calls are pending; pass the id of the one you want: ` +
          candidates.map((c) => describe(c, now)).join('; ') +
          '.',
      );
    }
    p = candidates[0]!;
  }

  if (args.abandon) {
    if (p.settledAt !== undefined) {
      parked.delete(p.id);
      return text(`Abandoned ${p.tool} (id "${p.id}"): its finished result was discarded unread.`);
    }
    p.abandoned = 'user';
    return text(
      `Abandoned ${p.tool} (id "${p.id}") after ${elapsed(p.startedAt, now)}. ${ABANDON_MEANS}` +
        (p.account
          ? ` Until it finishes, switch_proxy_target on ${p.account} refuses, because the scrape is still reading whichever patient is active.`
          : ''),
    );
  }

  if (p.abandoned === 'user') {
    return text(`${p.tool} (id "${p.id}") was abandoned; its result will be discarded. ${ABANDON_MEANS}`, true);
  }

  if (p.settledAt !== undefined) {
    parked.delete(p.id);
    return p.result!;
  }

  const entry = p;
  const gaveUp = (): CallToolResult => {
    entry.abandoned = 'cap';
    return text(
      `Gave up on ${entry.tool} (id "${entry.id}") after 10 minutes; whatever it returns from here is discarded. ` +
        ABANDON_MEANS,
      true,
    );
  };
  if (p.abandoned === 'cap') return gaveUp();

  const remaining = MAX_RUN_MS - (now - p.startedAt);
  // A wait that would run past the cap is cut to the cap, and running it out
  // means the cap is reached even if the test clock never moved.
  const clipped = remaining <= deadlineMs;
  const waitMs = args.wait === false ? 0 : clipped ? remaining : deadlineMs;
  const result = waitMs > 0 ? await settleWithin(p.promise, waitMs) : undefined;
  if (result) {
    parked.delete(p.id);
    return result;
  }
  const later = Date.now();
  if (later - p.startedAt >= MAX_RUN_MS || (waitMs > 0 && clipped)) return gaveUp();
  return text(
    `${p.tool} (id "${p.id}") is still running (${elapsed(p.startedAt, later)} so far, of at most 10 minutes). ` +
      `Call ${CHECK_TOOL} with this id again to keep waiting, or with abandon: true to stop waiting for it. ` +
      ABANDON_MEANS,
  );
}

/** Test seam: forget every parked call. */
export function resetPendingCalls(): void {
  parked.clear();
}
