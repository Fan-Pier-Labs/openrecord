/**
 * Reply pacing.
 *
 * The proxy hands back a whole turn at once, so the UI reveals it on a timer to
 * match the rate a model would have produced it. The pacing maths is pure and
 * tested here directly; `streamText` is driven at a rate high enough that it
 * finishes within a frame or two, and cancellation is triggered from the update
 * callback rather than by waiting out a wall-clock delay.
 */

import { describe, expect, test } from 'bun:test';
import { CHARS_PER_SECOND, CHARS_PER_TOKEN, streamDurationMs, streamText, visibleLength } from '../src/stream';

describe('visibleLength', () => {
  test('reveals nothing before any time has passed', () => {
    expect(visibleLength(100, 0)).toBe(0);
    expect(visibleLength(100, -50)).toBe(0);
  });

  test('reveals at the configured rate', () => {
    // One second at 220 chars/sec, quantised down to a token boundary.
    const oneSecond = visibleLength(1000, 1000);
    expect(oneSecond).toBeLessThanOrEqual(CHARS_PER_SECOND);
    expect(oneSecond).toBeGreaterThan(CHARS_PER_SECOND - CHARS_PER_TOKEN);
  });

  test('lands on token boundaries, so text arrives in jumps not letters', () => {
    for (const elapsed of [120, 350, 700, 1234]) {
      expect(visibleLength(5000, elapsed) % CHARS_PER_TOKEN).toBe(0);
    }
  });

  test('never exceeds the text length', () => {
    expect(visibleLength(10, 60_000)).toBe(10);
  });

  test('honours a custom rate', () => {
    expect(visibleLength(10_000, 1000, 1000)).toBe(1000);
    expect(visibleLength(10_000, 1000, 100)).toBe(100);
  });

  test('is monotonic — text never un-reveals', () => {
    let previous = 0;
    for (let elapsed = 0; elapsed <= 3000; elapsed += 37) {
      const current = visibleLength(2000, elapsed);
      expect(current).toBeGreaterThanOrEqual(previous);
      previous = current;
    }
  });
});

describe('streamDurationMs', () => {
  test('scales linearly with length', () => {
    expect(streamDurationMs(CHARS_PER_SECOND)).toBeCloseTo(1000, 5);
    expect(streamDurationMs(CHARS_PER_SECOND * 3)).toBeCloseTo(3000, 5);
  });

  test('a typical reply takes a believable amount of time', () => {
    // ~600 characters is a normal answer; it should feel like a model typing,
    // not an instant paste and not a minute of waiting.
    const ms = streamDurationMs(600);
    expect(ms).toBeGreaterThan(1500);
    expect(ms).toBeLessThan(5000);
  });
});

describe('streamText', () => {
  test('emits growing prefixes and ends on the full text', async () => {
    const seen: string[] = [];
    // A high rate keeps the test fast; the pacing itself is covered above.
    await streamText('Your A1c is 7.2%.', (visible) => seen.push(visible), { charsPerSecond: 100_000 });

    expect(seen.length).toBeGreaterThan(0);
    expect(seen.at(-1)).toBe('Your A1c is 7.2%.');
    // Every emission is a prefix of the final text, in order.
    for (const [i, visible] of seen.entries()) {
      expect('Your A1c is 7.2%.'.startsWith(visible)).toBe(true);
      if (i > 0) expect(visible.length).toBeGreaterThanOrEqual(seen[i - 1]!.length);
    }
  });

  test('empty text resolves immediately with one empty emission', async () => {
    const seen: string[] = [];
    await streamText('', (v) => seen.push(v));
    expect(seen).toEqual(['']);
  });

  test('an already-aborted signal emits nothing', async () => {
    const controller = new AbortController();
    controller.abort();
    const seen: string[] = [];
    await streamText('never shown', (v) => seen.push(v), { signal: controller.signal });
    expect(seen).toEqual([]);
  });

  test('aborting part-way stops without jumping to the full text', async () => {
    const controller = new AbortController();
    const seen: string[] = [];
    // Abort on the first painted frame rather than after a fixed wall-clock
    // delay. What's under test is what happens *after* an abort, and hanging
    // that on "60ms should be long enough to have painted something, but short
    // enough not to have finished" makes it a race on both ends.
    await streamText(
      'a'.repeat(4000),
      (v) => {
        seen.push(v);
        controller.abort();
      },
      { charsPerSecond: 400, signal: controller.signal },
    );

    // Cancelling means the caller is replacing the message; it must not be
    // "helpfully" completed first.
    expect(seen).not.toBeEmpty();
    expect(seen.at(-1)!.length).toBeLessThan(4000);
  });

  test('an abort raised from onUpdate stops the reveal for good', async () => {
    const controller = new AbortController();
    const seen: string[] = [];
    await streamText('b'.repeat(4000), (v) => { seen.push(v); controller.abort(); }, {
      charsPerSecond: 400,
      signal: controller.signal,
    });
    const atAbort = seen.length;

    // Nothing more may be painted once the reveal has been cancelled — an
    // aborted stream that keeps ticking writes into a message the caller has
    // already replaced. This is the one wait here that has to be real: proving
    // an absence needs elapsed frames. Three of them is plenty, and the failure
    // mode is one-sided — a loaded machine can only ever make this pass, never
    // flake red.
    await new Promise((r) => {
      setTimeout(r, 3 * 16);
    });
    expect(seen.length).toBe(atAbort);
  });
});
