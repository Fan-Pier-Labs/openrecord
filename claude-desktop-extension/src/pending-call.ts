/**
 * One tool call at a time, and none of them may outlive Claude Desktop's
 * patience.
 *
 * Claude Desktop drops a tool call that has not answered in about four
 * minutes, and a chart read that pages through years of billing or a
 * multi-series imaging study can take longer. Every registered tool therefore
 * runs under a 3.5-minute deadline: answer in time and the caller sees the
 * result as usual; miss it and the call keeps running here while the caller
 * gets a note to collect the result with `check_pending_call`.
 *
 * There is one slot, not a queue. While a call is running, or has finished
 * and not yet been read, every other tool refuses and points at
 * check_pending_call. That is what keeps a background read safe: MyChart's
 * active patient is server-side state, and a switch_proxy_target that ran
 * mid-read would hand the read the wrong chart. With the slot held, nothing
 * else can run — and a model that retries the timed-out tool gets the
 * refusal instead of a second copy of the work, which for send_message would
 * have been a second message to the doctor.
 *
 * "Abandon" is exactly that. Nothing in the scraper core takes an abort
 * signal, so abandoning a call stops waiting for it and discards its result;
 * the work itself runs on to completion in the background, and a write that
 * was already sent still lands. Every string that offers the option says so.
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export const CHECK_TOOL = 'check_pending_call';
/** Under Claude Desktop's ~4-minute limit with margin for the trip back. */
export const DEADLINE_MS = 3.5 * 60_000;
/** Measured from the original call's start; after this it is abandoned. */
export const MAX_RUN_MS = 10 * 60_000;

interface Slot {
  tool: string;
  startedAt: number;
  promise: Promise<CallToolResult>;
  /** Set once the call settles; the slot then holds an unread result. */
  result?: CallToolResult;
}

let slot: Slot | null = null;

function text(message: string, isError = false): CallToolResult {
  return { content: [{ type: 'text', text: message }], ...(isError ? { isError: true } : {}) };
}

function elapsed(s: Slot, now: number): string {
  const secs = Math.max(0, Math.round((now - s.startedAt) / 1000));
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

const ABANDON_MEANS =
  'Abandoning only stops waiting: the work runs on in the background until it finishes on its own, ' +
  'and a message or request it already sent still lands.';

/** The result if it arrives within `ms`, else undefined. Never rejects. */
function settleWithin(promise: Promise<CallToolResult>, ms: number): Promise<CallToolResult | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

/**
 * Run a tool's handler under the deadline. `deadlineMs` is the test seam.
 *
 * The slot is taken for the whole run, not only after the deadline passes:
 * Claude Desktop runs one server for every conversation, so a call from a
 * second chat while the first is mid-read must refuse too.
 */
export async function runGuarded(
  tool: string,
  fn: () => CallToolResult | Promise<CallToolResult>,
  deadlineMs = DEADLINE_MS,
): Promise<CallToolResult> {
  const now = Date.now();
  if (slot) {
    if (slot.result) {
      return text(
        `The result of ${slot.tool} is finished and waiting to be read. Call ${CHECK_TOOL} to receive it; ` +
          'every other tool refuses until it has been read or abandoned.',
        true,
      );
    }
    if (now - slot.startedAt < MAX_RUN_MS) {
      return text(
        `${slot.tool} is still running (started ${elapsed(slot, now)} ago). Only one tool call runs at a time, ` +
          `and it may take up to 10 minutes. Call ${CHECK_TOOL} to wait for its result (up to 3.5 minutes per ` +
          `call), or ${CHECK_TOOL} with abandon: true to stop waiting for it. Do NOT call ${slot.tool} again; ` +
          'it is already running.',
        true,
      );
    }
    // Past the cap: treated as abandoned, whatever it is still doing.
    slot = null;
  }

  const promise = Promise.resolve()
    .then(fn)
    .catch((err: unknown) => text(`Error: ${(err as Error).message}`, true));
  const mine: Slot = { tool, startedAt: now, promise };
  slot = mine;
  void promise.then((result) => {
    mine.result = result;
  });

  const result = await settleWithin(promise, deadlineMs);
  if (result) {
    if (slot === mine) slot = null;
    return result;
  }
  return text(
    `${tool} is still running after ${elapsed(mine, Date.now())} and keeps running here in the background, ` +
      `for up to 10 minutes in total. Call ${CHECK_TOOL} to wait for its result and read it. Do NOT call ` +
      `${tool} again — it is already running — and every other tool refuses until this result is read or abandoned.`,
  );
}

/**
 * The `check_pending_call` handler: hand back the result if it is in, wait
 * for it if asked, or abandon it. `deadlineMs` is the test seam.
 */
export async function checkPendingCall(
  args: { wait?: boolean; abandon?: boolean },
  deadlineMs = DEADLINE_MS,
): Promise<CallToolResult> {
  const s = slot;
  const now = Date.now();
  if (!s) return text('No tool call is pending. Every tool is available.');

  if (args.abandon) {
    slot = null;
    const what = s.result ? 'its finished result was discarded unread' : `it had been running for ${elapsed(s, now)}`;
    return text(`Abandoned ${s.tool}: ${what}. ${ABANDON_MEANS} Every tool is available again.`);
  }

  if (s.result) {
    slot = null;
    return s.result;
  }

  const remaining = MAX_RUN_MS - (now - s.startedAt);
  const waitMs = args.wait === false ? 0 : Math.min(deadlineMs, remaining);
  const result = waitMs > 0 ? await settleWithin(s.promise, waitMs) : s.result;
  if (result) {
    if (slot === s) slot = null;
    return result;
  }

  // Either the clock says the cap is reached, or the wait just ran out the
  // whole of what the cap allowed — the same fact, told by the timer.
  const later = Date.now();
  if (later - s.startedAt >= MAX_RUN_MS || (waitMs > 0 && waitMs === remaining)) {
    if (slot === s) slot = null;
    return text(
      `Gave up on ${s.tool} after 10 minutes; whatever it returns from here is discarded. ${ABANDON_MEANS} ` +
        'Every tool is available again.',
      true,
    );
  }
  return text(
    `${s.tool} is still running (${elapsed(s, later)} so far, of at most 10 minutes). Call ${CHECK_TOOL} again ` +
      'to keep waiting, or with abandon: true to stop waiting for it and free the other tools. ' +
      ABANDON_MEANS,
  );
}

/** Test seam: forget whatever is in the slot. */
export function resetPendingCall(): void {
  slot = null;
}
