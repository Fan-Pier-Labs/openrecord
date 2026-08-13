/**
 * Fire-and-forget for async work whose failure the user cannot see — background
 * loads, refreshes, prefetches. A bare `void promise` satisfies
 * no-floating-promises but drops the rejection on the floor: the screen simply
 * never populates and nothing says why. This logs the rejection under a stable
 * label instead.
 *
 * Not for work that surfaces its own errors (e.g. handleSend renders failures
 * into the chat) — those sites keep a plain `void`.
 */
export function fireAndForget(work: Promise<unknown>, label: string): void {
  work.catch((err: unknown) => {
    console.warn(`[${label}]`, err instanceof Error ? err.message : err);
  });
}
