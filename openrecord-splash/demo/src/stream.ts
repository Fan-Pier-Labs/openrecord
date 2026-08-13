/**
 * Reveals a finished reply at the pace a model would have produced it.
 *
 * The agent loop can only hand back a whole turn — the proxy returns complete
 * text, and the scripted engine builds its string in one go. Dropping that in
 * at once reads as canned, which undersells the thing the demo is showing. So
 * the text is revealed on a timer instead, at a rate matched to a fast model.
 *
 * The quantisation matters as much as the rate: real streaming arrives a token
 * at a time, so text lands in small jumps rather than letter by letter. Pure
 * character-at-a-time reveal reads as a typewriter, which is a different and
 * more artificial effect.
 */

/**
 * Roughly 55 tokens/sec at ~4 characters per token — the ballpark for a fast,
 * small model, which is what the demo runs on.
 */
export const CHARS_PER_SECOND = 220;

/** Average characters per token; the granularity text appears in. */
export const CHARS_PER_TOKEN = 4;

/**
 * How much of `total` should be visible after `elapsedMs`, rounded down to a
 * token boundary. Pure, so the pacing is testable without timers.
 */
export function visibleLength(
  total: number,
  elapsedMs: number,
  charsPerSecond: number = CHARS_PER_SECOND,
): number {
  if (elapsedMs <= 0) return 0;
  const raw = (elapsedMs / 1000) * charsPerSecond;
  const quantised = Math.floor(raw / CHARS_PER_TOKEN) * CHARS_PER_TOKEN;
  return Math.max(0, Math.min(total, quantised));
}

/** Total time a reply of this length takes to reveal. */
export function streamDurationMs(total: number, charsPerSecond: number = CHARS_PER_SECOND): number {
  return (total / charsPerSecond) * 1000;
}

/**
 * Frame scheduling.
 *
 * Deliberately `setTimeout` and not `requestAnimationFrame`. rAF is paused
 * entirely while a tab is in the background, so a visitor who switches away
 * mid-reply comes back to a message frozen half-written and a composer still
 * disabled. Timers are merely throttled — the reveal finishes either way, just
 * more coarsely — and they work outside a DOM, so this is testable.
 *
 * The reveal is time-based rather than step-based, so throttling costs
 * smoothness but never correctness: whatever the tick rate, the visible length
 * is always derived from elapsed time.
 */
const FRAME_MS = 16;

function scheduleFrame(fn: () => void): number {
  return setTimeout(fn, FRAME_MS) as unknown as number;
}

function cancelFrame(handle: number): void {
  clearTimeout(handle);
}

function now(): number {
  return typeof performance === 'object' ? performance.now() : Date.now();
}

export type StreamOptions = {
  charsPerSecond?: number;
  /** Aborts the reveal; the caller is expected to show the full text itself. */
  signal?: AbortSignal;
};

/**
 * Call `onUpdate` with a growing prefix of `text` until it is fully revealed.
 *
 * Resolves once the whole string has been emitted. If `signal` aborts, it
 * resolves early *without* a final full-text update — cancelling usually means
 * the caller is replacing the message entirely.
 */
export function streamText(
  text: string,
  onUpdate: (visible: string) => void,
  { charsPerSecond = CHARS_PER_SECOND, signal }: StreamOptions = {},
): Promise<void> {
  return new Promise((resolve) => {
    if (!text) {
      onUpdate('');
      resolve();
      return;
    }
    if (signal?.aborted) {
      resolve();
      return;
    }

    const started = now();
    let shown = 0;
    let frame = 0;
    let stopped = false;

    const stop = () => {
      stopped = true;
      cancelFrame(frame);
      signal?.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      stop();
      resolve();
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    const tick = () => {
      const next = visibleLength(text.length, now() - started, charsPerSecond);
      // Only paint when a new token's worth has landed, so React isn't
      // re-rendering the whole thread every frame for no visible change.
      if (next > shown) {
        shown = next;
        onUpdate(text.slice(0, shown));
      }
      if (shown >= text.length) {
        stop();
        onUpdate(text);
        resolve();
        return;
      }
      // An abort raised from inside `onUpdate` lands here, mid-tick, after
      // `cancelFrame` has already had its chance at the handle that fired.
      // Without this check the reveal would schedule itself a fresh frame and
      // run on, invisibly, past its own cancellation.
      if (stopped) return;
      frame = scheduleFrame(tick);
    };

    frame = scheduleFrame(tick);
  });
}
