/**
 * Epic's day numbers — the `dte`/`Dat`/`DTE` integers that appear all over
 * MyChart's payloads.
 *
 * Epic runs on MUMPS, whose `$HOROLOG` counts whole days from 1840-12-31
 * rather than from the Unix epoch, so a MyChart date field is usually a plain
 * integer: 0 is 1840-12-31, 47117 is 1970-01-01, and (verified against a live
 * scheduling response) 67821 is 2026-09-08. Billing calls it `dte`, the visit
 * list calls it `Dat`, the anonymous scheduler calls it `Dte` and
 * `SearchRangeStartDte` — same number every time.
 *
 * Two framings exist because MyChart itself uses both:
 *
 * - **UTC** (`toEpicDte` / `fromEpicDte`) — for a day number that came off the
 *   wire alongside a UTC instant, so the two agree.
 * - **Local** (`toEpicDteLocal` / `fromEpicDteLocal`) — for a day number the
 *   browser would have produced from the user's wall clock. Epic's own pages
 *   send the local calendar date, and deriving it from UTC skips the rest of
 *   the current day for anyone west of Greenwich in the evening: at 9pm
 *   Pacific, UTC is already tomorrow.
 *
 * Pick the one that matches where the date came from; they differ by a day
 * near the edges, which is exactly when it matters.
 */

/** 1840-12-31, the MUMPS `$HOROLOG` epoch, as a Unix timestamp in ms. */
export const EPIC_EPOCH_UTC = Date.UTC(1840, 11, 31);

const MS_PER_DAY = 86_400_000;

/**
 * UTC midnight for a calendar date, built field by field.
 *
 * `Date.UTC(year, …)` maps years 0-99 onto 1900-1999; `setUTCFullYear` does
 * not, and Epic day numbers run back past 1841.
 */
function utcMidnightMs(year: number, month: number, day: number): number {
  const at = new Date(0);
  at.setUTCFullYear(year, month, day);
  at.setUTCHours(0, 0, 0, 0);
  return at.valueOf();
}

/** The day number for the **UTC** calendar date of `date`. Time of day is ignored. */
export function toEpicDte(date: Date): number {
  const ms = utcMidnightMs(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.round((ms - EPIC_EPOCH_UTC) / MS_PER_DAY);
}

/** The day number for the **local** calendar date of `date`. Time of day is ignored. */
export function toEpicDteLocal(date: Date): number {
  const ms = utcMidnightMs(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((ms - EPIC_EPOCH_UTC) / MS_PER_DAY);
}

/** The instant of **UTC** midnight on the day `dte` names. */
export function fromEpicDte(dte: number): Date {
  return new Date(EPIC_EPOCH_UTC + dte * MS_PER_DAY);
}

/** The instant of **local** midnight on the day `dte` names. */
export function fromEpicDteLocal(dte: number): Date {
  const utc = fromEpicDte(dte);
  const local = new Date(0);
  local.setFullYear(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
  local.setHours(0, 0, 0, 0);
  return local;
}
