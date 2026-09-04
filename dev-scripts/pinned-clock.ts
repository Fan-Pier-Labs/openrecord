/**
 * A fixed clock for scripts whose output is committed.
 *
 * The scrapers ask the system for a few of the values they send — vitals'
 * `endInstantIso`, past-visits' `oldestRenderedDate` — and those land verbatim
 * in the raw records `generate-processor-examples.ts` writes into
 * `docs/processor-layer-examples.md`. Left alone, the doc therefore changes on
 * days nothing else did, and CI's "regenerate and `git diff --exit-code`" step
 * fails on every PR that happens to stay open across midnight, with a diff that
 * contains no processor change at all. It would likewise differ between a
 * developer's machine and CI's UTC runner, since those values are formatted in
 * local time. Pinning the instant AND the zone makes a regeneration
 * byte-identical wherever and whenever it runs.
 *
 * The fake-mychart server needs no such pin: every read it answers is served
 * from static fixtures, so its responses don't move with the calendar either.
 *
 * It does have to be the *container*, though. `raw` mode records each response's
 * `Content-Type` verbatim, and a `bun run start` in a worktree sends
 * `application/json` where the image `docker-compose.ci.yaml` builds sends
 * `application/json;charset=utf-8` — so regenerating against a local dev server
 * produces a doc CI will reject, with a diff in capabilities the PR never
 * touched. Bring the compose service up and regenerate against that.
 */

/**
 * 2026-02-01T00:00:00Z, the instant these scripts pretend is "now".
 *
 * Chosen to sit after the newest past-visit fixture (2026-01-10) and before the
 * earliest upcoming one (2026-04-08), so "past" and "upcoming" in the generated
 * examples still mean what they say, and after every vitals reading, so the
 * paginating vitals scraper still walks the whole history.
 */
export const DEFAULT_SOURCE_DATE_EPOCH = 1_769_904_000;

/** `SOURCE_DATE_EPOCH` if set (the reproducible-builds convention), else the constant above. */
export function sourceDateEpoch(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.SOURCE_DATE_EPOCH;
  if (raw === undefined || raw === '') return DEFAULT_SOURCE_DATE_EPOCH;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds)) throw new Error(`SOURCE_DATE_EPOCH is not a number of seconds: ${raw}`);
  return seconds;
}

/**
 * Freeze `new Date()` and `Date.now()` at `epochSeconds`, in UTC, for this process.
 *
 * Every other use of `Date` is untouched: `new Date(anything)` still parses
 * what it is given, and the statics (`Date.UTC`, `Date.parse`) still answer
 * normally. Returns the undo, so a test can put the real clock back.
 */
export function pinClock(epochSeconds: number = sourceDateEpoch(), timeZone = 'UTC'): () => void {
  const realDate = globalThis.Date;
  // Resolved rather than read, because `delete process.env.TZ` doesn't put the
  // system zone back — after a delete, Bun ignores every later TZ change in the
  // process. Restoring an explicit zone keeps the undo honest and repeatable.
  const realTimeZone = process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const fixedMs = epochSeconds * 1000;

  // Bun and Node both re-read process.env.TZ, so this moves `new Date()`'s
  // local-time getters — which is what the date-stamping scrapers format with.
  process.env.TZ = timeZone;
  globalThis.Date = new Proxy(realDate, {
    construct: (target, args, newTarget) =>
      Reflect.construct(target, args.length === 0 ? [fixedMs] : args, newTarget) as Date,
    get: (target, prop, receiver) => (prop === 'now' ? () => fixedMs : Reflect.get(target, prop, receiver)),
  });

  return () => {
    globalThis.Date = realDate;
    process.env.TZ = realTimeZone;
  };
}
