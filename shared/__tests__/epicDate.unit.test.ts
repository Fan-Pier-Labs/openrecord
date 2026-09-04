/**
 * Epic serialises dates as day numbers — `dte` in billing, `Dat` on visits,
 * `Dte` in the anonymous scheduler — counted from 1840-12-31, the mainframe
 * epoch, which sits 47,117 days before the Unix epoch.
 */
import { describe, it, expect } from 'bun:test';

import {
  EPIC_EPOCH_UTC,
  fromEpicDte,
  fromEpicDteLocal,
  toEpicDte,
  toEpicDteLocal,
} from '../epicDate';

const UNIX_EPOCH_AS_DTE = 47117;

describe('EPIC_EPOCH_UTC', () => {
  it('is 1840-12-31, and day 0', () => {
    expect(new Date(EPIC_EPOCH_UTC).toISOString().slice(0, 10)).toBe('1840-12-31');
    expect(toEpicDte(new Date(EPIC_EPOCH_UTC))).toBe(0);
    expect(toEpicDteLocal(new Date(1840, 11, 31))).toBe(0);
  });
});

describe('toEpicDte', () => {
  it('round-trips the epoch a live response confirmed', () => {
    // Dte 67821 came back on a live slot dated 2026-09-08.
    expect(toEpicDte(new Date('2026-09-08T00:00:00Z'))).toBe(67821);
    expect(fromEpicDte(67821).toISOString().slice(0, 10)).toBe('2026-09-08');
  });

  it('ignores the time of day within a UTC day', () => {
    expect(toEpicDte(new Date('2026-09-08T23:59:59Z'))).toBe(toEpicDte(new Date('2026-09-08T00:00:01Z')));
  });

  it('maps the Unix epoch to the known offset', () => {
    expect(toEpicDte(new Date('1970-01-01T00:00:00Z'))).toBe(UNIX_EPOCH_AS_DTE);
  });

  it('counts backwards before the Unix epoch', () => {
    expect(toEpicDte(new Date('1969-12-31T00:00:00Z'))).toBe(UNIX_EPOCH_AS_DTE - 1);
  });
});

describe('toEpicDteLocal', () => {
  it('reads the local calendar date, not the UTC one', () => {
    // 9pm on the 8th locally is already the 9th in UTC; a scheduling search
    // started from the UTC day silently skips the rest of today's slots.
    const evening = new Date(2026, 8, 8, 21, 0, 0);
    expect(toEpicDteLocal(evening)).toBe(toEpicDte(new Date('2026-09-08T00:00:00Z')));
  });

  it('maps 1970-01-01 to the known offset', () => {
    expect(toEpicDteLocal(new Date(1970, 0, 1))).toBe(UNIX_EPOCH_AS_DTE);
  });

  it('ignores the time component of the input', () => {
    expect(toEpicDteLocal(new Date(2024, 5, 15, 1, 2, 3, 4))).toBe(
      toEpicDteLocal(new Date(2024, 5, 15, 23, 59, 59, 999)),
    );
  });

  it('returns a whole number of days', () => {
    expect(Number.isInteger(toEpicDteLocal(new Date(2024, 5, 15)))).toBe(true);
  });

  it('advances exactly one per calendar day, across month and leap-day edges', () => {
    const day = (y: number, m: number, d: number) => toEpicDteLocal(new Date(y, m, d));
    expect(day(2024, 5, 16) - day(2024, 5, 15)).toBe(1);
    expect(day(2024, 2, 1) - day(2024, 1, 29)).toBe(1); // leap year: Feb 29 → Mar 1
    expect(day(2023, 2, 1) - day(2023, 1, 28)).toBe(1); // non-leap: Feb 28 → Mar 1
  });

  it('counts 365 days in a normal year and 366 in a leap year', () => {
    const jan1 = (y: number) => toEpicDteLocal(new Date(y, 0, 1));
    expect(jan1(2024) - jan1(2023)).toBe(365);
    expect(jan1(2025) - jan1(2024)).toBe(366);
  });
});

describe('fromEpicDte', () => {
  it('lands on UTC midnight', () => {
    expect(fromEpicDte(UNIX_EPOCH_AS_DTE).toISOString()).toBe('1970-01-01T00:00:00.000Z');
  });
});

describe('fromEpicDteLocal', () => {
  it('maps the mainframe/Unix epoch offset to 1970-01-01', () => {
    const date = fromEpicDteLocal(UNIX_EPOCH_AS_DTE);
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([1970, 0, 1]);
  });

  it('returns local midnight, not a time-of-day', () => {
    const date = fromEpicDteLocal(UNIX_EPOCH_AS_DTE + 12345);
    expect([date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds()]).toEqual([
      0, 0, 0, 0,
    ]);
  });

  it('advances exactly one calendar day per unit', () => {
    const first = fromEpicDteLocal(UNIX_EPOCH_AS_DTE + 100);
    const next = fromEpicDteLocal(UNIX_EPOCH_AS_DTE + 101);
    expect(next.getDate()).toBe(first.getDate() + 1);
  });

  it('handles dates before the Unix epoch', () => {
    // 1841-01-01 is one day after the mainframe epoch itself.
    const date = fromEpicDteLocal(1);
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([1841, 0, 1]);
  });
});

describe('local round-trip', () => {
  it('preserves the calendar date across a range of years', () => {
    const samples = [
      new Date(1900, 0, 1),
      new Date(1969, 11, 31),
      new Date(1970, 0, 1),
      new Date(2000, 1, 29),
      new Date(2024, 1, 29),
      new Date(2024, 6, 4),
      new Date(2099, 11, 31),
      new Date(2100, 0, 1),
    ];

    for (const original of samples) {
      const roundTripped = fromEpicDteLocal(toEpicDteLocal(original));
      expect([roundTripped.getFullYear(), roundTripped.getMonth(), roundTripped.getDate()]).toEqual([
        original.getFullYear(),
        original.getMonth(),
        original.getDate(),
      ]);
    }
  });
});
